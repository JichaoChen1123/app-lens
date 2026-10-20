import { describe, expect, it } from "vitest";

import { orderAsarListing } from "./AsarArtifactReader.js";

describe("orderAsarListing", () => {
  it("orders host-spelled listings by their portable archive path", () => {
    const posix = orderAsarListing(["/a0", "/a", "/a/b"], "/");
    const windows = orderAsarListing(["\\a0", "\\a", "\\a\\b"], "\\");

    // "/" (0x2F) precedes "0" (0x30); "\" (0x5C) would follow it.
    expect(posix.map(({ path }) => path)).toEqual(["a", "a/b", "a0"]);
    expect(windows.map(({ path }) => path)).toEqual(["a", "a/b", "a0"]);
    expect(windows.map(({ listed }) => listed)).toEqual([
      "\\a",
      "\\a\\b",
      "\\a0",
    ]);
  });

  it("keeps POSIX backslashes as literal filename characters", () => {
    expect(orderAsarListing(["/a\\b"], "/")).toEqual([
      { listed: "/a\\b", path: "a\\b" },
    ]);
  });
});
