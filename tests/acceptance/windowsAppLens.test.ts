import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it.runIf(process.platform === "win32")(
  "analyzes an immutable Unicode-path application through compiled Windows CLI and MCP",
  async () => {
    const execute = promisify(execFile);
    await execute(
      process.execPath,
      [resolve("scripts/verify-applens-windows.mjs")],
      {
        cwd: process.cwd(),
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const report = JSON.parse(
      await readFile(resolve(".cache/windows-smoke-report.json"), "utf8"),
    );
    expect(report).toMatchObject({
      passed: true,
      platform: "win32",
      cliMcpParity: true,
      inputsUnchanged: true,
      evidenceRetained: true,
      invalidInputRejected: true,
    });
    expect(report.toolCount).toBeGreaterThan(0);
  },
  130000,
);
