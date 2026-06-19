# Ponytail-Audit Rectification Plan

Planning agent output. **No fixes implemented here** — this is the execution plan for 4 parallel agents.

## Ground rules (apply to every workstream)

- **Behavior-identical only.** Allowed operations: dead-code removal, unused-dependency removal, merging exact/near-duplicate logic, flattening re-export hops, deduping helper functions. Nothing else.
- **No visible change** to UI, UX, player/audio, editor, import flows, installer UX, or security/validation behavior.
- **Re-verify before deleting.** Every "delete" task lists a grep to re-run immediately before the edit. If the grep finds a live caller the audit missed, **stop and escalate** instead of deleting.
- **Flatten conservatively.** When flattening a re-export hop, prefer collapsing the *middle* file and keeping the public entrypoint path, so importers don't change. Only repoint importers when the entrypoint itself is the dead file.
- **Gate on green.** After each workstream: `bun run typecheck` must pass, `bun run lint` (eslint src) must pass, and the targeted tests listed must pass. Run `bun audit` only in WS4 (dependency stream).
- Strict-TS project: no `any`, no new `// @ts-ignore`. Deduped helpers must keep exact types.

Repo scripts: `bun run typecheck` (`tsc --noEmit`), `bun test` (Bun), `bun run lint` (`eslint src`).

---

## Workstream 1 — Server structural cleanup

Server-only behavior-identical refactors. Touches `src/server/**` only (plus `tests/` for server units). **Does not touch** `package.json`, `src/client/**`, `src/shared/**`, scripts, or installer.

### Ordered tasks

1. **Flatten `.impl.ts` middle hop** (verified triple hop: `cardService.ts → cardService.impl.ts → cardService/index.ts`).
   - Files: `src/server/services/cardService.ts`, `src/server/services/cardService.impl.ts`, `src/server/services/boardService.ts`, `src/server/services/boardService.impl.ts`, `src/server/services/backupService.ts`, `src/server/services/backupService.impl.ts`.
   - Action: delete each `*.impl.ts`; change each public `*.ts` to `export * from './<svc>/index.js';`. **Keep the public `*.ts` entrypoint** so no importer changes.
   - Verify before: `rg "\.impl(\.js)?'" src/server` (confirm `.impl` is only referenced by the matching outer `*.ts`).
2. **Trello/Wekan import service re-export hop** — inspect `src/server/services/import/trelloImportService.ts` and `wekanImportService.ts`; if they are one-line `export * from './<svc>/index.js'` with the folder being the only real impl, leave the entrypoint and remove any redundant intermediate file the same way as task 1. **If either adds logic, skip it.**
3. **Merge near-duplicate admin reporting modules** — `src/server/services/adminReportingService/memberActivity.ts` + `boardActivity.ts` into one parameterized `listAdminActivityReport({ activityTypes, retentionField, ... })`. Keep both named exports as thin wrappers over the shared impl so callers are untouched.
4. **Merge card-duplication file split** — `src/server/services/cardService/cardDuplication{Types,Map,Load,Persist,Emit}.ts` + orchestrator into `cardDuplication.ts` (one helper file allowed). Keep the exported orchestrator signature identical.
5. **Dedupe `parsePositiveInt` / `parsePositiveIntEnv`** (verified 6 copies) into one `src/server/utils/parseEnvInt.ts`; import it in `clamScanRunner.ts`, `clamSignatureConfig.ts`, `config/mongoPool.ts`, `tmpJanitor.ts`, `services/backupService/runtime.ts`, `middleware/rateLimit.ts`. **Keep every `Math.max/min` clamp at the call site** — only the parse is shared.
6. **Dedupe `normalizeBoardName` / `normalizeListName`** (3 definitions) to a single export from `adminReportingService/pagination.ts`; remove the private copy in `boardOptions.ts` and the inline ternary in `memberActivity.ts`. Then **merge `boardOptions.ts` into `boardList.ts`** (single caller path).
7. **`systemMetricsService/state.ts` setter layer** → plain mutable cache object consumed by `snapshot.ts` / `history.ts`. Behavior-identical; do not change snapshot/history outputs.
8. **Dedupe `cardViewService` TipTap-JSON → plain-text walker** into one shared util; reuse it for the existing summary/search call sites. The extracted function must produce byte-identical output.

