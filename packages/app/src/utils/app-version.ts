import Constants from "expo-constants";
import appPackage from "../../package.json";

function toVersionOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

export function resolveAppVersion(): string | null {
  const packageVersion = toVersionOrNull(appPackage?.version);
  if (packageVersion) {
    return packageVersion;
  }

  const expoVersion = toVersionOrNull(Constants.expoConfig?.version);
  if (expoVersion) {
    return expoVersion;
  }

  const manifestVersion = toVersionOrNull(
    (Constants as unknown as { manifest?: { version?: unknown } }).manifest?.version,
  );
  if (manifestVersion) {
    return manifestVersion;
  }

  return null;
}

export interface ForkVersion {
  name: string;
  version: string;
  revision: string | null;
}

/** A fork build's own version (set by its app variant), or null for upstream builds. */
export function resolveForkVersion(): ForkVersion | null {
  const config = Constants.expoConfig;
  const version = toVersionOrNull(config?.extra?.forkVersion);
  if (!version) {
    return null;
  }
  return {
    name: toVersionOrNull(config?.name) ?? "Fork",
    version,
    revision: toVersionOrNull(config?.extra?.diagnosticRevision),
  };
}
