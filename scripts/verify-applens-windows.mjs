#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

if (process.platform !== "win32")
  throw new Error("This acceptance lane requires a real Windows host.");
const execute = promisify(execFile);
const packageRoot = resolve(process.argv[2] ?? ".");
const entry = join(packageRoot, "scripts", "rea.mjs");
const metadata = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);
const workspace = await mkdtemp(join(tmpdir(), "applens-windows-smoke-"));
const application = join(workspace, "Sample App 中文");
const reportPath = resolve(".cache/windows-smoke-report.json");
const report = {
  passed: false,
  platform: process.platform,
  node: process.version,
  version: metadata.version,
};
let client;
let transport;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await mkdir(application);
  const sources = {
    "package.json": JSON.stringify({
      name: "applens-acceptance",
      version: "1.0.0",
      main: "main.js",
    }),
    "main.js":
      'const { app, BrowserWindow, ipcMain } = require("electron"); const { score } = require("./score.js"); ipcMain.handle("score", (_, n) => score(n)); app.whenReady().then(() => { const win = new BrowserWindow({ webPreferences: { preload: require("path").join(__dirname, "preload.js") } }); win.loadFile("index.html"); });\n',
    "score.js": "exports.score = (n) => n + 10;\n",
    "preload.js":
      'const { contextBridge, ipcRenderer } = require("electron"); contextBridge.exposeInMainWorld("api", { score: (n) => ipcRenderer.invoke("score", n) });\n',
    "index.html":
      "<!doctype html><html><body><button>Score</button></body></html>\n",
  };
  const before = new Map();
  for (const [name, source] of Object.entries(sources)) {
    await writeFile(join(application, name), source);
    before.set(name, digest(Buffer.from(source)));
  }
  const cli = await execute(
    process.execPath,
    [
      entry,
      "analyze-javascript-application",
      application,
      "--analysis-timeout-ms",
      "30000",
      "--json",
    ],
    {
      timeout: 60000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, REA_LOG_LEVEL: "silent" },
    },
  );
  const evidence = JSON.parse(cli.stdout);
  assert.equal(evidence.operation, "analyze_javascript_application");
  assert.equal(
    evidence.normalized_result.statistics.parsed_javascript_files,
    3,
  );
  assert.equal(evidence.normalized_result.statistics.parse_failures, 0);
  assert.ok(
    evidence.normalized_result.graph.edges.some(
      (edge) => edge.relation === "imports",
    ),
  );
  report.cli = {
    evidenceId: evidence.evidence_id,
    statistics: evidence.normalized_result.statistics,
  };
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, "mcp"],
    cwd: packageRoot,
    env: { ...process.env, REA_LOG_LEVEL: "silent" },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => undefined);
  client = new Client({ name: "applens-windows-acceptance", version: "1.0.0" });
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, "applens");
  const tools = await client.listTools();
  report.toolCount = tools.tools.length;
  assert.ok(
    tools.tools.some(({ name }) => name === "analyze_javascript_application"),
  );
  const mcp = await client.callTool({
    name: "analyze_javascript_application",
    arguments: { input_path: application, analysis_timeout_ms: 30000 },
  });
  assert.notEqual(mcp.isError, true, JSON.stringify(mcp.content));
  assert.deepEqual(
    mcp.structuredContent.normalized_result,
    evidence.normalized_result,
  );
  report.cliMcpParity = true;
  const bundle = await client.callTool({
    name: "get_evidence_bundle",
    arguments: { detail: "summary" },
  });
  assert.notEqual(bundle.isError, true);
  assert.ok(
    bundle.structuredContent.result.records.some(
      (record) => record.evidence_id === mcp.structuredContent.evidence_id,
    ),
  );
  report.evidenceRetained = true;
  const invalid = await client.callTool({
    name: "inspect_pe_resources",
    arguments: { path: "relative.exe" },
  });
  assert.equal(invalid.isError, true);
  report.invalidInputRejected = true;
  for (const [name, hash] of before)
    assert.equal(digest(await readFile(join(application, name))), hash);
  report.inputsUnchanged = true;
  report.passed = true;
} catch (cause) {
  report.error = cause instanceof Error ? cause.message : String(cause);
  throw cause;
} finally {
  try {
    await client?.close();
  } finally {
    await transport?.close();
  }
  const suffix = relative(tmpdir(), workspace);
  assert.ok(
    !suffix.startsWith("..") &&
      basename(workspace).startsWith("applens-windows-smoke-"),
  );
  await rm(workspace, { recursive: true, force: true });
  await mkdir(resolve(".cache"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
