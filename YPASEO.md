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

- **Background visibility for CLI runs.** `packages/cli/src/commands/agent/run.ts`
  adds `--background` and `--no-background` for agent visibility. Use
  `--no-wait` to return immediately. Upstream:
  https://github.com/getpaseo/paseo/pull/10239. Drop when it (or an
  equivalent CLI visibility control) ships.
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
- **Android dictation recovers from a silent Bluetooth microphone.** The Android
  audio engine waits for the headset route and switches to the phone mic if
  the route fails or returns only zero samples. The app keeps the dictation
  running and shows a notice. `AudioEngine` logs the route and PCM statistics.
  Settings > Voice > Dictation > Microphone offers a device-local override
  that uses the built-in microphone without taking playback focus.
  Upstream draft on branch `android-bt-dictation`. Drop the recovery and
  the picker as upstream ships equivalent behavior.
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
- **A Claude turn that ends with a steer still queued finishes after Claude answers it.**
  `packages/server/src/server/agent/providers/claude/agent.ts` (`holdTurnCompletion` and the
  steer lifecycle in `forgetStartedMessage`), tests in `providers/claude/agent.test.ts` and
  `daemon-e2e/claude-steer-during-compaction.real.e2e.test.ts`. With upstream #10028 Claude
  Code queues a steer sent during a manual `/compact`, ends the `/compact` turn first and
  answers the steer in a turn of its own. The session now holds a turn's completion while a
  steer it accepted has not started, so status, `paseo wait` and finish notifications fire
  once, after the reply. The same covers a steer that lands while Claude writes its final
  reply. Bounded: a held completion is reported when Claude cancels the steer, or after 15 s
  (logged) if Claude never starts it. Daemon code. Offered upstream on #6806; drop when
  upstream fixes it.
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
- **A typed file path offers its directory in Add project's Existing tab.**
  `packages/app/src/add-project-flow/typed-file-path.ts` and `existing-tab.tsx`,
  with options in `packages/app/src/components/project-picker-options.ts`.
  The exact daemon lookup (`matchMode: "exact"` in
  `packages/server/src/utils/directory-suggestions.ts`, feature
  `directorySuggestionsExactMatch`) confirms a file before offering its parent.
  Upstream PR #9619 (Discussion #9601); drop when merged or equivalent behavior ships.
- **Cmd+N starts in a scratch workspace (a new git repository).**
  `packages/app/src/ypaseo/scratch-workspace*.ts(x)`, called from
  `packages/app/src/screens/new-workspace-screen.tsx` (in place of the project picker hook,
  and around the chat and terminal submit handlers) and from
  `packages/app/src/screens/new-workspace/form/index.tsx` (the picker row and the trigger
  icon); `NEW_WORKSPACE_STARTS_IN_SCRATCH` in `packages/app/src/ypaseo/local-changes.ts`,
  read by `hooks/use-global-new-workspace-action.ts` and
  `components/sidebar/sidebar-nav-rows.tsx`; daemon side
  `packages/server/src/server/ypaseo/scratch-project-directory.ts`, wrapped around
  `createProjectDirectory` in `session.ts`. Cmd+N and the sidebar's New workspace no longer
  pass the active project, and the picker then selects "Scratch workspace": the first row,
  with a flask icon, the subtitle "New git repository in ~/tmp/paseo-workspaces" and a
  separator before the projects; the trigger shows the same icon. The first message creates
  `~/tmp/paseo-workspaces/<noun-verb-adverb>` on the host, runs `git init` with one empty
  commit, registers it and continues as a Local workspace there. A project's own
  new-workspace button and New worktree still preselect that project. The `git init` is
  daemon code: a daemon without it makes a plain directory, and fails when the scratch root
  does not exist. Browser test `packages/app/e2e/browser/ypaseo-scratch-workspace.spec.ts`.
  Upstream browser specs that expect Cmd+N or the sidebar button to preselect the active
  project (`new-workspace-preselect.spec.ts`, the first test of `new-workspace-entry.spec.ts`)
  fail on this branch by design and are left unedited.
  Upstream Discussion #9623; drop when upstream ships a default scratch project for new
  workspaces.
