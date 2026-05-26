---
layout: wiki
title: "Real-Time Collaboration"
description: "How real-time works — MongoDB Change Streams, Socket.io, live updates, typing indicators, user presence, and reconnection handling."
parent: "Boards"
nav_order: 38
permalink: /wiki/realtime/
---

# Real-Time Collaboration

Atlantisboard is designed for teams working together simultaneously. Changes made by one user are instantly reflected on every other connected user's screen — no page refreshes required.

---

## How Real-Time Works

The real-time system uses two core technologies working together:

1. **MongoDB Change Streams** — the server opens persistent watchers on key database collections. Whenever a document is inserted, updated, or deleted, MongoDB emits a change event.
2. **Socket.io** — the server receives change events from MongoDB and broadcasts them to connected clients over WebSocket connections. Each client receives only the events relevant to the boards they are currently viewing.

This architecture ensures that the database is always the single source of truth — changes flow from the database outward to all clients, regardless of which user or process made the change.

---

## Change Streams

Atlantisboard runs **7 change streams**, each watching a different collection:

| Collection | What It Watches |
|------------|-----------------|
| **Workspaces** | Workspace creation, renames, description changes, membership updates. |
| **Boards** | Board settings, theme changes, background updates, metadata edits. |
| **Lists** | List creation, renaming, reordering, colour changes, deletion. |
| **Cards** | Card creation, edits (title, description, dates, colour), moves, deletion. |
| **Activities** | Activity feed entries logged for card and board events. |
| **Labels** | Label creation, edits (name, colour), deletion. |
| **Invite Links** | Invite link creation and deletion. |

---

## What Updates in Real Time

Nearly every collaborative action in Atlantisboard is reflected live:

- **Cards** — creation, title and description edits, moves between lists, reordering, colour changes, date updates, assignee changes, deletion.
- **Lists** — creation, renaming, reordering, colour changes, deletion.
- **Checklists** — item additions, completions, reordering, and deletions.
- **Comments** — new comments, edits, and deletions.
- **Labels** — creation, name and colour changes, removal from cards.
- **Members** — additions, role changes, and removals.
- **Board settings** — theme changes, background updates, card/list setting toggles.
- **Workspace changes** — renames, description updates, membership changes.
- **Invite links** — creation and deletion of invite URLs.

---

## Typing Indicators

When another user is actively typing a comment on a card, a typing indicator appears in the comments section of that card. This helps prevent duplicate responses and lets you know a team member is engaged.

---

## User Presence

The real-time system tracks which users are currently viewing a board:

- **`user:joined`** — emitted when a user opens a board, signalling their presence to other viewers.
- **`user:left`** — emitted when a user navigates away from the board or disconnects.

This presence information can be used to show which team members are currently looking at the same board.

---

## Delta Mode

To minimise bandwidth usage, the real-time system operates in **delta mode** — only the changed fields of a document are transmitted, rather than the entire document. For example, if a card's title is updated, only the new title value is sent to connected clients, not the full card object with its description, checklists, comments, and attachments.

---

## Connection Status Indicator

The board navbar displays a visual indicator reflecting the Socket.io connection state:

- **Connected** — the indicator is hidden or shows a subtle "live" state. Everything is syncing normally.
- **Disconnected** — a warning indicator appears, letting you know that real-time updates are temporarily unavailable. You can continue working, but changes from other users will not appear until the connection is restored.

---

## Reconnection Handling

If the WebSocket connection drops (due to network issues, server restart, etc.), the client automatically attempts to reconnect:

- **Up to 5 reconnection attempts** are made.
- **Backoff interval** ranges from 1 to 5 seconds between attempts, preventing connection storms.
- On successful reconnection, the client re-subscribes to the relevant board rooms and receives any missed updates.
- If all reconnection attempts fail, the connection status indicator remains in the disconnected state. Refreshing the page initiates a fresh connection.

---

## Requirements

For real-time collaboration to function:

- **MongoDB must be configured as a replica set** — Change Streams require a replica set (or sharded cluster). A standalone MongoDB instance does not support Change Streams. See [Docker Compose Installation](docker-compose-install.md) or [Manual Installation](manual-install.md) for setup instructions.
- **Change Streams must be enabled** — the `ENABLE_CHANGE_STREAMS` environment variable must be set to `true` (this is the default). Set `DISABLE_CHANGE_STREAMS` to force them off if needed for debugging.

---

## Related Pages

- [Board Overview](board-overview.md) — the board interface where real-time updates are most visible.
- [Card Detail](card-detail.md) — comments, checklists, and other card data synced in real time.
- [Environment Variables Reference](environment-variables.md) — configuring change streams and connection settings.
- [Offline & PWA](offline-pwa.md) — what happens when the connection is lost.