### Lower-priority (security-adjacent — do last, each behind its own typecheck+test gate)

9. **Delete `src/server/utils/sanitizeHtml.ts` shim** (one-line re-export of `shared/utils/sanitizeHtml`). Repoint the 4 server importers (`attachmentService/upload.ts`, `privacyPolicyService.ts`, `brandingService.ts`, `importInlineAssetService.ts`, `services/importInlineAssetService.ts`) to `../../shared/utils/sanitizeHtml.js`. Same symbols, no logic change. Skip if it complicates the upload/SVG-block paths.
10. **`backupService/index.ts` pass-through wrappers** — collapse only the *empty* `extends` interfaces and the literal `fn → fnImpl` delegates. **Keep any wrapper that adds logging, validation, or argument shaping.** High caution.

### Verification

```bash
bun run typecheck
bun run lint
bun test tests/  # run server-touching suites; at minimum:
bun test tests/adminReporting* tests/cardDuplication* tests/backup* tests/systemMetrics* tests/cardView*
```

### OUT OF SCOPE for WS1

- `csv-parser` removal (WS4), `date-fns` parse in CSV import, JWT expiry parser merge, MarkdownIt runtime render, `mapServiceErrorToHttp` domain-error re-export, `clamSignatureConfig` fold (clam/security), `bunGc.ts`, `rolePermissionMigrations` orchestrator, `cardService/listBoardValidation.ts` IDOR guard, `attachmentCache` fold + its test, route one-liner flattening — all excluded (see master list).
- Any edit to `src/shared/**`, `src/client/**`, deps, scripts.

### Risk notes

- Tasks 3/4/6/7/8 are merges of *near*-identical code — diff the behavior carefully; a subtle field/branch difference between the merged modules is the main hazard. Keep public signatures and outputs identical.
- Task 9/10 touch upload + backup security paths; keep them last and isolated so a regression is easy to bisect.

---

## Workstream 2 — Client structural cleanup (NO audio / player / UI stack)

`src/client/**` behavior-identical structural refactors only. **Hard exclusions:** anything under the audio/podcast/tiptap-audio stack, the Emoji-Mart shadow-DOM patches, smartcrop, image-resize utils, notification modules, date formatting, stores, and `AuthContext`.

### Ordered tasks

1. **Flatten the non-audio/non-editor `export * from './*.impl.js'` stubs** — collapse the middle file the same conservative way as WS1 task 1 (keep public entrypoint).
   - Eligible: `src/client/components/board/SortableList.tsx`, `KanbanView.tsx`, `VirtualizedCardList.tsx`, `SortableCard.tsx`; `src/client/components/admin/*Section.tsx`; `AdminBackupPanel.tsx`.
   - **Excluded from this list:** `CardDetailView.tsx`, `CardDescriptionEditor.tsx`, `cardDescriptionTiptap.ts`, `tiptapInlineButtonExtension.ts`, `CardDetailViewScrollSections.tsx` (editor/card-detail — out of scope).
   - Verify before each: `rg "from '.*/<Name>\.impl(\.js)?'"` to confirm the `.impl` file is referenced only by its sibling stub.
2. **`src/client/dnd/pragmatic/arrayMove.ts`** (single caller) → inline the splice helper into `homeBoardLayout.ts`. Verify single caller first: `rg "arrayMove" src/client`.

### Conditional / high-churn (only if time permits; behind its own gate)

3. **Home-page pointer-drag 6-file merge** → one `useHomePagePointerDrag.ts` (`homePagePointerDragDownHandler.ts`, `homePagePointerDragMoveHandler.ts`, `homePagePointerDragListeners.ts`, `homePagePointerDragCommit.ts`, `homePagePointerDragTypes.ts`, `homePointerHitTest.ts`). Pure file consolidation, **no logic edits** to drag math/hit-test. High churn; skip if the merge forces any behavioral change. This is DnD plumbing, not the audio/editor stack, so permitted — but treat as risky.

### Verification

```bash
bun run typecheck
bun run lint
bun test tests/  # focus on board DnD + admin panels:
bun test tests/kanbanDragPure.test.ts tests/homeBoardLayout* tests/*Admin* 2>/dev/null || bun test
```

### OUT OF SCOPE for WS2

