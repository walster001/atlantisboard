# Stale Files & References Report

**Project:** atlboard-new (Kanboard)  
**Generated:** 2026-05-27  
**Updated:** 2026-05-27 — orphan modules and duplicate `.sections.*` barrels **removed**  
**Scope:** Source tree (`src/`), tests, docs/wiki, `pages/`, `public/`, build/runtime artifacts, deprecated APIs

This report lists files and references that appear unused, duplicated, or out of sync with the current architecture. Severity uses:

| Level | Meaning |
|-------|---------|
| **High** | Likely safe to remove or fix; no inbound references found |
| **Medium** | Drift or duplicate; may be intentional but causes confusion |
| **Low** | Deprecated API kept on purpose, or separate entry point |

---

## Executive summary

| Category | Count | Action |
|----------|------:|--------|
| Orphan TypeScript modules (no imports) | 11 | **Done** — deleted |
| Duplicate `.sections.*` barrel files | 9 | **Done** — deleted |
| Deprecated exports never called | 3 | Remove or document |
| Git-tracked generated/runtime artifacts | 2 | Add to `.gitignore`, stop committing |
| Wiki source vs Jekyll output drift | 54 file diffs | Regenerate `pages/wiki` in CI only, or sync locally |
| Unused test preload | 1 | Wire `tests/setup.ts` or delete |
| Intentional separate entry points | 1 | Keep (`src/server/workers/index.ts`) |

No broken relative imports were found in `src/` (`.js` specifiers resolve to `.ts` / `.d.ts` at build time).

---

## 1. High — Orphan source modules

These files export symbols but have **no inbound imports** anywhere in `src/` or `tests/` (verified via static reachability and ripgrep).

| File | Notes | Last meaningful change |
|------|-------|------------------------|
| `src/client/components/board/BoardCard.tsx` | Superseded by `HomeBoardCardTile.tsx` + `BoardCardMenu.tsx` | Initial commit |
| `src/client/components/workspace/WorkspaceCard.tsx` | Old home workspace card UI | Initial commit |
| `src/client/components/card/CardDescriptionBoardPreview.tsx` | Board description preview component, never wired | — |
| `src/client/hooks/useSync.ts` | Offline/sync hook; no callers | 2026-04-22 |
| `src/client/hooks/useVisualViewportKeyboard.ts` | Mobile keyboard dock helper; no callers | — |
| `src/client/components/board/useKanbanHorizontalWindowing.ts` | Kanban column windowing; no callers | — |
| `src/client/utils/snapMobileBoardColumnScroll.ts` | Left after DnD refactor (comment in commit mentions removed canvas drag-scroll) | 2026-05-11 |
| `src/client/utils/kanbanDexieLoad.ts` | Dexie load helper; no callers | 2026-04-22 |
| `src/client/constants/memberManagementLayout.ts` | Exports `MEMBER_MANAGEMENT_ROLE_COL_PX`; never imported | — |
| `src/server/middleware/permissions.ts` | Exports `requirePermission()`; routes use `utils/permissions.js` directly | — |
| `src/shared/types/models.ts` | Only re-exported by unused `shared/types/index.ts` | — |

**Recommendation:** Delete after a quick product check, or restore imports if a feature was left half-integrated (especially `useVisualViewportKeyboard` / `useKanbanHorizontalWindowing`).

### 1.1 Supersession analysis — safe to delete?

