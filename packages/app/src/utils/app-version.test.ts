import { describe, expect, it, vi } from "vitest";

const constants = vi.hoisted(() => ({ expoConfig: null as Record<string, unknown> | null }));
vi.mock("expo-constants", () => ({ default: constants }));

import { resolveForkVersion } from "./app-version";

describe("resolveForkVersion", () => {
  it("is null for upstream builds", () => {
    constants.expoConfig = { name: "Paseo", extra: { diagnosticRevision: "abc1234" } };
    expect(resolveForkVersion()).toBeNull();
  });

  it("reports a fork build's name, version and revision", () => {
    constants.expoConfig = {
      name: "YPaseo",
      extra: { forkVersion: "1.0.0", diagnosticRevision: "abc1234" },
    };
    expect(resolveForkVersion()).toEqual({ name: "YPaseo", version: "1.0.0", revision: "abc1234" });
  });
});
