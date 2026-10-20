import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { createServer } from "../../../src/server/createServer.js";
import { toolContract } from "../../../src/contracts/toolContracts.js";
import type { AnalysisProvider } from "../../../src/application/AnalysisProvider.js";
import { createAnalysisProfile } from "../../../src/domain/analysisProfile.js";
import { ok } from "../../../src/domain/result.js";
import { observed } from "../../fixtures/analysisExecution.js";
import {
  createCacheProvider,
  createTestBinarySession,
} from "../../fixtures/binarySession.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { silentLogger } from "../../../src/logger.js";
import type { CallToolResult } from "@modelcontextprotocol/server";

const connect = async (
  provider: AnalysisProvider = createCacheProvider([]),
) => {
  const session = createTestBinarySession(provider);
  const server = createServer(
    { kind: "session", session },
    { logger: silentLogger },
  );
  const client = new Client({ name: "raw-binary-mcp", version: "1" });
  onTestFinished(async () => {
    await client.close();
    await server.close();
    await session.close();
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, session };
};

const structured = (result: CallToolResult): Record<string, unknown> => {
  if (
    typeof result.structuredContent !== "object" ||
    result.structuredContent === null
  )
    throw new Error("missing structured result");
  return z.record(z.string(), z.unknown()).parse(result.structuredContent);
};

it("opens a headerless image when architecture and entry are supplied", async () => {
  const root = await createTestTempDirectory("rea-raw-mcp-");
  const path = join(root, "ecu.bin");
  await writeFile(path, Buffer.from("1eff2fe1", "hex"));
  const { client } = await connect();
  const opened = await client.callTool({
    name: "open_binary",
    arguments: {
      path,
      format: "raw-binary",
      architecture: "arm",
      entry_point: "0x08000000",
    },
  });
  expect(opened.isError).not.toBe(true);
  expect(structured(opened).result).toMatchObject({
    path,
    format: "raw-binary",
    kind: "executable",
    architecture: "arm",
    entry_point: "0x8000000",
  });
});

it("rejects an unaligned AArch64 entry before selecting or starting a provider", async () => {
  const root = await createTestTempDirectory("rea-raw-mcp-alignment-");
  const path = join(root, "image.bin");
  await writeFile(path, Buffer.from("c0035fd6", "hex"));
  const { client, session } = await connect({
    ...createCacheProvider([]),
    resolveAnalysisProfile: () => {
      throw new Error("unaligned input must not select a provider");
    },
    createClient: () => {
      throw new Error("unaligned input must not launch a provider");
    },
  });
  const opened = await client.callTool({
    name: "open_binary",
    arguments: {
      path,
      format: "raw-binary",
      architecture: "arm64",
      entry_point: "0x8000001",
    },
  });
  expect(opened.isError).toBe(true);
  expect(JSON.stringify(opened.content)).toContain("must be 4-byte aligned");
  expect(session.activeTarget()).toBeUndefined();
});

it("rejects raw-binary open requests that omit architecture", async () => {
  const root = await createTestTempDirectory("rea-raw-mcp-missing-");
  const path = join(root, "ecu.bin");
  await writeFile(path, Buffer.from("1eff2fe1", "hex"));
  const { client } = await connect();
  const opened = await client.callTool({
    name: "open_binary",
    arguments: { path, format: "raw-binary" },
  });
  expect(opened.isError).toBe(true);
});

it("reuses a canonical raw entry and replaces the session when the entry changes", async () => {
  const root = await createTestTempDirectory("rea-raw-mcp-reopen-");
  const path = join(root, "ecu.bin");
  await writeFile(path, Buffer.from("1eff2fe1", "hex"));
  const fixture = createCacheProvider([]);
  const resolved: string[] = [];
  const created: string[] = [];
  const closed: string[] = [];
  const { client, session } = await connect({
    ...fixture,
    resolveAnalysisProfile: (target) => {
      if (target.format !== "raw-binary")
        throw new Error("expected raw binary");
      resolved.push(target.entryPoint);
      return Promise.resolve(
        ok({
          profile: createAnalysisProfile(
            { ...fixture.identity(), version: "1" },
            {
              entry_point: target.entryPoint,
            },
          ),
        }),
      );
    },
    createClient: (target) => {
      if (target.format !== "raw-binary")
        throw new Error("expected raw binary");
      created.push(target.entryPoint);
      return {
        execute: (operation) => {
          if (operation !== "health" && operation !== "address_name")
            throw new Error(`unexpected fixture operation: ${operation}`);
          return Promise.resolve(observed(target.entryPoint));
        },
        close: () => {
          closed.push(target.entryPoint);
          return Promise.resolve(ok(null));
        },
      };
    },
  });
  const tools = (await client.listTools()).tools;
  const validateLifecycle = (
    name: "open_binary" | "binary_session",
    response: CallToolResult,
  ) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool?.outputSchema === undefined)
      throw new Error(`missing ${name} output schema`);
    const schema = z.record(z.string(), z.unknown()).parse(tool.outputSchema);
    const validate = new Ajv2020({
      strict: false,
      validateFormats: false,
    }).compile(schema);
    expect(
      validate(response.structuredContent),
      JSON.stringify(validate.errors),
    ).toBe(true);
    const parsed = toolContract(name).outputSchema.parse(
      response.structuredContent,
    );
    const target = z.record(z.string(), z.unknown()).parse(parsed.result);
    const { entry_point: _entry, ...missingEntry } = target;
    expect(validate({ ...structured(response), result: missingEntry })).toBe(
      false,
    );
    return target;
  };
  for (const entryPoint of ["0x08000000", "0x8000000", "0x09000000"]) {
    const opened = await client.callTool({
      name: "open_binary",
      arguments: {
        path,
        format: "raw-binary",
        architecture: "arm",
        entry_point: entryPoint,
      },
    });
    expect(opened.isError, JSON.stringify(opened)).not.toBe(true);
    const canonical = `0x${BigInt(entryPoint).toString(16)}`;
    expect(validateLifecycle("open_binary", opened).entry_point).toBe(
      canonical,
    );
    const status = await client.callTool({
      name: "binary_session",
      arguments: {},
    });
    expect(status.isError, JSON.stringify(status)).not.toBe(true);
    expect(validateLifecycle("binary_session", status).entry_point).toBe(
      canonical,
    );
    const result = await client.callTool({
      name: "address_name",
      arguments: { address: entryPoint },
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(structured(result).normalized_result).toBe(canonical);
  }
  expect(session.analysisProfile()?.parameters.entry_point).toBe("0x9000000");
  expect(resolved).toEqual(["0x8000000", "0x9000000"]);
  expect(created).toEqual(["0x8000000", "0x9000000"]);
  expect(closed).toEqual(["0x8000000"]);
});
