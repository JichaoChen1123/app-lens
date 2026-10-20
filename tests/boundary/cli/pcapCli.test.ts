import { expect, it } from "vitest";

import { serveCli } from "./cliServeHarness.js";

it.each(["inspect-pcap-client", "inspect-pcap-capture"])(
  "%s advertises a schema through the public CLI",
  async (command) => {
    const result = await serveCli([command, "--schema", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toBeTruthy();
  },
);

it("reports missing tools with a capability refusal", async () => {
  const result = await serveCli(
    ["inspect-pcap-capture", "/nonexistent/capture.pcap", "--json"],
    {
      REA_TSHARK_COMMAND: "/nonexistent/tshark",
      REA_CAPINFOS_COMMAND: "/nonexistent/capinfos",
    },
  );
  expect(result.stdout).toContain("capability_unavailable");
});
