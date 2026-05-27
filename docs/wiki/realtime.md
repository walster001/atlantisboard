---
layout: wiki
title: "Real-Time Collaboration"
description: "How real-time works — MongoDB Change Streams, Socket.io, live updates, user presence, offline notices, and reconnection handling."
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
- **Comments** — new comments and deletions appear on other users' screens as soon as they are saved (there is no live “typing” preview while someone composes a comment).
- **Labels** — creation, name and colour changes, removal from cards.
- **Members** — additions, role changes, and removals.
- **Board settings** — theme changes, background updates, card/list setting toggles.
- **Workspace changes** — renames, description updates, membership changes.
- **Invite links** — creation and deletion of invite URLs.

---

## User Presence

The real-time system tracks which users are currently viewing a board:

- **`user:joined`** — emitted when a user opens a board, signalling their presence to other viewers.
- **`user:left`** — emitted when a user navigates away from the board or disconnects.

The server emits join/leave events for each board room. The current UI does not display a “who is viewing” list; presence is infrastructure for future features.

---

## Delta Mode

To minimise bandwidth usage, the real-time system operates in **delta mode** — only the changed fields of a document are transmitted, rather than the entire document. For example, if a card's title is updated, only the new title value is sent to connected clients, not the full card object with its description, checklists, comments, and attachments.

---

## Offline and Connection Feedback

When you are online and connected, **no connection badge or “live” indicator is shown** in the board navbar — real-time sync runs silently in the background.

If the browser or server is unreachable, Atlantisboard shows a persistent **“Offline mode”** notification (yellow banner) with the message that you are offline and changes will not be saved. That notice clears automatically when connectivity returns. See [Offline & PWA](offline-pwa.md) for queued changes and cached boards.

There is no separate Socket.io “connected” indicator in the navbar today; loss of real-time updates is surfaced through this offline notice and through stale data until you refresh or reconnect.

---

## Reconnection Handling

If the WebSocket connection drops (due to network issues, server restart, etc.), the client automatically attempts to reconnect:

- **Up to 5 reconnection attempts** are made.
- **Backoff interval** ranges from 1 to 5 seconds between attempts, preventing connection storms.
- On successful reconnection, the client re-subscribes to the relevant board rooms and receives any missed updates.
- If all reconnection attempts fail, you may not receive live updates until you refresh the page or connectivity returns. The offline notice appears when the browser or server is unreachable.

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