- All audio/podcast/player: `CardDescriptionAudioPlayer*`, `CardDescriptionPodcast*`, `useCardDescriptionPodcastVolume`, `CardDescriptionPodcastVerticalVolumeSlider`, tiptap-audio subsystem, `cardDescriptionReadonlyAudio`, `cardDescriptionPodcastCompactControls`, `@gfazioli/mantine-audio`.
- Emoji-Mart shadow-DOM patch stack; `smartcrop`; `date-fns` client usages; `fileUtils.formatFileSize`; image-resize trio; long-task notification modules; `socketRealtimeBridge`; `boardInteractionStore`; `readImageAsDataUrl` worker; `buildPreviewModalProps`; CSS `@import` hub merges; `CardDetailView` handler split; `AuthContext`; client `validatePassword`; `descriptionDecorationImageSrc`.
- Offline sync (see master exclusions — it IS wired into `index.tsx`).
- Deps, dead-file deletions, deprecated client aliases → WS4.

### Risk notes

- The `.impl` flatten is the safe core. Re-export flattening is only behavior-identical if you keep the public path; never repoint dozens of importers.
- Task 3 is the one with real regression risk (drag UX). It is explicitly optional; prefer to defer it rather than risk visible behavior change.

---

## Workstream 3 — Shared / tests / scripts / tooling cleanup

`src/shared/**` (safe subset), `tests/helpers/**`, `scripts/**`, `.github/workflows/**`. **Owns all `src/shared/**` edits** so WS1/WS2 never touch shared concurrently.

### Ordered tasks

1. **Dedupe triplicate view-mode union** (`'summary' | 'detail'`: `CardViewMode`, `BoardViewMode`, `WorkspaceViewMode`) → one `ViewMode` union in `src/shared/types`. Repoint `cardViewService.ts`, `boardService/types.ts`, `workspaceService/typesAndHelpers.ts`. Type-only change; no runtime effect. (Coordinate: this is the only shared-types edit; WS1 must not touch these type files.)
2. **Test-helper dedupe** (`tests/helpers/**`):
   - Merge `describeHttpIntegration` / `describeDbIntegration` / `describeMongoTest` → one `describeWhenDeps({ mongo, redis }, name, fn)` in `integrationEnv.ts`; update call sites.
   - Inline `injectApp` one-line delegate → call `apiInject` at call sites.
   - Collapse `integrationHooks.ts` `beforeAllEnsureTestServer` wrapper into a single `beforeAll` where it's used (e.g. `api.test.ts`).
   - These change test scaffolding only; the assertions must run identically.
3. **Scripts dedupe:**
   - Extract the shared Mongo/Redis/MinIO probe loop from `scripts/health-check.sh` + `scripts/wait-for-services.sh` into `scripts/probe-services.sh`; source it from both. Keep each script's CLI behavior identical.
   - Extract the duplicated nanoid corrupt-install guard from `scripts/build-client-with-css.ts` + `scripts/build-npm-package.sh` into `scripts/ensure-nanoid.sh`.
4. **CI dedupe:** factor the duplicated Pages build/deploy job in `.github/workflows/wiki-build.yml` + `jekyll-pages.yml` into a reusable `pages-deploy.yml` (`workflow_call`). **Validate YAML and job names stay identical;** do not change triggers or permissions.

### Verification

```bash
bun run typecheck
bun run lint
bun test                      # full suite — test-helper edits affect many files
# CI: confirm workflows still parse
rg -l "workflow_call|uses:" .github/workflows/
```

### OUT OF SCOPE for WS3

- `listPos.ts`/`cardListPos.ts`/`fractionalPos` factory (ordering semantics — excluded).
- `cardDescriptionDoc/` split, `importPreflightSchema` colocation (validation/import — excluded).
- `DomainError` subclasses; `googleOAuthCallbackUrl` helpers; `adminDestructiveConfirmation`; `cssNamedColorToHex` table; `segmentGraphemes` fallback; `boardThemeCatalog` clone; `build-client-with-css` CSS-rewrite; dev-entrypoint merge (`dev-start.sh`/`dev.ts`); release-artifact scripts; `check-src-line-counts.sh`.
- **All installer files** (`packages/atlantisboard/install/**`, installer harness/tests, CLI stubs, `common.sh` comment block).
- Dead files / unused barrels / deprecated aliases / dep removal → WS4.

### Risk notes

