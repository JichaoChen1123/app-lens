import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { PRODUCT_IDENTITY } from "../../../src/identity.js";

const installer = resolve("install/install.sh");
const uninstaller = resolve("install/uninstall.sh");

const runBash = (script: string, args: readonly string[]) =>
  spawnSync("/bin/bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
  });

describe("student installer scripts", () => {
  it.each([installer, uninstaller])(
    "parses %s with the system bash",
    (script) => {
      const result = spawnSync("/bin/bash", ["-n", script], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
  );

  it("refuses to run a truncated download", async () => {
    const source = await readFile(installer, "utf8");
    const truncated = source.slice(0, source.lastIndexOf("}"));
    const result = spawnSync("/bin/bash", ["-s"], {
      input: truncated,
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("软件透视 AppLens 安装程序");
  });

  it("previews the plan without touching the home directory", () => {
    const result = runBash(installer, ["--dry-run", "--version", "1.2.3"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("演练模式");
    expect(result.stdout).toContain(`${PRODUCT_IDENTITY.packageName}@1.2.3`);
    expect(result.stdout).toContain(
      `/nonexistent-home/.applens/bin/${PRODUCT_IDENTITY.cliBinary}`,
    );
  });

  it("rejects an invalid version before doing any work", () => {
    const result = runBash(installer, ["--version", "latest; rm -rf ~"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("版本号格式不对");
  });

  it("installs the package the product identity names", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain(`PACKAGE="${PRODUCT_IDENTITY.packageName}"`);
    expect(source).toContain("REA_REGISTRATION_LAUNCHER=");
  });

  it("does not uninstall without confirmation when no terminal is attached", async () => {
    // A detached child has no controlling terminal, like `curl | bash` in CI.
    const child = spawn("/bin/bash", [uninstaller], {
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const [code] = (await once(child, "close")) as [number | null];
    expect(code).toBe(1);
    expect(stderr).toContain("--yes");
  });
  it("never deletes a directory the installer did not mark as its own", async () => {
    const home = await createTestTempDirectory("applens-uninstall-guard-");
    const documents = join(home, "Documents");
    await mkdir(documents);
    await writeFile(join(documents, "homework.txt"), "keep");
    const result = spawnSync("/bin/bash", [uninstaller, "--yes"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: home, CHAICHAI_HOME: documents },
    });
    expect(result.status).toBe(1);
    expect(await readFile(join(documents, "homework.txt"), "utf8")).toBe(
      "keep",
    );
  });

  it("keeps a shell profile whose AppLens block was edited", async () => {
    const home = await createTestTempDirectory("applens-uninstall-profile-");
    const profile = join(home, ".zshrc");
    const edited =
      '# >>> applens >>>\nexport PATH="$HOME/.applens/bin:$PATH"\nalias mine="ls"\n';
    await writeFile(profile, edited);
    const result = spawnSync("/bin/bash", [uninstaller, "--yes"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: home },
    });
    expect(result.status).toBe(0);
    expect(await readFile(profile, "utf8")).toBe(edited);
  });
  it("explains that Intel Macs are not supported", async () => {
    const home = await createTestTempDirectory("applens-intel-");
    const bin = join(home, "bin");
    await mkdir(bin);
    // Simulate an Intel Mac: Darwin kernel without Apple silicon.
    await writeFile(join(bin, "uname"), "#!/bin/sh\necho Darwin\n", {
      mode: 0o755,
    });
    await writeFile(join(bin, "sysctl"), "#!/bin/sh\necho 0\n", {
      mode: 0o755,
    });
    await writeFile(join(bin, "id"), "#!/bin/sh\necho 501\n", { mode: 0o755 });
    const result = spawnSync("/bin/bash", [installer, "--no-setup"], {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Apple 芯片");
  });
});
