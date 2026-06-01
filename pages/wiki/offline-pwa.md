---
layout: wiki
title: "Offline & PWA"
description: "Install Atlantisboard as a Progressive Web App and work offline with cached boards and queued changes."
nav_order: 52
permalink: /wiki/offline-pwa/
---

# Offline & PWA

Atlantisboard can be installed as a Progressive Web App (PWA), giving you an app-like experience on desktop and mobile — including limited offline functionality powered by local caching.

![PWA install prompt](/assets/wiki/pwa-install.png)

---

## Installing as a PWA

### Desktop (Chrome, Edge, Brave, and other Chromium-based browsers)

1. Navigate to your Atlantisboard instance in the browser.
2. Look for the **install icon** in the browser's address bar (typically a monitor with a down-arrow, or a "+" icon).
3. Click it and confirm the installation.
4. Atlantisboard opens in its own window without browser chrome — a dedicated app experience.

### Mobile (iOS Safari, Android Chrome)

1. Open your Atlantisboard instance in the mobile browser.
2. **iOS:** Tap the Share button → **Add to Home Screen**.
3. **Android:** Tap the browser menu → **Add to Home Screen** (or respond to the automatic install banner).
4. The app icon appears on your home screen and launches in full-screen mode.

### PWA Detection

When running as an installed PWA, Atlantisboard adjusts the UI layout:

- Fullscreen modal handling respects the absence of browser chrome.
- Header spacing adapts to account for OS-level title bars or notches.
- Navigation relies on in-app back buttons rather than the browser back button.

---

## What Works Offline

When your network connection drops, Atlantisboard continues to function in a limited capacity thanks to local caching:

### Viewing Cached Data

Atlantisboard uses **Dexie.js** (built on IndexedDB) to cache board data locally. Previously viewed boards, lists, and cards remain accessible even without a connection:

- Browse boards you've opened before.
- Read card details, descriptions, and comments.
- View checklists and labels.
- See cached member lists and assignees.

### Queued Changes

Actions you take while offline are queued locally:

- Edits, card movements, and other modifications are stored in a local queue.
- When connectivity is restored, queued changes are automatically synced to the server.
- Conflicts (if another user modified the same data) are resolved server-side on sync.

---

## What Requires a Connection

Some features cannot function offline and require an active network connection:

| Feature | Reason |
|---------|--------|
| **Real-time updates** | Socket.io requires an active WebSocket connection. |
| **File uploads** | Attachments must be transmitted to MinIO storage. |
| **Authentication** | Login, logout, and session refresh require server communication. |
| **Initial data load** | The first time you open a board, data must be fetched from the server. |
| **Import/Export** | Board imports and exports are processed server-side. |
| **Admin operations** | All administrative actions require server-side processing. |
| **Push notifications** | Receiving notifications requires an active connection. |

---

## Offline Persistence Notice

When Atlantisboard detects a loss of connectivity:

- A persistent **“Offline mode”** notification appears (yellow banner: *You are offline, changes will not be saved.*).
- While you are online, **no offline badge** is shown in the board navbar — connection is assumed normal.
- The notification clears automatically when the browser and server are reachable again.

![Offline indicator](/assets/wiki/offline-indicator.png)

---

## Service Worker Behaviour

Atlantisboard uses a service worker to enable offline capabilities:

- **Asset caching** — Static assets (JavaScript bundles, CSS, images) are cached on first load, enabling the app shell to render without a network request.
- **API response caching** — Previously fetched board data is cached in IndexedDB via Dexie.js for offline access.
- **Background sync** — Queued changes are synced when the service worker detects a restored connection.
- **Cache updates** — When you open the app online, the service worker checks for updated assets and refreshes the cache silently.

---

## Limitations

- **Stale data** — Offline views show the last-cached version. Changes made by other users while you're offline won't appear until you reconnect.
- **Queue capacity** — Extremely long offline sessions with many changes may approach local storage limits on some devices.
- **Media** — Attachment previews and images may not be available offline unless previously viewed and cached by the browser.
- **First visit** — You must visit the app at least once online before offline mode is available (the service worker and initial data cache must be established).

---

## Tips

- Visit boards you'll need frequently so they're cached for offline access.
- The PWA install provides the best offline experience — browsers may clear service worker caches more aggressively for non-installed sites.
- If you see the offline notification, wait until it clears before relying on live collaboration — online mode ensures your work is immediately saved and shared with collaborators.

---

## Related Pages

- [Board Overview](/wiki/board-overview/) — Understanding the board interface and offline notice behaviour.
- [Real-Time Collaboration](/wiki/realtime/) — How live sync works when you're online.
