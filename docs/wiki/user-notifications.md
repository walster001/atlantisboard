---
layout: wiki
title: "Notification Preferences"
description: "Configure notification categories and delivery channels: in-app, push, and SMS."
parent: "User Account & Profile"
nav_order: 28
permalink: /wiki/user-notifications/
---

# Notification Preferences

The **Notification Preferences** panel lets you control which events trigger notifications and how they are delivered. Each notification category can be independently toggled across multiple delivery channels.

![Notification preferences](images/user-notifications.png)

---

## Notification Categories

Atlantisboard groups notifications into five categories based on the type of event:

| Category | Events Included |
|----------|----------------|
| **Reminders** | Card reminder triggers — notifications fired when a card's reminder time is reached (tied to the card's due date). |
| **Assignments** | Card assignment changes — you are notified when you are assigned to or unassigned from a card. |
| **Comments** | New comments on cards you are involved with (assigned to, created, or previously commented on). |
| **Mentions** | When another user @mentions you in a card description or comment. |
| **Invites** | Board invitation notifications — you are notified when you receive an invite link to join a board. |

---

## Delivery Channels

For each category, you can independently enable or disable three delivery channels:

| Channel | Description |
|---------|-------------|
| **In-App** | Notifications appear within the Atlantisboard interface as toast messages and in the notification centre. These are always available and require no additional setup. |
| **Push** | Browser push notifications delivered via the Web Push API (VAPID). These appear as native operating system notifications even when Atlantisboard is not in the foreground. Requires browser permission (see [Push Notification Setup](#push-notification-setup) below). |
| **SMS** | Text message notifications sent to your registered phone number. Availability depends on whether the administrator has configured an SMS provider. |

### Per-Category Toggles

The preferences panel displays a grid with one row per category and one column per channel. Toggle each cell on or off to control exactly which notifications you receive and how:

|  | In-App | Push | SMS |
|--|--------|------|-----|
| **Reminders** | ✓ | ✓ | ✓ |
| **Assignments** | ✓ | ✓ | ✓ |
| **Comments** | ✓ | ✓ | ✓ |
| **Mentions** | ✓ | ✓ | ✓ |
| **Invites** | ✓ | ✓ | ✓ |

*All toggles default to enabled. Adjust to match your preferences.*

---

## Push Notification Setup

To receive push notifications, you must grant browser permission:

1. Ensure the administrator has configured the `VAPID_SUBJECT` environment variable (see [Environment Variables Reference](environment-variables.md)).
2. Enable the **Push** toggle for at least one notification category.
3. Your browser will prompt you to **allow notifications** from Atlantisboard. Accept the prompt.
4. Push notifications will now appear as native OS notifications.

> **Note:** Push notifications use the [Web Push / VAPID standard](https://web.dev/push-notifications-overview/). They work in Chrome, Firefox, Edge, and Safari (macOS Ventura+ and iOS 16.4+). They do not require the Atlantisboard tab to be open.

### Revoking Push Permissions

If you change your mind, you can revoke notification permissions from your browser's site settings. After revoking, disable the Push toggles in your notification preferences to avoid delivery errors.

---

## In-App Notifications

In-app notifications use **Mantine toast notifications** — small, non-intrusive messages that appear briefly in the corner of the screen for real-time events. These include:

- **Import progress** updates (when importing boards).
- **Card changes** affecting you (assignments, comments, mentions).
- **Error notifications** (failed operations, connection issues).
- **Success confirmations** (saved settings, completed actions).

Toast notifications automatically dismiss after a few seconds. They do not require any setup or browser permissions.

---

## Tips

- **Start with In-App only** — If you are unsure about notification volume, begin with only In-App notifications enabled and add Push or SMS later as needed.
- **Use Push for time-sensitive events** — Enable Push for Reminders and Mentions to catch urgent items even when you are not actively using the app.
- **Disable noisy categories** — If you are on a high-activity board with many comments, consider disabling Push notifications for the Comments category and relying on In-App instead.

---

## Related Pages

- [Profile Settings](user-profile.md) — update your display name and avatar.
- [Password & Security](user-security.md) — change your password and theme preference.
- [Environment Variables Reference](environment-variables.md) — `VAPID_SUBJECT` configuration for push notifications.
- [Card Detail](card-detail.md) — how reminders, assignments, and comments work on cards.
