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
  auto-update off. Permanent while this fork exists.
- **Empty dictation results explain themselves and can be retried.**
  `packages/app/src/hooks/use-dictation*`. Upstream PR #8327; drop when merged.
- **Dictation recorder grays out on silence.** `packages/app/src/dictation/pcm-level.ts`
  and the recorder UI. Upstream PR #8328; drop when merged.
- **Recent dictations kept for retry.** `packages/app/src/dictation/recordings/`,
  Settings > Voice. Upstream PR #8329; drop when merged.
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
