/**
 * Cross-platform pcap provider tests.
 *
 * POSIX hosts run the #!/bin/sh fixtures;
 * Windows runs the .cmd stubs from tests/fixtures/pcap/. Both validate
 * the same provider contract surface: tool probing, capture inspection,
 * refusal paths, and cancellation before spawn.
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

import { PcapProvider } from "../../../src/pcap/PcapProvider.js";
import { projectAnalysisError } from "../../../src/domain/analysisErrorProjection.js";
import type { PcapRequest } from "../../../src/domain/pcap/pcapAnalysis.js";

const isWindows = process.platform === "win32";
const hasNativeBound = process.platform === "linux" || isWindows;
const stubDir = join(import.meta.dirname, "../../fixtures/pcap");
const tsharkStub = isWindows
  ? join(stubDir, "tshark-stub.cmd")
  : join(stubDir, "tshark-stub.sh");
const capinfosStub = isWindows
  ? join(stubDir, "capinfos-stub.cmd")
  : join(stubDir, "capinfos-stub.sh");

const providerOver = (): PcapProvider => {
  const provider = new PcapProvider({
    environment: {
      REA_TSHARK_COMMAND: tsharkStub,
      REA_CAPINFOS_COMMAND: capinfosStub,
    },
  });
  onTestFinished(() => provider.close());
  return provider;
};

const evidenceResult = async (
  provider: PcapProvider,
  request: PcapRequest,
): Promise<Record<string, unknown>> => {
  const result = await provider.execute(request);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.result as Record<string, unknown>;
};

it("inspects both tools through cross-platform stubs", async () => {
  const result = await evidenceResult(providerOver(), {
    operation: "inspect_pcap_client",
    input: {},
  });
  expect(result.client).toMatchObject({
    tshark_source: "environment",
    tshark_version: expect.stringContaining("4.6.6") as unknown,
    capinfos_source: "environment",
    capinfos_version: expect.stringContaining("4.6.6") as unknown,
  });
});

it.runIf(hasNativeBound)(
  "inspects a capture with metadata, endpoints, DNS, and protocol facts",
  async () => {
    const root = await createTestTempDirectory("rea-pcap-x-");
    const capturePath = join(root, "capture.pcap");
    const captureBytes = "cross-platform-pcap-fixture";
    await writeFile(capturePath, captureBytes);

    const result = await evidenceResult(providerOver(), {
      operation: "inspect_pcap_capture",
      input: { path: capturePath },
    });

    expect(result.target).toMatchObject({
      path: capturePath,
      bytes: captureBytes.length,
      sha256: createHash("sha256").update(captureBytes).digest("hex"),
    });
    expect(result.file_type).toContain("pcap");
    expect(result.packet_count).toBe(3);
    expect((result.endpoints as unknown[]).length).toBeGreaterThan(0);
    expect((result.protocol_distribution as unknown[]).length).toBeGreaterThan(
      0,
    );
    expect(result.coverage).toBe("complete");
  },
);

it("rejects a path that is not a readable file", async () => {
  const result = await providerOver().execute({
    operation: "inspect_pcap_capture",
    input: { path: "/nonexistent/definitely-missing.pcap" },
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  // Hosts without an enforceable native memory bound refuse before any
  // capture path is examined, so the path is never reached there.
  expect(projectAnalysisError(result.error)).toMatchObject(
    hasNativeBound
      ? { code: "invalid_request" }
      : { code: "capability_unavailable", category: "unsupported_provider" },
  );
});

it("reports a missing binary as a capability gap", async () => {
  const provider = new PcapProvider({
    environment: { REA_TSHARK_COMMAND: "/nonexistent/tshark" },
  });
  expect(await provider.inspectAvailability()).toMatchObject({
    status: "unavailable",
    code: "executable_missing",
  });
});

it("cancels before spawning anything", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await providerOver().execute(
    { operation: "inspect_pcap_capture", input: { path: "/any/capture.pcap" } },
    { signal: controller.signal },
  );
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(projectAnalysisError(result.error)).toMatchObject({
    code: "cancelled",
  });
});

it.runIf(!hasNativeBound)(
  "reports an unsupported native memory boundary before reading the capture",
  async () => {
    const provider = providerOver();
    expect(await provider.inspectAvailability()).toMatchObject({
      status: "unavailable",
      code: "unsupported_host",
    });
    const result = await provider.execute({
      operation: "inspect_pcap_capture",
      input: { path: "/not-opened/capture.pcap" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(projectAnalysisError(result.error)).toMatchObject({
        code: "capability_unavailable",
      });
  },
);
