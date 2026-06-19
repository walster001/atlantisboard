# Client `useEffect` allowlist

**Policy:** `code-review-1626.md` §1.2 — effects only for **external-system sync** (network with cleanup, sockets, DOM/browser APIs, third-party libs, blob URL lifecycle).

**Inventory date:** 2026-06-01  
**Command:** `grep -rn 'useEffect' src/client --include='*.ts' --include='*.tsx'`  
**Violations remediated:** derive-only, reset-on-id, ref-sync, and modal-open orchestration effects (see commit diff); remaining hooks below are **allowed**.

## Remediated violations (removed)

| Area | Former pattern | Replacement |
| ---- | -------------- | ----------- |
| `BoardThemeBackgroundPanel` | Sync opacity input from draft when not editing | `displayedOpacityInput` derived during render |
| `cardDetailDateField` | Clear override on ISO date change | Render-time `prevTimeKey` reset |
| `ImportExportModal` / `ExportTab` | Reset tab/format when permissions hide option | Derived `activeModalTab` / `effectiveExportFormat` |
| `useCardDetailViewController` | Sync `initialCard` prop into local state | Render-time prop sync + `key={card.id}` remount |
| `LabelSection` / `AssigneeSection` | Prune optimistic pending when server card updates | `resolve*Pending` + `useMemo` |
| `CreateBoardModal` | Clamp theme id when catalog loads | `effectiveSelectedThemeId` during render |
| `useBoardMemberManagement` | Reset role filter on `boardId` change | Render-time board-id gate |
| `useAdminUsersTab` | Mirror `nextCursor` into ref | Read `nextCursor` state directly |
| `useBoardPermissions` | Copy `boardWorkspaceId` prop into state | Derive `resolvedWorkspaceId` from prop or Dexie |
| `BoardSettings*Panel` | Mount `useEffect` for Dexie row | `key={boardId}` inner shell + one-shot load ref |
| `ProfileSettingsModal` | Reset form when modal opens | Render-time `modalSessionActive` gate |
| `DuplicateTargetBoardListPicker` | Separate effect to push default list id | `resolvedTargetListId` + default inside fetch callback |

## Allowed effects (by file)

