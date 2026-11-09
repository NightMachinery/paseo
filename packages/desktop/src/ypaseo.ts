// YPaseo fork: see YPASEO.md. The YPaseo build is the same app under another
// name (electron-builder.ypaseo.yml sets productName), so these hooks key on it.
import path from "node:path";
import { app } from "electron";

export const YPASEO_PRODUCT_NAME = "YPaseo";
// The official app's settings folder, which YPaseo shares.
export const OFFICIAL_USER_DATA_NAME = "Paseo";

export function isYPaseoBuild(): boolean {
  return app.isPackaged && app.name === YPASEO_PRODUCT_NAME;
}

// Share the official app's settings, hosts and window state instead of starting
// from an empty folder. Only one of the two can run at a time: Electron's
// single-instance lock lives in this folder. An explicit override still wins.
export function shareOfficialUserDataForYPaseo(): void {
  if (!isYPaseoBuild() || process.env.PASEO_ELECTRON_USER_DATA_DIR?.trim()) {
    return;
  }
  app.setPath("userData", path.join(app.getPath("appData"), OFFICIAL_USER_DATA_NAME));
}
