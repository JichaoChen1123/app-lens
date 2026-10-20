import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { exec, json, run } from "./lib/verify-package-core.mjs";

/** Install the packed CLI globally with and without optional dependencies and verify PTY degradation. */
export async function verifyPackageInstall({
  tarball,
  prefix,
  workspace,
  environment,
}) {
  await exec(
    "npm",
    [
      "install",
      "--global",
      "--ignore-scripts",
      "--omit=dev",
      "--install-strategy=nested",
      "--prefix",
      prefix,
      tarball,
    ],
    { env: environment },
  );
  const cli = join(prefix, "bin", "applens");
  const packageRunnerCli = join(prefix, "bin", "@jichaochen1123/app-lens");
  if (!(await run(packageRunnerCli, ["--help"], environment)).includes("setup"))
    throw new Error(
      "packaged @jichaochen1123/app-lens alias did not expose setup",
    );
  const processCaptureCapabilityUrl = pathToFileURL(
    join(
      prefix,
      "lib/node_modules/@jichaochen1123/app-lens/dist/process/capture/ProcessCaptureCapability.js",
    ),
  ).href;
  const processCaptureCapability = json(
    (
      await exec(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `const { probeProcessCaptureCapability } = await import(${JSON.stringify(processCaptureCapabilityUrl)}); process.stdout.write(JSON.stringify(await probeProcessCaptureCapability()));`,
        ],
        { env: environment },
      )
    ).stdout,
  );
  if (processCaptureCapability.available !== true)
    throw new Error(
      `packaged PTY backend failed without lifecycle scripts: ${JSON.stringify(processCaptureCapability)}`,
    );
  const noOptionalPrefix = join(workspace, "prefix-no-optional");
  await exec(
    "npm",
    [
      "install",
      "--global",
      "--ignore-scripts",
      "--omit=optional",
      "--prefix",
      noOptionalPrefix,
      tarball,
    ],
    { env: environment },
  );
  const noOptionalCli = join(noOptionalPrefix, "bin", "applens");
  await rm(
    join(
      noOptionalPrefix,
      "lib/node_modules/@jichaochen1123/app-lens/node_modules/@lydell",
      `node-pty-${process.platform}-${process.arch}`,
    ),
    { recursive: true, force: true },
  );
  const noOptionalCapabilityUrl = pathToFileURL(
    join(
      noOptionalPrefix,
      "lib/node_modules/@jichaochen1123/app-lens/dist/process/capture/ProcessCaptureCapability.js",
    ),
  ).href;
  const noOptionalCapability = json(
    (
      await exec(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `const { probeProcessCaptureCapability } = await import(${JSON.stringify(noOptionalCapabilityUrl)}); process.stdout.write(JSON.stringify(await probeProcessCaptureCapability()));`,
        ],
        { env: environment },
      )
    ).stdout,
  );
  if (
    !(await run(noOptionalCli, ["--help"], environment)).includes("setup") ||
    noOptionalCapability.available !== false
  )
    throw new Error(
      `packaged CLI did not degrade without the optional PTY binary: ${JSON.stringify(noOptionalCapability)}`,
    );
  await verifyInstalledPackageCanRepack(prefix, environment);
  return { cli, packageRunnerCli };
}

const verifyInstalledPackageCanRepack = async (prefix, environment) => {
  const installedPackageRoot = join(
    prefix,
    "lib/node_modules/@jichaochen1123/app-lens",
  );
  const repackedTarball = (
    await exec("npm", ["pack", "--silent"], {
      cwd: installedPackageRoot,
      env: environment,
    })
  ).stdout.trim();
  await rm(join(installedPackageRoot, repackedTarball), { force: true });
};