- Test-helper edits (task 2) have the widest blast radius — run the **full** `bun test`, not a subset.
- CI refactor (task 4) can't be fully proven locally; keep the reusable workflow logically identical and rely on the next CI run. If unsure, leave the workflows duplicated rather than risk breaking Pages deploys.

---

## Workstream 4 — Dependencies + dead code + test-only deletions

Cross-cutting deletions of code with **zero callers** (each re-verified below), one unused dependency, and test-only file consolidation. No logic refactors.

### Ordered tasks — dependencies

1. **Remove `csv-parser`** from `package.json` and `packages/atlantisboard/package.json` (verified: source uses `papaparse`; `csv-parser` appears only in manifests/lockfile/docs). Update `bun.lock` via install; **keep `papaparse`.** Update `specifications.md` mention if it lists csv-parser as used.
   - Verify before: `rg "csv-parser|csvParser" src` → expect no source hits.

### Ordered tasks — dead code (re-grep each immediately before deleting; escalate if any live caller appears)

2. Delete `src/client/utils/captureVideoPoster.ts` — `rg "captureVideoPoster" src` should show only the file itself.
3. Delete `scripts/process-css.mjs` — `rg "process-css" .` should be empty.
4. Delete `src/shared/twemoji/twitterEmojiSpriteLookup.ts` (unused barrel) — `rg "twitterEmojiSpriteLookup" src` shows only the file.
5. Delete deprecated emoji aliases `EMOJI_DATASOURCE_TWITTER_SPRITESHEET_64_PUBLIC_PATH`, `getTwitterEmojiSheetMeta`, `getTwitterEmojiSpriteCell` from `src/shared/twemojiPublic.ts` / `src/shared/twemoji/emojiSpriteLookup.ts` — `rg "<eachSymbol>" src` shows only definitions; callers use `EMOJI_SPRITESHEET_PUBLIC_PATH` / `getEmojiSprite*`.
6. Delete `src/server/utils/uploadDiskHeadroom.ts` (verified zero callers; the live guard is `src/server/middleware/uploadDiskHeadroom.ts`) — `rg "utils/uploadDiskHeadroom" src` empty.
7. Delete dead test exports: `registerHttpIntegrationUser`, `makeAuthenticatedRequest` (`tests/helpers/testHelpers.ts`), `waitForServer` (`tests/helpers/integrationHttp.ts`) — verified only defined, never imported.
8. Delete WSL-only dev scripts `scripts/wsl-clone-to-ext4.sh`, `scripts/print-wsl-lan-portproxy.sh` — `rg "wsl-clone-to-ext4|print-wsl-lan-portproxy" .` empty; if referenced only in docs, leave a one-line docs note.
9. Delete deprecated client aliases `ActivityLog` / `useActivityLog` / `activityLogParts` (`src/client/components/activities/ActivityLog.tsx`, `src/client/hooks/activities/useActivityLog.ts`, `activityLogParts.tsx`) — **re-verify importers** with `rg "ActivityLog\b|useActivityLog|activityLogParts" src/client` and confirm everything live uses `MemberAuditLog` / `useMemberAuditLog`. (Note: `useActivityLog` is currently referenced only by `docs/useEffect-allowlist.md`; clean that doc reference too.) If any live importer remains, **escalate** instead of deleting.

### Ordered tasks — test-only deletions

10. Merge colocated `src/client/store/kanbanDragPure.test.ts` into `tests/kanbanDragPure.test.ts` (dedupe duplicate suite); delete the colocated copy after confirming the root suite covers the same cases.

### Verification

```bash
bun run typecheck
bun run lint
bun test
bun audit            # after csv-parser removal
bun install          # regenerate lockfile, then re-run typecheck+test
```

### OUT OF SCOPE for WS4

- **Offline sync removal** — `initializeOfflineSync` is imported by `src/client/index.tsx`; it is NOT zero-caller. Excluded.
- `objectToRecord` / `streamChunkToBuffer` inlining — they have real callers (8 and 2); inlining is churn-heavy, low value, and touches import code. Excluded.
- `attachmentCache.test.ts` / `cardListBoardValidation.test.ts` deletions — tied to WS1 folds that are themselves excluded/optional; do not delete unless the corresponding fold actually lands.
- `cardDescriptionAudioVolumeControl.test.ts`, `cardDescriptionPodcastCompactControls.test.ts`, `descriptionDecorationImageSrc.test.ts` — audio/editor stack, excluded.
- Installer tests/harness deletions — installer-protected, excluded.
- Any logic refactor (those live in WS1–WS3).

