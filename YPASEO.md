# YPaseo: rules for this fork

`ypaseo` is a personal build of Paseo: the upstream code plus a short list of
local changes, built as a desktop app (`YPaseo.app`) and an Android app. Every
stable upstream release is merged into it. Those merges stay cheap only if the
local changes stay small, separate and easy to find, and that is what this file
is for. Read it before changing anything on this branch.

## Two terms

- **Local change**: one topic this fork adds or alters, such as "prompt
  navigation shortcuts". Each has an entry in the ledger below.
- **Upstream file**: any file that exists in `getpaseo/paseo`. Editing one is
  what makes merges conflict; adding a new file almost never does.

## Writing a local change

- Prefer a new file to editing an upstream file. Put the logic in the new file
  and make the edit to the upstream file a call or a registration: one to a few
  lines, at a stable spot (the end of a list, beside an existing call).
- Never reformat, reorder or rename upstream code, and never fix upstream style
  in passing. Every touched line is a future conflict.
- Keep each local change in its own commits, with a message that says what it
  does. Do not mix two local changes, or a local change and a merge fix, in
  one commit.
- Translations: add English strings only. Other locales fall back to English,
  and touching nine locale files per change multiplies conflicts by nine.
- Tests follow upstream's rules in `CLAUDE.md`. A local change with logic has a
  test beside it.
- Record the change in the ledger, with its upstream link and the condition
  for dropping it, in the same commit.
- If the change is generally useful, propose it upstream (Discussion first,
  per `CONTRIBUTING.md`) and link it in the ledger. A change upstream adopts is
  a change we stop carrying.

## Merging upstream

- Merge stable release tags only: `vX.Y.Z` that GitHub marks as a release and
  not a prerelease. Never merge `main` or a beta.
- `git config rerere.enabled true` in every clone, so a conflict resolved once
  is resolved the same way next time.
- `git merge --no-ff -m "Merge upstream vX.Y.Z into ypaseo" vX.Y.Z`. Never
  rebase or force-push `ypaseo`.
- Resolving conflicts: keep upstream's version of the surrounding code and
  reapply the local change on top of it. If a conflict needs a decision about
  behaviour (upstream redesigned the code a local change hooks into, or now
  does the same thing differently), stop and report it rather than guess.
- Check the ledger after every merge: a change whose drop condition is met is
  removed in its own commit after the merge.
- Before declaring a merge done: `npm ci`, `npm run build:app-deps:clean`,
  then typecheck `packages/app` and `packages/desktop`, and run the tests of
  every package a local change touches.

## Building

The desktop app is built with `PASEO_DESKTOP_BUILDER_CONFIG=electron-builder.ypaseo.yml`
(see `packages/desktop/electron-builder.ypaseo.yml`), the Android app with the
`ypaseo` variant of `scripts/build-apk.mjs`. The wrappers that add private
inputs (signing keys, Firebase and Expo configuration), install the results
and run the upstream merge automatically are kept outside this repository.

## Ledger of local changes

Each entry: what it is, where it lives, upstream link, when to drop it.

- **YPaseo app variant (Android).** `app.config.js`, `scripts/build-apk.mjs`,
  `packages/app/ypaseo-version.json`, `packages/app/src/utils/app-version.ts`.
  Separate application id, own Firebase and Expo project, own version shown in
  About. Permanent while this fork exists.
- **YPaseo desktop variant.** `packages/desktop/electron-builder.ypaseo.yml`,
  `packages/desktop/src/ypaseo.ts`, hooks in `packages/desktop/src/main.ts`
  and `packages/desktop/src/features/auto-updater.ts`, the config override in
  `packages/desktop/package.json`, and the app name in
  `packages/desktop/scripts/after-pack.js` (it pruned only `Paseo.app`). Own
  app id, name and icon; shares the official app's settings folder; upstream
  auto-update off; signed with the certificate named by `CSC_NAME` when set,
  ad hoc otherwise. Permanent while this fork exists.
- **Empty dictation results explain themselves and can be retried.**
  `packages/app/src/hooks/use-dictation*`. Upstream PR #8327, which maintainers
  carried into #8355 (issue #8339) with a reworded notice; drop when #8355 merges.
- **Dictation recorder grays out on silence.** `packages/app/src/dictation/pcm-level.ts`
  and the recorder UI. Upstream PR #8328; drop when merged.
