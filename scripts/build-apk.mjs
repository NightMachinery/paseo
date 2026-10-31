import { spawnSync, execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const target = process.argv[2] ?? "universal";
const architectures = {
  universal: "armeabi-v7a,arm64-v8a,x86,x86_64",
  arm64: "arm64-v8a",
}[target];
if (!architectures) {
  throw new Error(`Unknown APK target: ${target}. Use universal or arm64.`);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const app = path.join(root, "packages/app");
const env = {
  ...process.env,
  APP_VARIANT: process.env.APP_VARIANT ?? "production",
  PASEO_WATCHDOG_BUILD: "1",
  PASEO_DIAGNOSTIC_BUILD_TIME: new Date().toISOString(),
  PASEO_DIAGNOSTIC_REVISION:
    execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() +
    (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()
      ? "-dirty"
      : ""),
};
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("npm", ["run", "build:app-deps"], root);
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], app);
// expo prebuild deletes android/, and with it Gradle's record of which tasks are up to
// date, so every build recompiled everything. A fork's builds can keep that record in a
// directory of their own: copied in here, and back out after Gradle. It has to be a copy:
// with android/.gradle as a symlink, Gradle treats every library's outputs as stale.
const gradleStateDir = process.env.PASEO_ANDROID_GRADLE_STATE_DIR;
const androidGradleDir = path.join(app, "android/.gradle");
if (gradleStateDir && existsSync(gradleStateDir)) {
  rmSync(androidGradleDir, { recursive: true, force: true });
  cpSync(gradleStateDir, androidGradleDir, { recursive: true });
}
// Gradle does not track Metro's environment flags. Always regenerate the JS artifact
// so a previous ordinary release cannot silently bypass the profiling renderer.
rmSync(path.join(app, "android/app/build/generated/assets"), { recursive: true, force: true });
// A fork's builds can add Gradle flags (signing, cache locations). One that names a
// default's option replaces it, because Gradle rejects an option given twice.
const extraGradleArgs = process.env.PASEO_GRADLE_ARGS?.split(/\s+/).filter(Boolean) ?? [];
const optionName = (arg) => arg.split("=")[0];
const overridden = new Set(extraGradleArgs.map(optionName));
const defaultGradleArgs = ["--no-daemon", "--max-workers=2", "-Dorg.gradle.parallel=false"];
run(
  "./gradlew",
  [
    "assembleRelease",
    ...defaultGradleArgs.filter((arg) => !overridden.has(optionName(arg))),
    `-PreactNativeArchitectures=${architectures}`,
    ...extraGradleArgs,
  ],
  path.join(app, "android"),
);
if (gradleStateDir) {
  const staging = `${gradleStateDir}.new`;
  rmSync(staging, { recursive: true, force: true });
  cpSync(androidGradleDir, staging, { recursive: true });
  rmSync(gradleStateDir, { recursive: true, force: true });
  renameSync(staging, gradleStateDir);
}
const destination = path.join(
  root,
  `artifacts/${env.APP_VARIANT === "ypaseo" ? "ypaseo" : "paseo-dogfood"}-${target}.apk`,
);
mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(path.join(app, "android/app/build/outputs/apk/release/app-release.apk"), destination);
console.log(`\nDiagnostic release APK: ${destination}\nLogs: Downloads/Paseo diagnostics\n`);