### Risk notes

- Deletions are the highest-confidence cuts but the audit's "zero callers" claims were sampled — the mandatory re-grep before each delete is non-negotiable.
- After dep removal, `bun install` rewrites `bun.lock`; commit it and re-run the full suite.

---

## Master EXCLUDED ITEMS (and why)

Dropped from execution because they would change visible behavior, touch protected subsystems, or failed verification:

| Audit item | Reason excluded |
|---|---|
| Remove `@gfazioli/mantine-audio`; collapse audio/podcast player chrome; tiptap-audio subsystem; vertical volume slider; `cardDescriptionReadonlyAudio`; `cardDescriptionPodcastCompactControls`(+test); `cardDescriptionAudioVolumeControl.test` | User-mandated: no audio/player stack changes. |
| Emoji-Mart shadow-DOM patch stack | User-mandated protect; changing it alters picker rendering/touch behavior. |
| Remove `smartcrop` (board background focal crop) | User-mandated; changes visible crop output. |
| `date-fns` → `Intl` (server CSV import parse + 6 client files) | User-mandated protect `date-fns`; changes date parsing/formatting output (import + UI). |
| `markdown-it` runtime render in `privacyPolicyService` → pre-rendered | User-mandated protect runtime markdown render. |
| Offline sync + Dexie `offlineActions` removal; no-op `logger` | **Verification failed:** `initializeOfflineSync` is imported by `src/client/index.tsx` — not zero-caller. |
| `fractionalPos` factory / `listPos`+`cardListPos` merge | User-mandated: must not affect ordering semantics. |
| Six `DomainError` subclasses → single constructor | User-mandated: API error codes may rely on `instanceof`. |
| `mapServiceErrorToHttp` domain-error re-export collapse | Couples to DomainError/error-code mapping; security/contract risk. |
| Installer module merge (`common-*.sh`), `uninstall-lib.sh`, `reverse-proxy.sh`, CLI stubs, harness/tests, `common.sh` comment block | User-mandated: no installer-behavior risk. |
| `cardService/listBoardValidation.ts` (IDOR guard) inline (+test) | Security/authz boundary — protected. |
| `rolePermissionMigrations` orchestrator; `googleOAuthCallbackUrl`; client/server `validatePassword` dedupe; `adminDestructiveConfirmation`; JWT expiry parser; `clamSignatureConfig` fold | Security/auth/validation behavior — protected. |
| `ApiClient` mixin rewrite; `socketRealtimeBridge`; `boardInteractionStore`; `readImageAsDataUrl` worker; image-resize trio; long-task notifications; `CardDetailView` handler split; `AuthContext`; `buildPreviewModalProps`; `fileUtils.formatFileSize`; CSS `@import` merges; `descriptionDecorationImageSrc` | Functional/UI/UX behavior risk (state, realtime, formatting, modals, styling). |
| `cardDescriptionDoc/` split; `importPreflightSchema` colocation; `cardDescriptionDoc.ts` barrel | Editor/import **validation** behavior — protected. |
| `boardThemeCatalog` `cloneTheme` → readonly refs; `cssNamedColorToHex` table → DOM/Option; `segmentGraphemes` fallback removal | Changes runtime behavior / visible output / edge-runtime correctness. |
| Dev-entrypoint merge (`dev-start.sh`/`dev.ts`); `build-client-with-css` CSS-rewrite → PostCSS; release-artifact tree scripts; `check-src-line-counts.sh` | Build/dev/release workflow behavior risk. |
| `objectToRecord` / `streamChunkToBuffer` inline | Real callers; low-value, import-code churn. |

---

## Execution dependency notes

- WS1 (server), WS2 (client), WS4 (deletions/deps) can run in parallel. **WS3 owns all `src/shared/**` edits** — WS1's view-mode dedupe was moved to WS3 to avoid two agents editing `src/shared/types` at once.
- WS4 task 9 (ActivityLog aliases) and task 7/10 (test files) can race with WS2/WS3 test edits — run WS4 test-touching steps after WS2/WS3 land, or coordinate file ownership.
- Final gate after all streams merge: `bun run typecheck && bun run lint && bun test && bun audit`.
