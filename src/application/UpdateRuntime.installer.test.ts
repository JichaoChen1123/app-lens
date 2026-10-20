import { describe, expect, it } from "vitest";

import {
  INSTALLER_UPDATE_INSTRUCTIONS_VARIABLE,
  systemUpdateHost,
} from "./UpdateRuntime.js";

describe("installer-owned update instructions", () => {
  it("returns the installer's instructions without consulting a registry", async () => {
    const host = systemUpdateHost(undefined, undefined, {
      PATH: "",
      [INSTALLER_UPDATE_INSTRUCTIONS_VARIABLE]: "Rerun the installer.",
    });
    try {
      await expect(host.latestVersion(undefined)).resolves.toEqual({
        ok: false,
        error: {
          kind: "unsupported-package-manager",
          detail: "Rerun the installer.",
        },
      });
    } finally {
      await host.close?.();
    }
  });
});
