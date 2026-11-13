/**
 * YPaseo: a finished subagent does not put its workspace in "Ready to review".
 *
 * A coordinator launches each child in a workspace of its own, which makes the child that
 * workspace's root agent, so its "finished" mark used to land the workspace in the
 * `attention` bucket. The parent consumes the child's result; the mark is noise. While the
 * parent is still active, the workspace bucket ignores a plain finished mark. A pending
 * permission (`needs_input`) or an error (`failed`) still counts, and so does every mark once
 * the parent is archived or gone. Agent-level attention is untouched: the agent still
 * carries the mark, and clearing it works as before.
 */
import type { AgentAttentionReason } from "@getpaseo/protocol/agent-state-bucket";
import { getParentAgentIdFromLabels } from "@getpaseo/protocol/agent-labels";

export interface YpaseoAttentionAgent {
  labels?: Record<string, unknown> | null;
  requiresAttention?: boolean;
  attentionReason?: AgentAttentionReason;
}

/**
 * The `requiresAttention` value to derive a workspace root agent's bucket from.
 * `activeAgentsById` holds the unarchived agents.
 */
export function ypaseoRootRequiresAttention(
  agent: YpaseoAttentionAgent,
  activeAgentsById: ReadonlyMap<string, { archivedAt?: string | null }>,
): boolean | undefined {
  if (!agent.requiresAttention) {
    return agent.requiresAttention;
  }
  if (agent.attentionReason === "permission" || agent.attentionReason === "error") {
    return true;
  }
  const parentAgentId = getParentAgentIdFromLabels(agent.labels);
  if (!parentAgentId) {
    return true;
  }
  const parent = activeAgentsById.get(parentAgentId);
  return !parent || Boolean(parent.archivedAt);
}
