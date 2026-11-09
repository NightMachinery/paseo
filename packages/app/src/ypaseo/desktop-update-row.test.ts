import { describe, expect, it, vi } from "vitest";

const forkVersion = vi.hoisted(() => ({ value: null as null | { name: string } }));
vi.mock("@/utils/app-version", () => ({ resolveForkVersion: () => forkVersion.value }));
vi.mock("@/styles/settings", () => ({ settingsStyles: {} }));

import { desktopUpdateRowFor } from "./desktop-update-row";

function Upstream() {
  return null;
}

describe("desktopUpdateRowFor", () => {
  it("keeps upstream's update rows in an upstream build", () => {
    forkVersion.value = null;
    expect(desktopUpdateRowFor(Upstream)).toBe(Upstream);
  });

  it("replaces them in a YPaseo build", () => {
    forkVersion.value = { name: "YPaseo" };
    expect(desktopUpdateRowFor(Upstream)).not.toBe(Upstream);
  });
});
