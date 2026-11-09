import { describe, expect, it } from "vitest";
import { promptNavigationDirection, promptNavigationTarget } from "./prompt-navigation";

const press = (
  key: string,
  mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("promptNavigationDirection", () => {
  it("maps Alt+Up and Alt+Down only", () => {
    expect(promptNavigationDirection(press("ArrowUp", { altKey: true }))).toBe("previous");
    expect(promptNavigationDirection(press("ArrowDown", { altKey: true }))).toBe("next");
    expect(promptNavigationDirection(press("ArrowUp"))).toBeNull();
    expect(
      promptNavigationDirection(press("ArrowUp", { altKey: true, shiftKey: true })),
    ).toBeNull();
    expect(promptNavigationDirection(press("ArrowUp", { altKey: true, metaKey: true }))).toBeNull();
    expect(promptNavigationDirection(press("ArrowLeft", { altKey: true }))).toBeNull();
  });
});

describe("promptNavigationTarget", () => {
  const seqs = [40, 10, 25];

  it("moves to the neighbouring prompt of the one being read", () => {
    expect(promptNavigationTarget(seqs, 25, "previous")).toBe(10);
    expect(promptNavigationTarget(seqs, 25, "next")).toBe(40);
  });

  it("stops at either end", () => {
    expect(promptNavigationTarget(seqs, 10, "previous")).toBeNull();
    expect(promptNavigationTarget(seqs, 40, "next")).toBeNull();
  });

  it("starts from the last prompt before a reading position is known", () => {
    expect(promptNavigationTarget(seqs, null, "previous")).toBe(40);
    expect(promptNavigationTarget(seqs, null, "next")).toBe(40);
    expect(promptNavigationTarget([], null, "previous")).toBeNull();
  });
});
