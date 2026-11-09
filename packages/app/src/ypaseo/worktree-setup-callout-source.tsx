// YPaseo fork: see YPASEO.md. The app layout imports the callout source from
// here instead of from components/, so the switch needs no edit to the layout.
import { WorktreeSetupCalloutSource as UpstreamWorktreeSetupCalloutSource } from "@/components/worktree-setup-callout-source";
import { SHOW_WORKTREE_SETUP_CALLOUT } from "./local-changes";

export function WorktreeSetupCalloutSource() {
  return SHOW_WORKTREE_SETUP_CALLOUT ? <UpstreamWorktreeSetupCalloutSource /> : null;
}