- **A finished subagent in its own workspace does not ask for review.**
  `packages/server/src/server/ypaseo/subagent-attention.ts`, called from
  `applyAgentBucketContributions` in `packages/server/src/server/workspace-directory.ts`, and its
  app twin `packages/app/src/ypaseo/subagent-attention.ts`, called from
  `packages/app/src/utils/workspace-agent-activity.ts` (a workspace the daemon reports as done
  takes its newest root agent's bucket in the app, so both sides need the rule). While the
  parent is unarchived, a child's plain finished mark leaves its workspace in Done instead of
  Ready to review; permission and error marks still count, and the agent keeps its mark. Daemon
  code for the half that sets the bucket. Upstream Discussion #4495 (comment); drop when upstream
  stops cross-workspace subagents from flooding Ready to review.
- **"Mark all as read" on the sidebar's Ready to review group.**
  `packages/app/src/ypaseo/mark-all-read.ts` and `status-group-actions.tsx`, rendered by
  `StatusGroupHeader` in `packages/app/src/components/sidebar/sidebar-status-list.tsx`. A
  hover-revealed button (always shown on touch layouts) that sends one `workspace.clear_attention`
  request per host with all of the group's workspaces, the request a row's own Mark as read uses.
  Browser test `packages/app/e2e/browser/ypaseo-ready-to-review.spec.ts`, which also covers the
  finished-subagent entry above. Upstream Discussion #4495 (comment); drop when upstream ships
  a bulk mark-as-read.
- **ACP thinking probe, and a recorded model that follows thinking changes.**
  `packages/server/src/server/agent/providers/acp-agent.ts` (with `acp-options.ts`, tests in
  `acp-agent.test.ts`, and `test-utils/fake-acp-agent.mjs`). Sits on upstream #9717 (v0.16.0,
  which merged doskoi's #9616 for issue #9646): a model with its own `_meta` reasoning levels
  shows those, and any other model gets the session's levels. Two upstream PRs carried as
  cherry-picks on top: an opt-in `probeModelThinking` provider option that switches the catalog
  probe session through each model that got the session's levels and reads its own
  `thought_level` choices and default, for agents such as `agy acp` that publish no per-model
  metadata (set `"options": {"probeModelThinking": true}` on the provider; the resolver context
  gains `sessionModels` so the probe can see each model's `_meta`); and a fix that records
  `<model>-<level>` after a thinking change, a model change or a `config_option_update` when the
  agent lists that id. Daemon code. Upstream PRs #9682 (written on #9616; needs rebasing on
  #9717) and #9683, both linked from issue #9646. On an upstream merge, a conflict in
  `fake-acp-agent.mjs` is resolved by taking upstream's file and reapplying the
  `models`/`modelLevels` scenario. Drop each part when upstream merges it.
- **Pin and unpin the open workspace from the workspace header's ⋯ menu.**
  `packages/app/src/hooks/use-workspace-pin-toggle.ts` (shared with
  `hooks/use-global-workspace-pin-action.ts`, which now calls it), the item in
  `packages/app/src/screens/workspace/workspace-header-menu.tsx`, wired in `workspace-screen.tsx`;
  carries the upstream PR's `workspace.header.actions.pin`/`unpin` strings in every locale so it
  merges cleanly. Unit test `workspace-header-menu.test.tsx`, browser test
  `packages/app/e2e/browser/workspace-header-pin.spec.ts`. Upstream PR #9697 (branch
  `workspace-header-pin`; related Discussion #8644); drop when upstream merges it.
- **Pinned workspace order follows the host across clients.** Workspace ranks
  in the daemon registry flow through existing workspace updates to the sidebar.
  Older daemons use the device order. Upstream draft on branch
  `sync-pinned-order`; drop when upstream ships it.
- **Workspace tabs follow the host across clients.** The daemon shares open
  tabs, their order, and agent visibility through workspace updates. In host
  settings under Workspaces, Sync workspace splits offers Off (the default), Desktops only, or
  All devices. Older hosts keep the local layout. Proposed upstream in PR
  #10420 (Discussion #10419); related: issue #5886, PR #5887.
- **Queue a message until the running turn ends (`--behavior queue`).** A daemon-owned
  per-agent queue (`packages/server/src/server/agent/agent-message-queue.ts`, persisted in
  `$PASEO_HOME/agent-message-queue/`) behind `AgentManager.streamAgentIfIdle`; CLI
  `paseo send --behavior queue`, MCP `activeTurnBehavior: "queue"`, receipts with
  `disposition`/`queuePosition`/`revived`, `queuedMessages` in snapshots, `paseo inspect` and
  `get_agent_status`, and host `features` in `paseo daemon status --json`. Gated on
  `server_info.features.agentMessageQueue`. Upstream v0.17.2 handles ordinary agent
  messages through its own dispatcher. YPaseo clients and MCP keep explicit
  `queue` durable and start one turn per message. Tests
  `agent-message-queue.test.ts`, `daemon-e2e/message-queue.test.ts`. Upstream PR #10026
  (branch `send-queue-behavior`, issue #9853); drop when upstream merges it.
- **`paseo send` steers by default, or follows `$PASEO_SEND_BEHAVIOR`.**
  `resolveSendBehavior` in `packages/cli/src/commands/agent/send.ts` (tests in `send.test.ts`),
  the `--behavior` help, `public-docs/cli.md` and `cli.zh-CN.md`, and the send example in
  `skills/paseo/SKILL.md`, which passes `--behavior steer`. Without `--behavior` the CLI uses
  the variable when set (`interrupt`, `steer` or `queue`; any other value is an error and
  nothing is sent), else `steer` for every caller, where upstream interrupts for callers that
  are not agents. An interrupt during a Claude tool call makes Claude Code tell the agent its
  tool call was rejected and to stop. The YPaseo client leaves the
  `agent_active_turn_behaviors` capability off so an agent's ordinary `steer`
  waits for the running turn to end. Permanent while this fork exists.
- **Requests to an unloaded agent do not wait for its history replay.** Upstream
  PR #10140 (branch `unloaded-agent-requests`), part of issue #8314.
  Upstream #10369 in v0.17.2 replaces the fork's transcript reader with
  buffered, time-sliced reads. YPaseo still slices timeline ingestion by
  elapsed time in `providers/claude/agent.ts`. A user send with a `messageId` to
  an agent that is not loaded is saved beside its receipt (`message-receipts/index.ts`, under
  `$PASEO_HOME/agent-requests/accepted/`), answered with `deliveryStatus: "queued"` and
  `revived: true`, then delivered after the load by `agent/user-message-delivery.ts`; a failed
  load reports the undelivered text on the agent, and the next start delivers what a stopped
  daemon left. Command lists for an unloaded agent come from its stored config, and the
  provider subagent list loads for history only (`session.ts`). Fork-only part: the queue
  behavior of #10026 goes through `deliverUserMessage` too, so a `queue` send to an unloaded
  agent is answered before the load and has no `disposition`. Daemon code. Tests
  `daemon-e2e/unloaded-agent-requests.test.ts`, `message-receipts/index.test.ts`,
  `providers/claude/agent.history-load.test.ts`. Drop these parts when upstream
  ships equivalent send and history-load behavior.
- **Cmd+Shift+O opens the focused agent's transcript (desktop, local or registered host).**
  `packages/app/src/ypaseo/open-transcript*.ts(x)`: the binding (Ctrl+Shift+O off macOS,
  rebindable, listed under General) is spread into `SHORTCUT_BINDINGS` in
  `keyboard/keyboard-shortcuts.ts`, the action id is added to `keyboard/actions.ts`,
  `keyboard-action-dispatcher.ts` and `route-shortcut.ts`, and `OpenTranscriptHost` (the handler
  and a command center action) is mounted in `app/_layout.tsx`. It targets the focused tab of the
  active workspace and looks up the label and server ID for remote workspaces.
  Desktop side `packages/desktop/src/ypaseo-open-transcript.ts`, registered in
  `daemon/daemon-manager.ts` as the `ypaseo_open_transcript` command, validates the UUID and
  optional host metadata and passes them as positional arguments to the detached
  `paseo-view-transcript` shell function. Registered-host downloads go through the
  local daemon, with progress and cancellation. An older destination daemon
  needs an update. The shell function lives in the owner's scripts repository.
  Upstream's two "old Cmd/Ctrl+Shift+O open-project binding" unit cases are replaced by a comment in
  `keyboard-shortcuts.test.ts`; on a merge conflict keep them out. Fork-only (a personal
  workflow, not offered upstream); permanent while this fork exists.
- **Bare commands are spawned from their resolved PATH location.** `spawnProcess`
  (`packages/server/src/utils/spawn.ts`) resolves a bare command name through PATH with
  `utils/resolve-spawn-command.ts` (all directories checked at once, cached for 10 s) and spawns
  the absolute path, keeping argv[0]. On macOS libuv otherwise calls `posix_spawn` once per PATH
  directory until one succeeds, on the event loop: with a long PATH (401 entries here, git near the
  end) every `git` the workspace watchers start blocked the loop 27 to 136 ms, which held the
  daemon's event-loop delay near 170 ms and made unloaded agents take minutes to load. Measured on
  an isolated daemon: median delay 144 ms to 11 ms. If the cached path fails to spawn (the file
  was removed), the wrapper absorbs that child's queued error, drops the cache entry and retries
  once by bare name (`7a77afa2d`, from the PR review). Daemon code. Tests
  `utils/resolve-spawn-command.test.ts`, `utils/spawn.test.ts`. Upstream: issue
  https://github.com/getpaseo/paseo/issues/10240, PR https://github.com/getpaseo/paseo/pull/10241
  (branch `spawn-resolved-path`); drop when it merges.
- **`paseo permit ls` lists background agents' requests.** It made one `fetchAgents` call
  without `includeBackground` and without paging, so it missed every pending permission of a
  background agent and of any agent past the first 200 (archived ones included). It now reads all
  pages through `fetchAllAgents` and adds `includeBackground` when the host supports background
  workspaces (`fetchPermitAgents` in `packages/cli/src/commands/permit/ls.ts`). `permit allow` and
  `deny` look agents up by id and were not affected. CLI code. Test
  `commands/permit/permit-output.test.ts`. Upstream: issue
  https://github.com/getpaseo/paseo/issues/10654, PR https://github.com/getpaseo/paseo/pull/10655
  (branch `permit-ls-background`); drop when it merges.
- **Restart recovery keeps interrupted turns and queued messages.** Port of upstream PR
  https://github.com/getpaseo/paseo/pull/9277 (author kept) for issue
  https://github.com/getpaseo/paseo/issues/9278, adapted to the fork's queue shutdown order:
  recovery intent is tracked from shutdown entry, so a turn that provider cancellation settles
  to idle during shutdown is still resumed, and the durable message queue waits behind the
  recovery turn (also when reopening publishes an idle snapshot). `agent-manager.ts`,
  `agent-message-queue.ts`, `agent-storage.ts`, `restart-recovery/index.ts`, `bootstrap.ts`, with
  tests and `daemon-restart-resume.e2e.test.ts`. Used with `agents.resumeOnStartup` so the daemon
  can be restarted without waiting for idle. Drop when #9277 (or an equivalent fix) merges.

- **Native transcript downloads over registered hosts.** The session RPC
  `agent.transcript.read_chunk` reads the main Claude or Codex JSONL from the
  provider's configured home. `paseo agent transcript ID --destination HOST`
  uses the local daemon's authenticated host route. Add `-o FILE` to save the
  transcript or `--progress` for byte progress on stderr. Each request returns
  at most 1 MiB of decoded data. A download
  reads up to the initial file size. Appended bytes appear on the next download.
  Replacements and truncation can invalidate a download. Claude sidechains
  are outside the main file. Upstream proposal pending. Drop when upstream
  offers equivalent native transcript downloads.

- **Dictation is wrapped in a speech-to-text block.** Composer dictation is inserted as a
  fenced block labeled `speech-to-text` (on its own line, consecutive dictations merged, fences
  lengthened past any backtick run in the transcript), so agents can treat that text as speech.
  Configurable under Settings > Voice > Dictation or `features.dictation.wrap` (`enabled`,
  `prefix`, `suffix`, `mergeConsecutive`); on by default. App `composer/input/dictation-wrap.ts`,
  `state.ts`, `voice-page.tsx`; daemon `persisted-config.ts`, `speech/speech-settings.ts`. Upstream
  PR https://github.com/getpaseo/paseo/pull/10299 (branch `dictation-stt-block`); drop when it
  merges (keep it on by default here even if upstream ships it off).

- **The paseo skill tells agents to hide helpers' workspaces.** `skills/paseo/SKILL.md` says to
  pass `background: true` to `create_workspace` (CLI `paseo workspace create --background`) for a
  helper the user does not watch, instead of upstream's "override it only when the user
  explicitly asks", and to leave the helper agent itself visible. Without the first, every child
  in its own workspace, and each of its children, showed in the sidebar; with the agent hidden as
  well, the app also dropped it from its parent's subagent track, so it showed nowhere. Drop if
  upstream adopts equivalent guidance.

- **App diagnostic exports and sends client logs.** Settings > About > Diagnostics can
  share a redacted report, send it to a compatible host, or clear the local
  capture. Android includes app-process logcat. App code lives in
  `packages/app/src/diagnostics/client-log-*` and
  `packages/app/modules/paseo-client-logs`. The daemon writes to
  `$PASEO_HOME/client-logs` through `diagnostics.client_logs.upload`. This port
  carries the upstream proposal's translations in every locale to preserve
  translation parity. Upstream Discussion draft prepared. Drop when equivalent
  export, upload, and clear controls ship upstream.
