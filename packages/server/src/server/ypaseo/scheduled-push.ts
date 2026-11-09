/**
 * YPaseo: a scheduled run that merely finishes sends no phone push. Permission
 * requests and errors still push, and the app still marks the run in its
 * sidebar. Upstream request: https://github.com/getpaseo/paseo/discussions/3948
 */
export function ypaseoPushEligible(
  eligible: boolean,
  reason: "finished" | "error" | "permission",
  labels: Readonly<Record<string, string>> | undefined,
): boolean {
  return eligible && !(reason === "finished" && Boolean(labels?.["paseo.schedule-id"]));
}