| File | Justification |
| ---- | ------------- |
| `components/admin/AdminBackupPanel/useAdminBackupPanelState.ts` | Abortable API load of backup config; polling interval for job status (external I/O). |
| `components/admin/AdminBackupPanel/useRestoreJobPolling.ts` | Poll restore job status until terminal state (external API). |
| `components/admin/AdminDatabasePanel/useAdminDatabasePanelState.ts` | Load DB admin stats on panel mount (abortable API). |
| `components/admin/AdminEmailPanel.tsx` | Load SMTP settings on mount (abortable API). |
| `components/admin/AdminMonitorPanel.tsx` | Initial metrics fetch + refresh interval (external API polling). |
| `components/admin/AppBrandingSection/useAppBrandingSectionController.ts` | Load/save branding via API; file input preview blob lifecycle. |
| `components/admin/CustomFontsSection.tsx` | Font list API fetch; `FontFace` / document font loading (browser API). |
| `components/admin/EmailBrandingSection.impl.tsx` | Load email branding settings (abortable API). |
| `components/admin/LoginBrandingSection.impl.tsx` | Load login branding; preview image object URLs; file input cleanup. |
| `components/admin/LoginOptionsSection/useLoginOptionsState.ts` | Load login options from API; socket/API refresh on save. |
| `components/admin/RolesPermissionsTab/RolesPermissionsTab.tsx` | Load roles + app admins on tab mount (abortable API). |
| `components/admin/useAdminUsersTab.ts` | Admin user directory fetch on query change (external API). |
| `components/board/BoardInlineCardComposer.tsx` | Focus textarea on open (DOM `focus()` — external to React tree). |
| `components/board/BoardInlineListComposer.tsx` | Focus input on open (DOM `focus()`). |
| `components/board/DuplicateListModal.tsx` | Load workspace boards for target picker (abortable API). |
| `components/board/DuplicateTargetBoardListPicker.tsx` | Load boards/lists for duplicate target (abortable API). |
| `components/board/LabelManagement.tsx` | Load labels (API) + subscribe to `board:labels` socket bridge. |
| `components/card/AssigneeSection.tsx` | Abortable `loadBoardMemberUsersForDisplay` on `boardId` change. |
| `components/card/CardDescriptionEditor/CardDescriptionEmojiPicker.tsx` | Close emoji picker on outside pointer (document listener). |
| `components/card/CardDescriptionEditor/descriptionCharLimitHint.tsx` | Measure/truncate hint via DOM ref (layout external). |
| `components/card/CardDescriptionEditor/emojiMartPicker.tsx` | Mount `@emoji-mart` picker into DOM container (third-party widget). |
| `components/card/CardDescriptionEditor.impl.tsx` | Tiptap editor lifecycle; pending media registry cleanup on unmount. |
| `components/card/CardDescriptionVideoPlayer.tsx` | Video element `loadedmetadata` / poster frame (DOM media API). |
| `components/card/CardDetailView/useCardDetailViewController.ts` | Unmount cleanup for pending description upload blobs (external blob registry). |
| `components/card/CardDetailViewScrollSections/dateSections.tsx` | Scroll-into-view for date popover anchor (DOM `scrollIntoView`). |
| `components/card/LabelSection.tsx` | Load board labels (API) + `subscribeSocketBoardLabelsChanged`. |
| `components/card/useChecklistSection.tsx` | Checklist API load; socket checklist events; drag auto-scroll DOM listeners. |
| `components/common/TwemojiPlainText.tsx` | Parse plain text to Twemoji DOM nodes (third-party DOM mutation). |
| `components/import-export/` *(none)* | Violations removed; no remaining effects. |
| `components/invites/CreateInviteModal.tsx` | Load invite defaults / workspace context (abortable API). |
| `components/invites/InviteList.tsx` | Load invites (API) + refresh on workspace nonce (external I/O). |
| `components/OfflinePersistenceNotice.tsx` | Subscribe to Dexie/`liveQuery` or online event for offline banner (external store/events). |
| `components/ProfileSettingsModal.tsx` | Revoke blob preview URLs when preview changes (browser blob lifecycle). |
| `components/workspace/WorkspaceSettingsModal.tsx` | Load workspace permissions on open (abortable API). |
| `contexts/AppBrandingContext.tsx` | Fetch branding CSS vars/fonts; apply to `document`; listen for admin branding socket/API updates. |
| `contexts/ThemeContext.tsx` | Apply `data-theme` to `document`; `matchMedia` listener for `auto` theme. |
| `hooks/activities/useMemberAuditLog.ts` | Member audit log API paging; socket activity events; board settings patch bridge. |
| `hooks/board/useBoardMemberManagement.ts` | Board members API; socket board updated; assignable roles API. |
| `hooks/board/useBoardThemeBackgroundTab.tsx` | Load board theme settings (abortable API) on `boardId` change. |
| `hooks/card/useAttachmentSection.tsx` | Attachment list API; resumable upload / TUS external progress hooks. |
| `hooks/homeBoard/useBoardRealtimeSync.ts` | Register socket handlers for board runtime store (Socket.io external). |
| `hooks/members/useMemberDirectorySearch.ts` | **Canonical:** abortable member directory fetch on query/scope (`AbortController` cleanup). |
| `hooks/useAuth.ts` | Session bootstrap / `api.getMe` on mount (external auth API). |
| `hooks/useBoardAssigneeDirectory.ts` | Abortable paginated assignee directory load for Kanban. |
| `hooks/useBoardPermissions.ts` | Permissions API; Dexie workspace id fallback; socket `permissions.updated` + board updated bridge. |
| `hooks/useBoardThemes.ts` | Load theme catalog from API on mount. |
| `hooks/useBrandingWebFonts.ts` | Inject `@font-face` / link tags into `document` (browser font loading). |
| `hooks/useCardDetailLoader.ts` | Dexie `liveQuery` subscription + abortable card GET (external store + API). |
| `hooks/useHomeBoardPermissionsBatch.ts` | Batch permissions API + socket refresh. |
| `hooks/useHomePageCapabilities.ts` | Home capabilities API; socket capability updates. |
| `hooks/useHomeWorkspacePermissionsBatch.ts` | Batch workspace permissions API + socket refresh. |
| `hooks/useSocket.ts` | Connect/disconnect Socket.io client; join/leave board rooms. |
| `hooks/useVideoPosterUrl.ts` | Capture video frame to blob URL via canvas/video element (DOM media API). |
| `hooks/workspace/useWorkspaceMemberManagement.ts` | Workspace members API; socket workspace updated; assignable roles API. |
| `pages/BoardPage/useBoardPageController.ts` | Abortable board page load + release resources on unmount (external API + runtime). |
| `pages/HomePage/useHomePageDataLoader.ts` | Home workspaces/boards API load; socket home refresh handlers. |
| `pages/InviteAcceptPage.tsx` | Accept invite token flow on mount (abortable API). |
| `pages/LoginPage.tsx` | OAuth redirect handling; branding fetch; `matchMedia`/focus; session probe (external browser + API). |
| `pages/ResetPasswordPage.tsx` | Validate reset token on mount (abortable API). |
| `pages/VerifyEmailPage.tsx` | Verify email token on mount (abortable API). |

## Gate

- **X-018:** Inventory classified; forbidden patterns above eliminated; no new derive-only effects without allowlist entry.
- Re-run inventory after any new `useEffect` in `src/client`.