| File | Verdict | Superseded by | Notes |
|------|---------|---------------|-------|
| `BoardCard.tsx` | **Safe to delete** | `HomeBoardCardTile.tsx`, `BoardCardMenu.tsx`, `resolveHomeBoardTileCoverDisplay` | Old home grid card (Link + Mantine Card + visibility badge). Current home uses drag/reorder, cover headers, and context menu. No imports. |
| `WorkspaceCard.tsx` | **Safe to delete** | `HomeWorkspaceSection.tsx` + `useHomePageController` | Old per-workspace card with nested board link buttons. Home is now a horizontal board strip per workspace. Links to `/workspace/:id` but router only has `/workspaces/:id` — dead even if imported. |
| `CardDescriptionBoardPreview.tsx` | **Safe to delete** | `sortableCardDescriptionPreview.ts` + `SortableCard.impl.tsx` | Planned full Tiptap `renderToReactElement` on kanban tiles. Shipped path uses plain-text first line / `descriptionPreview` + `TwemojiPlainText` for performance. Rich readonly still uses `CardDescriptionReadonly.tsx` in card detail. |
| `useSync.ts` | **Safe to delete** | `useHomePageDataLoader.ts`, `boardBootstrap.ts`, `offlineSync.ts` | Duplicated `syncWorkspaces` / `syncBoards` / `syncLists` / `syncCards` API→Dexie helpers. Home loads via `fetchHomeData` + `persistHomeDataToDexie`; board view uses `bootstrapBoardRuntimeFromApi` + `boardRuntimeStore`; offline queue is `initializeOfflineSync()`. |
| `useVisualViewportKeyboard.ts` | **Safe to delete** (or wire up later) | Not integrated | Would dock a toolbar above the mobile keyboard via `visualViewport`. `CardDescriptionEditor` uses `isMobile` + Mantine toolbar only. `useKanbanViewController` / `useResponsiveTier` listen to `visualViewport` for layout, not this hook. Deleting loses no current behavior; keep only if you plan to add keyboard-docked editor chrome. |
| `useKanbanHorizontalWindowing.ts` | **Safe to delete** | `KanbanView/useKanbanHorizontalVirtualization.ts` | Near-duplicate logic (`mountedLists`, spacers, `LIST_WINDOW_OVERSCAN_COLUMNS`). Active hook is used from `useKanbanViewController.ts` with an `enabled` flag (off on mobile carousel). |
| `snapMobileBoardColumnScroll.ts` | **Safe to delete** | Mobile **Swiper** carousel in `KanbanView.impl.tsx` | Scroll-snap correction for horizontal `board-page__body` scroll. Mobile tier no longer uses that scroll model; tablet/desktop use virtualization, not snap helpers. |
| `kanbanDexieLoad.ts` | **Safe to delete** | `boardBootstrap.ts`, `boardRuntimeStore`, `boardDexieCache.ts` | `loadKanbanCardsMapFromDexie` loaded cards into a `Map` for Kanban. Runtime is now Zustand `boardRuntimeStore` hydrated from API snapshot (batched via `applyKanbanCardsMapPartial`), with Dexie as cache via `persistBoardSnapshotToDexie`. |
| `memberManagementLayout.ts` | **Safe to delete** | `boardMemberManagement.css` (hardcoded widths) | Constant `MEMBER_MANAGEMENT_ROLE_COL_PX = 260` never imported. Role column uses CSS `min-width: 200px; max-width: 320px` in `.board-member-management__td--role`. |
| `middleware/permissions.ts` | **Safe to delete** | Inline `hasPermission()` in route handlers | Express middleware factory `requirePermission()` was never registered. All routes call `hasPermission` from `server/utils/permissions.ts` directly. |
| `shared/types/models.ts` (+ `index.ts`) | **Safe to delete** | Per-domain types: `viewModels.ts`, Mongoose models, `Board.ts` types | Legacy shared unions (`BoardVisibility`, `Role`, etc.). Code imports `viewModels`, `express.d.ts`, `loginBranding`, etc. — not `models.ts`. `BoardVisibility` on server lives in `models/Board.ts`. Also delete `shared/types/index.ts` if nothing starts importing the barrel. |

**Bottom line:** All 11 orphan modules were removed (including `useVisualViewportKeyboard.ts`). `shared/types/index.ts` removed with `models.ts`. Nine duplicate `*.sections.*` barrels removed. `bun test`: 212 pass, 1 unrelated fail (`passwordResetToken` still expects 1h TTL).

