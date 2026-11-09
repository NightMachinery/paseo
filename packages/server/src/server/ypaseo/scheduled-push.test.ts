import { describe, expect, it } from "vitest";
import { ypaseoPushEligible } from "./scheduled-push.js";

const scheduled = { "paseo.schedule-id": "sch_1" };

describe("ypaseoPushEligible", () => {
  it("drops the push for a scheduled run that finished", () => {
    expect(ypaseoPushEligible(true, "finished", scheduled)).toBe(false);
  });

  it("keeps permission and error pushes for scheduled runs", () => {
    expect(ypaseoPushEligible(true, "permission", scheduled)).toBe(true);
    expect(ypaseoPushEligible(true, "error", scheduled)).toBe(true);
  });

  it("keeps finished pushes for other agents, and never adds one", () => {
    expect(ypaseoPushEligible(true, "finished", {})).toBe(true);
    expect(ypaseoPushEligible(true, "finished", undefined)).toBe(true);
    expect(ypaseoPushEligible(false, "permission", scheduled)).toBe(false);
  });
});
