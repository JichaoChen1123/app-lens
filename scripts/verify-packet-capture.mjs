#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Ajv2020 } from "ajv/dist/2020.js";
import { PrivateRuntimeRoot } from "../dist/process/PrivateRuntimeRoot.js";
import { parseEvidence } from "../dist/domain/evidence.js";
import { createVerifierRun, completeVerifierRun } from "./lib/verifier-run.mjs";

if (process.platform !== "linux")
  throw new Error(
    "Real packet capture verification requires Linux with util-linux prlimit.",
  );
if (!isAbsolute(process.env.REA_TSHARK_COMMAND ?? ""))
  throw new Error("Supply absolute REA_TSHARK_COMMAND for TShark 4.x.");
const entrypoint =
  process.argv[2] ?? fileURLToPath(new URL("./rea.mjs", import.meta.url));
const run = createVerifierRun();
const root = await PrivateRuntimeRoot.create({
  prefix: "rea-capture-verifier-",
});
const path = join(root.path, "network with spaces.pcap");
const bluetooth = join(root.path, "bluetooth.pcap");
const execute = promisify(execFile);
const environment = {
  ...process.env,
  TMPDIR: root.path,
  TMP: root.path,
  TEMP: root.path,
};
const client = new Client({ name: "packet-capture-verifier", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entrypoint, "mcp"],
  env: environment,
  stderr: "pipe",
});

