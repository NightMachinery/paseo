// YPaseo fork: see YPASEO.md. Switches for local changes that hide upstream UI.

// "Set up worktree scripts" is dismissed per project, and every git worktree
// created outside Paseo is a project of its own (getpaseo/paseo#9192), so it
// keeps coming back. Upstream request: getpaseo/paseo Discussion #9197.
export const SHOW_WORKTREE_SETUP_CALLOUT = false;

// Cmd+N and the sidebar's "New workspace" open the screen without the active
// project, so it starts on "Scratch workspace" (a fresh git repository) instead; see
// ./scratch-workspace.ts. A project's own "+" and "New worktree" still preselect it.
export const NEW_WORKSPACE_STARTS_IN_SCRATCH = true;
