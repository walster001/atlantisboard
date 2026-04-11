# Design Review Results: Home Page (`/`)

**Review Date**: 2026-03-06  
**Route**: `/`  
**Component**: `src/client/pages/HomePage.tsx`  
**Focus Areas**: Visual Design · UX/Usability · Responsive/Mobile · Accessibility · Micro-interactions · Consistency · Performance

---

> **Note**: This review was conducted through static code analysis only, as the browser tool is unavailable. Visual inspection via browser would provide additional insights into layout rendering, interactive behaviors, and actual appearance.

---

## Summary

The Home Page is functionally solid with a good foundation (Mantine v8, dnd-kit, offline sync, IndexedDB caching). However, it has significant accessibility gaps, critical consistency violations where native browser dialogs (`confirm()`/`alert()`) bypass the Mantine design system, several UX discoverability issues (hidden menus, no empty-state CTAs, disconnected "Add Board" action), performance concerns (missing `useMemo`, duplicate data-fetching code), and a broken `OfflineIndicator` component that returns `null`. The redesign wireframe addresses the structural layout issues.

---

## Issues

| # | Issue | Criticality | Category | Location |
|---|-------|-------------|----------|----------|
| 1 | `OfflineIndicator` component returns `null` — offline status is never communicated to users or screen readers | 🔴 Critical | UX / Accessibility | `src/client/components/OfflineIndicator.tsx:2` |
| 2 | `BoardGeneralSettings.handleDelete()` uses `window.location.href = '/'` instead of React Router `navigate('/')` — bypasses router lifecycle, breaks back-navigation | 🔴 Critical | Consistency | `src/client/components/board/BoardGeneralSettings.tsx:87` |
| 3 | `BoardGeneralSettings.handleArchive()` and `handleDelete()` use native `confirm()` and `alert()` dialogs — inconsistent with Mantine `modals.openConfirmModal` used elsewhere in the app | 🔴 Critical | Consistency | `src/client/components/board/BoardGeneralSettings.tsx:63-95` |
| 4 | `BoardCardMenu.handleDelete()` uses `window.confirm()` — native dialog inconsistent with Mantine modal system used in `HomePage.handleDeleteWorkspace()` | 🔴 Critical | Consistency | `src/client/components/board/BoardCardMenu.tsx:54` |
| 5 | `Avatar` in `UserMenu` has no `aria-label` — screen readers cannot identify the trigger button | 🔴 Critical | Accessibility | `src/client/components/UserMenu.tsx:67-73` |
| 6 | Board `Card` components in the list have `onClick` but no `role="button"` and no `tabIndex` — boards are not keyboard-accessible | 🔴 Critical | Accessibility | `src/client/pages/HomePage.tsx:405-450, 469-514` |
| 7 | `body` CSS sets `background-color: var(--color-base-200)` but this variable is only defined for dark theme — light-mode body background will be `transparent` | 🟠 High | Visual Design | `src/client/styles/index.css:28` |
| 8 | Board card menu (`BoardCardMenu`) is only revealed on hover via `opacity: 0 → 1` — not discoverable by keyboard users or touch users; no `focus-within` state | 🟠 High | Accessibility / UX | `src/client/pages/HomePage.tsx:427-433, 495-501` |
| 9 | Empty state only shows dimmed text with no action CTA — users with no workspaces have no obvious way to get started | 🟠 High | UX | `src/client/pages/HomePage.tsx:519-524` |
| 10 | All board card headers use the same flat `var(--mantine-color-gray-6)` background — no visual differentiation between boards; `board.background` field exists but is unused | 🟠 High | Visual Design | `src/client/pages/HomePage.tsx:417-422, 483-488` |
| 11 | Board names are forced to `textTransform: 'uppercase'` — reduces readability and overrides user-defined casing | 🟠 High | Visual Design | `src/client/pages/HomePage.tsx:424, 489` |
| 12 | `loadData` and `refreshData` functions duplicate all data-fetching logic (workspaces + boards fetch + IndexedDB save) — violation of DRY; any bug fix must be applied in two places | 🟠 High | Performance / Consistency | `src/client/pages/HomePage.tsx:75-150` |
| 13 | Redundant display of user's name — `<Text fw={500}>{user.displayName}</Text>` appears next to the `UserMenu` Avatar which already shows initials | 🟡 Medium | Visual Design | `src/client/pages/HomePage.tsx:333` |
| 14 | `boardsByWorkspace` Map is recomputed on every render — should be wrapped in `useMemo([allBoards, workspaces])` | 🟡 Medium | Performance | `src/client/pages/HomePage.tsx:249-261` |
| 15 | `UserMenu` and `BoardCardMenu` both manually add global `document.addEventListener('mousedown')` and `'keydown'` for click-outside/Escape — redundant because Mantine's `Menu` already handles this natively via `onChange` prop | 🟡 Medium | Consistency / Performance | `src/client/components/UserMenu.tsx:13-35`, `src/client/components/board/BoardCardMenu.tsx:19-41` |
| 16 | Full-page centered spinner during loading — no skeleton layout — causes layout shift and feels slower than a skeleton screen | 🟡 Medium | UX / Micro-interactions | `src/client/pages/HomePage.tsx:263-277` |
| 17 | "Add Board" button in the right sidebar does not pass `workspaceId` context — board is always created without a workspace, even if the user is visually browsing a specific workspace | 🟡 Medium | UX | `src/client/pages/HomePage.tsx:570-579` |
| 18 | Action buttons sidebar order: "Import" appears first (lowest priority action) above "New Workspace" and "Add Board" — visual priority should match task frequency | 🟡 Medium | UX | `src/client/pages/HomePage.tsx:530-579` |
| 19 | Native HTML5 `draggable` attribute is set on Mantine `Card` components alongside dnd-kit's `PointerSensor` — this can cause duplicate drag events and broken behavior | 🟡 Medium | Consistency / Performance | `src/client/pages/HomePage.tsx:411, 476` |
| 20 | dnd-kit sensors only include `PointerSensor` and `KeyboardSensor` — no `TouchSensor` configured; drag-and-drop will not work on mobile/tablet touch screens | 🟡 Medium | Responsive/Mobile | `src/client/pages/HomePage.tsx:52-58` |
| 21 | Right sidebar action panel has a fixed `width: '256px'` — on screens between `md` and `lg` this could clip or overflow since the flex row doesn't break until `lg:` | 🟡 Medium | Responsive/Mobile | `src/client/pages/HomePage.tsx:529` |
| 22 | Loading spinner (`<Loader size="lg" />`) has no `aria-live` region or `aria-label` — screen readers won't announce the loading state | 🟡 Medium | Accessibility | `src/client/pages/HomePage.tsx:265-276` |
| 23 | `DragOverlay` board card has no ARIA attributes (`aria-grabbed`, `aria-roledescription`) to communicate drag state to assistive technologies | 🟡 Medium | Accessibility | `src/client/pages/HomePage.tsx:584-593` |
| 24 | `isMountedRef` pattern is used to guard async operations — modern pattern is `AbortController`; the ref approach doesn't cancel in-flight requests | ⚪ Low | Performance | `src/client/pages/HomePage.tsx:50, 76-120` |
| 25 | The workspace "⋯" options trigger uses a raw Unicode character `⋯` in a `span` instead of a Tabler icon (`IconDots`) — inconsistent with `BoardCardMenu` which uses `<IconDots />` | ⚪ Low | Consistency | `src/client/pages/HomePage.tsx:358` |
| 26 | Board card hover state reveals menu but has no CSS transition on opacity — abrupt visual appearance | ⚪ Low | Micro-interactions | `src/client/pages/HomePage.tsx:427-433` |
| 27 | No global search capability on the home page — users with many boards have no way to quickly find one without scrolling | ⚪ Low | UX | `src/client/pages/HomePage.tsx` (missing feature) |
| 28 | Workspace rename and description editing launch separate modals — inline editing would be a more fluid UX for these lightweight edits | ⚪ Low | UX / Micro-interactions | `src/client/pages/HomePage.tsx:626-748` |
| 29 | No board count or activity summary shown per workspace section — users have no at-a-glance context | ⚪ Low | UX | `src/client/pages/HomePage.tsx:349-457` |
| 30 | No `<meta name="description">` or page `<title>` update on the Home Page — missed SEO/a11y opportunity | ⚪ Low | Accessibility | `src/client/pages/HomePage.tsx` (missing) |