// Independently synthesize PCAP bytes; no external captures or device access.
const pcap = (linktype, packets) => {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(linktype, 20);
  return Buffer.concat([
    header,
    ...packets.flatMap((bytes, i) => {
      const record = Buffer.alloc(16);
      record.writeUInt32LE(1700000000 + i, 0);
      record.writeUInt32LE(bytes.length, 8);
      record.writeUInt32LE(bytes.length, 12);
      return [record, bytes];
    }),
  ]);
};
const udp = (destination, payload) => {
  const ip = Buffer.from("450000000001000040110000c0000201c0000202", "hex");
  ip.writeUInt16BE(28 + payload.length, 2);
  let checksum = 0;
  for (let i = 0; i < ip.length; i += 2) checksum += ip.readUInt16BE(i);
  while (checksum > 0xffff) checksum = (checksum & 0xffff) + (checksum >>> 16);
  ip.writeUInt16BE(~checksum & 0xffff, 10);
  const header = Buffer.alloc(8);
  header.writeUInt16BE(40000, 0);
  header.writeUInt16BE(destination, 2);
  header.writeUInt16BE(8 + payload.length, 4);
  return Buffer.concat([
    Buffer.from("0200000000020200000000010800", "hex"),
    ip,
    header,
    payload,
  ]);
};
const dnsQuery = Buffer.from(
  "123401000001000000000000076578616d706c6504746573740000010001",
  "hex",
);
const source = pcap(1, [
  udp(5554, Buffer.from("AppLens")),
  udp(5555, dnsQuery),
  udp(5555, dnsQuery),
]);
// LINKTYPE_BLUETOOTH_HCI_H4 = 187; H4 command packet, HCI Reset opcode 0x0c03, no parameters.
const bluetoothSource = pcap(187, [Buffer.from("01030c00", "hex")]);
let cases = 0;
try {
  await writeFile(path, source);
  await writeFile(bluetooth, bluetoothSource);
  await client.connect(transport);
  const tool = (await client.listTools()).tools.find(
    ({ name }) => name === "inspect_packet_capture",
  );
  assert.ok(tool?.outputSchema);
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  assert.ok(ajv.validateSchema(tool.inputSchema));
  assert.ok(ajv.validateSchema(tool.outputSchema));
  const inspect = async (input) => {
    const response = await client.callTool({
      name: tool.name,
      arguments: input,
    });
    assert.notEqual(response.isError, true, JSON.stringify(response));
    assert.ok(
      ajv.validate(tool.outputSchema, response.structuredContent),
      JSON.stringify(ajv.errors),
    );
    const evidence = parseEvidence(response.structuredContent);
    const report = evidence.normalized_result;
    assert.equal(
      report.artifact.sha256,
      createHash("sha256")
        .update(await readFile(input.path))
        .digest("hex"),
    );
    assert.equal(report.hardware_acquisition, "not-performed");
    assert.equal(report.limits.address_space_bytes, 1073741824);
    assert.equal(report.tool.configured_path, process.env.REA_TSHARK_COMMAND);
    assert.equal(
      report.resource_limiter.configured_path,
      process.env.REA_TSHARK_PRLIMIT_COMMAND ?? "/usr/bin/prlimit",
    );
    assert.ok(
      report.resource_limiter.arguments.includes("--as=1073741824:1073741824"),
    );
    assert.equal(report.configuration, "private-empty-personal-profile");
    const flags = Object.entries(input)
      .filter(([key]) => key !== "path")
      .flatMap(([key, value]) =>
        key === "match_limit" && value === null
          ? ["--all_matches"]
          : typeof value === "boolean"
            ? [value ? `--${key}` : `--no-${key}`]
            : (Array.isArray(value) ? value : [value]).flatMap((item) => [
                `--${key}`,
                String(item),
              ]),
      );
    const cli = JSON.parse(
      (
        await execute(
          process.execPath,
          [
            entrypoint,
            "inspect-packet-capture",
            input.path,
            ...flags,
            "--format",
            "json",
          ],
          { env: environment, timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
        )
      ).stdout,
    );
    assert.deepEqual(parseEvidence(cli), evidence);
    const bundle = await client.callTool({
      name: "get_evidence_bundle",
      arguments: {},
    });
    assert.ok(JSON.stringify(bundle).includes(evidence.evidence_id));
    cases++;
    return report;
  };
  for (const two_pass of [true, false]) {
    const report = await inspect({
      path,
      fields: ["ip.addr", "udp.port", "tcp.port"],
      display_filter: "udp.dstport == 5555",
      two_pass,
    });
    assert.deepEqual(
      report.packets.map((p) => p["frame.number"]),
      [["2"], ["3"]],
    );
    assert.deepEqual(report.packets[0]["ip.addr"], ["192.0.2.1", "192.0.2.2"]);
    assert.deepEqual(report.packets[0]["udp.port"], ["40000", "5555"]);
    assert.equal(Object.hasOwn(report.packets[0], "tcp.port"), false);
    assert.equal(report.read_scope, "to-eof");
  }
  const selected = {
    path,
    fields: ["dns.qry.name"],
    decode_as: ["udp.port==5555,dns"],
    display_filter: "dns",
  };
  const dns = await inspect(selected);
  assert.equal(dns.packets.length, 2);
  assert.deepEqual(dns.packets[0]["dns.qry.name"], ["example.test"]);
  const prefix = await inspect({ ...selected, packet_limit: 1 });
  assert.deepEqual(prefix.packets, []);
  assert.equal(prefix.read_scope, "up-to-input-packet-limit");
  const empty = await inspect({
    path,
    fields: ["frame.number"],
    display_filter: "tcp",
  });
  assert.deepEqual(empty.packets, []);
  const pagedPath = join(root.path, "paged.pcap");
  const pagedSource = pcap(
    1,
    Array.from({ length: 120 }, () =>
      udp(5555, Buffer.from("owned paging fixture")),
    ),
  );
  await writeFile(pagedPath, pagedSource);
  const page = await inspect({ path: pagedPath, fields: ["ip.addr"] });
  assert.equal(page.packets.length, 50);
  assert.deepEqual(page.output_window, {
    matching_packets: 120,
    returned_packets: 50,
    has_more: true,
  });
  const nextPage = await inspect({
    path: pagedPath,
    fields: ["ip.addr"],
    match_offset: 50,
    match_limit: 40,
  });
  assert.deepEqual(nextPage.packets[0]["frame.number"], ["51"]);
  assert.deepEqual(nextPage.packets.at(-1)["frame.number"], ["90"]);
  const complete = await inspect({
    path: pagedPath,
    fields: ["ip.addr"],
    match_limit: null,
  });
  assert.equal(complete.packets.length, 120);
  assert.equal(complete.output_window.has_more, false);
  assert.deepEqual(await readFile(pagedPath), pagedSource);
  const hci = await inspect({ path: bluetooth, fields: ["bthci_cmd.opcode"] });
  assert.deepEqual(hci.packets[0]["bthci_cmd.opcode"], ["0x0c03"]);
  assert.deepEqual(await readFile(path), source);
  // Exercise the incremental summary workflow against the same owned bytes
  // using real installed Wireshark tools; these inputs are format fixtures.
  const pcapTool = (await client.listTools()).tools.find(
    (t) => t.name === "inspect_pcap_capture",
  );
  assert.ok(pcapTool?.outputSchema);
  const pcapAjv = new Ajv2020({ strict: false, validateFormats: false });
  assert.ok(pcapAjv.validateSchema(pcapTool.inputSchema));
  assert.ok(pcapAjv.validateSchema(pcapTool.outputSchema));
  for (const capturePath of [path, bluetooth]) {
    const response = await client.callTool({
      name: pcapTool.name,
      arguments: { path: capturePath, detail: "summary" },
    });
    assert.notEqual(response.isError, true, JSON.stringify(response));
    assert.ok(
      pcapAjv.validate(pcapTool.outputSchema, response.structuredContent),
      pcapAjv.errorsText(),
    );
    const summary = parseEvidence(response.structuredContent).normalized_result;
    assert.equal(
      summary.summary.target.sha256,
      createHash("sha256")
        .update(await readFile(capturePath))
        .digest("hex"),
    );
    const source = {
      kind: "retained-evidence",
      evidence_id: summary.parent_evidence_id,
    };
    const page = await client.callTool({
      name: "inspect_analysis_view",
      arguments: {
        source,
        view: { kind: "pcap", facet: "protocols", limit: 10 },
      },
    });
    assert.notEqual(page.isError, true, JSON.stringify(page));
    assert.equal(
      parseEvidence(page.structuredContent).normalized_result
        .parent_evidence_id,
      source.evidence_id,
    );
    cases++;
  }

  assert.deepEqual(await readFile(bluetooth), bluetoothSource);
  for (const input of [
    { path, fields: ["frame.number"], display_filter: "this is not a filter" },
    { path, fields: ["no_such_field"] },
    {
      path,
      fields: ["frame.number"],
      decode_as: ["no_such_protocol==1,unknown"],
    },
    { path: join(root.path, "absent.pcap"), fields: ["frame.number"] },
    { path, fields: ["frame.number"], interface: "lo0" },
  ]) {
    const response = await client.callTool({
      name: tool.name,
      arguments: input,
    });
    assert.equal(response.isError, true);
    await client.ping();
    cases++;
  }
  await writeFile(path, "not a capture");
  assert.equal(
    (
      await client.callTool({
        name: tool.name,
        arguments: { path, fields: ["frame.number"] },
      })
    ).isError,
    true,
  );
  cases++;
  await client.close();
  assert.deepEqual((await readdir(root.path)).sort(), [
    "bluetooth.pcap",
    "network with spaces.pcap",
    "paged.pcap",
  ]);
} finally {
  await client.close();
  await transport.close();
  await root.close();
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      cases,
      host: `${process.platform}/${process.arch}`,
      scope:
        "real TShark CLI/MCP; synthetic Ethernet/IPv4/UDP/DNS and Bluetooth HCI PCAP; no hardware acquisition",
      ...(await completeVerifierRun(run)),
    },
    null,
    2,
  ),
);