---

## 2. High — Duplicate `.sections.*` barrel files

Nine files mirror the canonical barrel pattern (`Component.tsx` → `Component.impl.tsx`) but are **never imported**. Each only contains:

```ts
export * from './Component.impl.js';
```

| Stale duplicate | Canonical barrel |
|-----------------|------------------|
| `AdminBackupPanel.sections.tsx` | `AdminBackupPanel.tsx` |
| `AppBrandingSection.sections.tsx` | `AppBrandingSection.tsx` |
| `LoginOptionsSection.sections.tsx` | `LoginOptionsSection.tsx` |
| `KanbanView.sections.tsx` | `KanbanView.tsx` (if present) / direct impl imports |
| `SortableList.sections.tsx` | `SortableList.tsx` |
| `CardDescriptionEditor.sections.tsx` | `CardDescriptionEditor.tsx` |
| `CardDetailView.sections.tsx` | `CardDetailView.tsx` |
| `HomePage.sections.tsx` | `HomePage.tsx` |
| `tiptapInlineButtonExtension.sections.ts` | `tiptapInlineButtonExtension.ts` |

**Note:** `LoginOptionsSection/sections.tsx` (folder) is **active** and imported by `LoginOptionsSection.impl.tsx`. Do not confuse with `LoginOptionsSection.sections.tsx` (root duplicate).

**Recommendation:** Delete all nine `*.sections.tsx` / `*.sections.ts` root-level duplicates.

---

## 3. Medium — Unused shared types barrel

| File | Issue |
|------|-------|
| `src/shared/types/index.ts` | Re-exports `models.js` + `viewModels.js`; **no imports** from `shared/types` or `shared/types/index` |
| `src/shared/types/models.ts` | Legacy union types (`BoardVisibility`, `Role`, etc.); codebase imports specific files (`viewModels.ts`, `express.d.ts`, etc.) |

**Recommendation:** Either delete `index.ts` and `models.ts` if types are duplicated elsewhere, or consolidate imports onto the barrel.

---

## 4. Medium — Deprecated APIs (defined, not called)

| Symbol | Location | Status |
|--------|----------|--------|
| `exportBoard()` | `boardExportService.ts` | `@deprecated`; callers use `exportBoardPayload()` |
| `createImportPlaceholderUser()` | `importPlaceholderUserService.ts` | Always throws; directs to `getOrCreateBoardImportPlaceholder` |
| `BOARD_DEFAULT_THEMES` | `shared/boardTheme.ts` | `@deprecated` alias of `SYSTEM_BOARD_THEME_SEEDS`; no usages |

**Recommendation:** Remove in a dedicated cleanup PR after confirming no external consumers.

---

## 5. Medium — Git-tracked generated / runtime artifacts

| Path | Size / role | Issue |
|------|-------------|-------|
| `public/index.js` | ~7.9 MB | Client bundle; produced by `bun run build:client` / dev build; should not live in source control |
| `src/server/emails/layouts/custom.handlebars` | ~2 KB | **Runtime cache** written by `emailService.syncCustomLayout()` from DB `customLayoutHtml`; committed copy can be stale vs production |

**Recommendation:**

- Add `public/index.js` (and optionally `public/index.css` if also generated) to `.gitignore` if builds always regenerate them.
- Add `src/server/emails/layouts/custom.handlebars` to `.gitignore`; keep only `main.handlebars` in repo.

---

## 6. Medium — Documentation dual-tree drift

### Wiki pipeline (by design)

- **Source of truth:** `docs/wiki/*.md` (+ `docs/wiki/images/`)
- **Build:** `.github/scripts/build-wiki.sh` → `pages/wiki/` + `pages/assets/wiki/`
- **CI:** `.github/workflows/wiki-build.yml` on `docs/wiki/**` changes

### Drift detected locally

