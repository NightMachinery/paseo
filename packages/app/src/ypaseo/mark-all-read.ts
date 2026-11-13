// YPaseo fork: see YPASEO.md. "Mark all as read" on the sidebar's Ready to review group.
//
// It clears the same thing as a row's own "Mark as read" (`useWorkspaceReadState`): the
// daemon's `workspace.clear_attention` request, which clears every agent of the workspace that
// carries a non-permission attention mark. That request takes a list, so each host gets one
// call with all of its workspaces from the group.

export interface MarkReadRow {
  serverId: string;
  workspaceId: string;
}

export interface WorkspaceAttentionClient {
  clearWorkspaceAttention(workspaceId: string[]): Promise<void>;
}

/** The group's workspace IDs per host, each host and workspace once, in row order. */
export function workspaceIdsByServer(rows: readonly MarkReadRow[]): Map<string, string[]> {
  const byServer = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byServer.get(row.serverId) ?? [];
    if (!ids.includes(row.workspaceId)) ids.push(row.workspaceId);
    byServer.set(row.serverId, ids);
  }
  return byServer;
}

/**
 * Clears attention on every row's workspace, one request per host. Every reachable host is
 * cleared even when another fails; the first failure is rethrown afterwards.
 */
export async function markWorkspacesRead(
  rows: readonly MarkReadRow[],
  getClient: (serverId: string) => WorkspaceAttentionClient | null,
): Promise<void> {
  const results = await Promise.allSettled(
    [...workspaceIdsByServer(rows)].map(async ([serverId, workspaceIds]) => {
      const client = getClient(serverId);
      if (!client) throw new Error(`Host ${serverId} is not connected`);
      await client.clearWorkspaceAttention(workspaceIds);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}
