// YPaseo fork: see YPASEO.md. A finished subagent does not put its workspace in "Ready to review".
//
// The daemon applies the same rule to the bucket it sends
// (packages/server/src/server/ypaseo/subagent-attention.ts). The app needs its own copy
// because a workspace the daemon reports as `done` takes the bucket of its newest root agent
// (utils/workspace-agent-activity.ts), and a child in a workspace of its own is that root.
import type { Agent } from "@/stores/session-store";

/**
 * The `requiresAttention` value to derive a workspace root agent's bucket from. A plain
 * finished mark on a child whose parent is still active does not count; a permission or an
 * error mark does, and so does every mark once the parent is archived or unknown.
 */
export function ypaseoRootRequiresAttention(
  agent: Pick<Agent, "parentAgentId" | "requiresAttention" | "attentionReason">,
  parentAgent: Pick<Agent, "archivedAt"> | undefined,
): boolean | undefined {
  if (!agent.requiresAttention) {
    return agent.requiresAttention;
  }
  if (agent.attentionReason === "permission" || agent.attentionReason === "error") {
    return true;
  }
  if (!agent.parentAgentId) {
    return true;
  }
  return !parentAgent || Boolean(parentAgent.archivedAt);
}