- `docs/wiki/`: **100** tracked files  
- `pages/wiki/`: **52** tracked files  
- `diff -rq docs/wiki pages/wiki`: **54** differences (content + `docs/wiki/Home.md` only in source)

Committed `pages/wiki/` can be **stale** relative to `docs/wiki/` until CI runs or `build-wiki.sh` is executed locally.

**Recommendation:** Either stop committing `pages/wiki/` (CI-only artifact) or run `bash .github/scripts/build-wiki.sh` before commits that touch wiki source.

### Other docs

| Item | Notes |
|------|-------|
| `docs/wiki-inclusions.md` | Large inclusion manifest; references `docs/wiki/images/` placeholders |
| `README.md` | Points to `docs/wiki/Home.md` (correct source path) |
| `pages/_config.yml` | `wiki_path: docs/wiki` — Jekyll may read source path while built pages live under `pages/wiki/` |

---

## 7. Low — Intentional / non-stale

| Item | Why it is not stale |
|------|---------------------|
| `src/server/workers/index.ts` | Separate process entry (`bun run dev:worker`, `start:worker`); not imported from `index.ts` by design |
| `src/server/utils/permissions.ts` | Heavily used; only `middleware/permissions.ts` is orphan |
| `*.impl.tsx` + thin `*.tsx` barrels | Active pattern (e.g. `EmailBrandingSection.tsx` → `.impl.tsx`) |
| `deprecatedForInteractiveDnD` on card bulk routes | Intentional API flag for legacy list reflow |
| `public/index.html`, `public/sw.js`, `public/manifest.json` | SPA / PWA static assets (served by server) |

---

## 8. Low — Unused test harness

| File | Issue |
|------|-------|
| `tests/setup.ts` | Defines `beforeAll`/`afterAll` DB hooks; **not referenced** in `package.json`, `bunfig.toml`, or any test file |

Individual tests use `tests/helpers/testHelpers.ts` directly.

**Recommendation:** Add Bun preload for `tests/setup.ts` if global DB setup is desired, otherwise delete.

---

## 9. Email branding — preview vs sent email (recent fix context)

Not stale files, but a **mapping gap** that was fixed in code (verify after deploy):

| Layer | Background handling |
|-------|---------------------|
| Live preview (`EmailBrandingPreviewPane.tsx`) | Uses draft `backgroundColor` directly |
| Sent email (`main.handlebars` / `custom.handlebars`) | Layout card bg; child templates had hardcoded `#e9e6dc` info box |

Ensure `custom.handlebars` on disk is regenerated by saving Email Branding in admin (or delete tracked copy and let server rewrite).

---

## 10. Suggested cleanup order

1. **Quick wins:** Delete nine `*.sections.*` duplicate barrels.  
2. **Orphans:** Remove `BoardCard.tsx`, `WorkspaceCard.tsx`, `kanbanDexieLoad.ts`, `snapMobileBoardColumnScroll.ts`, `middleware/permissions.ts`, etc.  
3. **Git hygiene:** Ignore `public/index.js` and `custom.handlebars`.  
4. **Wiki:** Run `build-wiki.sh` or stop tracking `pages/wiki/`.  
5. **Deprecated APIs:** Remove `exportBoard`, `createImportPlaceholderUser`, `BOARD_DEFAULT_THEMES` when convenient.  
6. **Tests:** Wire or delete `tests/setup.ts`.

---

## Methodology

- Static import graph from entry points: `src/client/index.tsx`, `src/server/index.ts`, `src/server/workers/index.ts`, `tests/*.test.ts`
- Ripgrep for symbol usage across `src/` and `tests/`
- `diff -rq docs/wiki pages/wiki` for documentation drift
- `git ls-files` for tracked build artifacts
- Manual review of `.impl.tsx` / barrel patterns and deprecated JSDoc

**Limitations:** Dynamic `import()`, string-built paths, and runtime-only references are not fully analyzed. Orphan list may include files planned for near-term use—confirm before deletion.