- **Recent dictations kept for retry.** `packages/app/src/dictation/recordings/`,
  Settings > Voice. Upstream PR #8329, waiting on a maintainer decision about
  retention (overlaps issue #9036); drop when merged.
- **No "Set up worktree scripts" callout.** `packages/app/src/ypaseo/` (`local-changes.ts`,
  `worktree-setup-callout-source.tsx`), imported by `packages/app/src/app/_layout.tsx`.
  Upstream Discussion #9197 (and issue #9192, which makes it recur); drop when
  upstream offers a global dismissal.
- **Alt+Up / Alt+Down jump to the previous / next prompt.**
  `packages/app/src/ypaseo/prompt-navigation*.ts` (web and desktop; a no-op on
  native), called from `packages/app/src/agent-stream/view.tsx`. Works when the
  focus is not in a text field. Upstream Discussion #9198; drop when upstream
  ships prompt navigation keys.
- **Up in an empty composer edits the newest queued message.**
  `packages/app/src/composer/recall.ts` and the composer's key handler in
  `packages/app/src/composer/index.tsx`. Upstream PR #9202 (Discussion #9201);
  drop when merged.
- **Desktop About shows how YPaseo updates.** `packages/app/src/ypaseo/desktop-update-row.tsx`,
  chosen in `packages/app/src/screens/settings-screen.tsx`. Replaces upstream's
  release channel and "Check for updates" rows, which do nothing in YPaseo (its
  updater is off) and whose channel setting is shared with the official app.
  Permanent while this fork exists.
- **A message that arrives during a Claude compaction waits for it.**
  `packages/server/src/server/agent/` (`agent-manager.ts`, `agent-prompt.ts`,
  `agent-sdk-types.ts`, `providers/claude/agent.ts`,
  `finish-subscriptions/internal/observation.ts`), `session.ts` and the
  `schedule/service.ts` type. Daemon
  code: it takes effect only where the daemon runs this fork, not in the desktop
  build. Upstream PR #9208 (issue #6806); drop when merged.
- **A scheduled run that finishes sends no phone push.** `packages/server/src/server/ypaseo/scheduled-push.ts`,
  hooked into `broadcastAgentAttention` in `packages/server/src/server/websocket-server.ts`.
  Permission and error pushes still go out. Daemon code. Replaces the bundle patch
  `setup/patches/paseo/disable-scheduled-push-notifs.zsh` in the scripts repository.
  Upstream Discussion #3948; drop when upstream offers a way to mute these.
- **A Luna agent continues on Luna Reserve when ordinary Codex usage runs out.**
  `packages/server/src/server/agent/providers/codex/luna-reserve.ts`, called from
  `providers/codex-app-server-agent.ts` (turn completion, turn start, turn parameters).
  Only an agent on the reserve's own model moves; it goes back once the backend allows
  ordinary usage again. Daemon code. Upstream PR #9299 (Discussion #4624, issue #4773;
  root cause openai/codex#45132); drop when merged, or when upstream supports the reserve
  another way.
- **The tab strip lists every agent and terminal in the workspace.**
  `packages/app/src/ypaseo/workspace-activity*.ts(x)`, rendered by
  `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx` beside the pane
  actions (main panes only). Running items first, then by last activity, including agents
  with no tab (such as those another agent launched); the focused tab is checked, and
  choosing an item opens or focuses its tab. Browser test
  `packages/app/e2e/browser/ypaseo-workspace-activity-menu.spec.ts`. Upstream Discussion
  #9062 (a plugin panel asking for the same navigation); drop when upstream ships a
  workspace list of agents and terminals.
- **A typed file path offers its directory in Add project's directory search.**
  `packages/app/src/add-project-flow/typed-file-path.ts`, `project-picker-options.ts`
  and `add-project-flow.tsx`. Upstream PR #9619 (Discussion #9601); drop when merged.
- **Add project can open on directory search.** Settings > General > Add project,
  `packages/app/src/add-project-flow/model.ts` and `add-project-flow.tsx`; carries
  the upstream PR's strings in every locale so it merges cleanly. Upstream PR #9621
  (Discussion #9620); drop when merged.
- **Cmd+N starts in a scratch git repository ("Temp").**
  `packages/app/src/ypaseo/temp-project*.ts(x)`, called from
  `packages/app/src/screens/new-workspace-screen.tsx` (in place of the project picker hook,
  and around the chat and terminal submit handlers); `NEW_WORKSPACE_STARTS_IN_TEMP` in
  `packages/app/src/ypaseo/local-changes.ts`, read by `hooks/use-global-new-workspace-action.ts`
  and `components/sidebar/sidebar-nav-rows.tsx`; daemon side
  `packages/server/src/server/ypaseo/temp-project-directory.ts`, wrapped around
  `createProjectDirectory` in `session.ts`. Cmd+N and the sidebar's New workspace no longer
  pass the active project, and the picker then selects "Temp" (listed first). The first
  message creates `~/tmp/paseo-workspaces/<noun-verb-adverb>` on the host, runs `git init`
  with one empty commit, registers it and continues as a Local workspace there. A project's
  own new-workspace button and New worktree still preselect that project. The `git init`
  is daemon code: a daemon without it makes a plain directory, and fails when the temp root
  does not exist. Browser test `packages/app/e2e/browser/ypaseo-temp-project.spec.ts`.
  Upstream browser specs that expect Cmd+N or the sidebar button to preselect the active
  project (`new-workspace-preselect.spec.ts`, the first test of `new-workspace-entry.spec.ts`)
  fail on this branch by design and are left unedited.
  Upstream Discussion #9623; drop when upstream ships a default scratch project for new
  workspaces.
