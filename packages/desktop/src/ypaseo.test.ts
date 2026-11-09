import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    name: "YPaseo",
    getPath: vi.fn(() => "/appData"),
    setPath: vi.fn(),
  },
}));

vi.mock("electron", () => electron);

import { isYPaseoBuild, shareOfficialUserDataForYPaseo } from "./ypaseo";

describe("YPaseo desktop hooks", () => {
  beforeEach(() => {
    electron.app.isPackaged = true;
    electron.app.name = "YPaseo";
    electron.app.setPath.mockClear();
    delete process.env.PASEO_ELECTRON_USER_DATA_DIR;
  });

  it("shares the official app's settings folder in a packaged YPaseo build", () => {
    shareOfficialUserDataForYPaseo();
    expect(electron.app.setPath).toHaveBeenCalledWith("userData", "/appData/Paseo");
  });

  it("leaves the official build and development runs alone", () => {
    electron.app.name = "Paseo";
    expect(isYPaseoBuild()).toBe(false);
    shareOfficialUserDataForYPaseo();

    electron.app.name = "YPaseo";
    electron.app.isPackaged = false;
    expect(isYPaseoBuild()).toBe(false);
    shareOfficialUserDataForYPaseo();

    expect(electron.app.setPath).not.toHaveBeenCalled();
  });

  it("lets an explicit userData override win", () => {
    process.env.PASEO_ELECTRON_USER_DATA_DIR = "/forced";
    shareOfficialUserDataForYPaseo();
    expect(electron.app.setPath).not.toHaveBeenCalled();
  });
});