---

## Criticality Legend

- 🔴 **Critical**: Breaks functionality, violates accessibility standards, or corrupts navigation
- 🟠 **High**: Significantly impacts user experience or design quality
- 🟡 **Medium**: Noticeable issue that should be addressed in a sprint
- ⚪ **Low**: Nice-to-have improvement or minor polish

---

## Issue Summary

| Criticality | Count |
|-------------|-------|
| 🔴 Critical | 6 |
| 🟠 High | 6 |
| 🟡 Medium | 9 |
| ⚪ Low | 7 |
| **Total** | **28** |

---

## Next Steps

### Sprint 1 — Critical & High (address immediately)
1. **Fix `OfflineIndicator`** — implement actual online/offline detection using `navigator.onLine` + `window` events
2. **Replace native dialogs** in `BoardGeneralSettings` and `BoardCardMenu` with Mantine `modals.openConfirmModal()` and `notifications.show()` — bring in line with rest of the app
3. **Fix navigation** — replace `window.location.href = '/'` with `useNavigate()` in `BoardGeneralSettings.handleDelete()`
4. **Add `aria-label`** to the `UserMenu` Avatar trigger
5. **Make board cards keyboard accessible** — add `role="button"` and `tabIndex={0}` with `onKeyDown` handler (Enter/Space → navigate)
6. **Fix CSS variable** — define `--color-base-200` in `:root` for light mode, or switch `body` background to use the Mantine color system
7. **Use `board.background`** to color-code board card headers; fall back to a palette of patterns when no background is set
8. **Remove `textTransform: uppercase`** from board names
9. **Add empty-state CTA** — button that opens `CreateWorkspaceModal` or `CreateBoardModal` from the empty state

### Sprint 2 — Medium Priority
10. **Extract `loadData` into `refreshData`** — eliminate the code duplication; call `refreshData` in the initial useEffect
11. **Wrap `boardsByWorkspace`** computation in `useMemo`
12. **Remove redundant click-outside/Escape event listeners** from `UserMenu` and `BoardCardMenu` — let Mantine handle them
13. **Replace loading spinner** with `Mantine Skeleton` cards grid (preserve layout during load)
14. **Add `TouchSensor`** to dnd-kit sensors array for mobile drag support
15. **Pass workspace context to "Add Board"** — pre-select the currently viewed workspace
16. **Remove `draggable` HTML attribute** from board Cards — use dnd-kit's `useSortable` hook instead
17. **Add `aria-live="polite"`** wrapper around loading state
18. **Fix action button order** — "New Workspace" first, "Add Board" second, "Import" last (or in a secondary menu)

### Sprint 3 — Low Priority / Polish
19. Replace `isMountedRef` with `AbortController` for cleaner async cancellation
20. Replace workspace menu `⋯` span with `<IconDots />` from `@tabler/icons-react`
21. Add `transition: opacity 150ms ease` on board card hover menu
22. Add global search to the navigation bar
23. Consider inline editing for workspace rename/description (avoid modal for trivial edits)
24. Add board count badge per workspace in the sidebar/header
25. Update document `<title>` to `"Home — KanBoard"` using `useEffect`
