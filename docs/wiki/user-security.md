---
layout: wiki
title: "Password & Security"
description: "Change your password, understand account lockout, and set your theme preference."
parent: "User Account & Profile"
nav_order: 27
permalink: /wiki/user-security/
---

# Password & Security

The **Password & Security** settings let you update your password, understand the account lockout policy, and choose your preferred visual theme.

---

## Change Password

To update your password, open the security settings from your user menu and fill in the change password form.

![Change password form](images/user-change-password.png)

| Field | Required | Description |
|-------|----------|-------------|
| **Current Password** | Yes | Your existing password, required to confirm your identity. |
| **New Password** | Yes | Your new password. Must meet the strength requirements below. |
| **Confirm New Password** | Yes | Must match the new password exactly. |

### Password Strength Requirements

The same 5-segment strength meter used during registration appears when setting a new password:

| Segment | Requirement |
|---------|-------------|
| 1 | Minimum length — **12 characters** |
| 2 | At least one **uppercase** letter (A–Z) |
| 3 | At least one **lowercase** letter (a–z) |
| 4 | At least one **number** (0–9) |
| 5 | At least one **special character** (!@#$%^&* etc.) |

All five segments must be satisfied for the new password to be accepted. The meter updates in real-time as you type.

After successfully changing your password, you remain signed in. Your new password takes effect immediately for all future sign-in attempts.

---

## Account Lockout

Atlantisboard protects accounts against brute-force attacks with an automatic lockout mechanism.

### How It Works

- After **3 consecutive failed login attempts**, the account is **automatically locked**.
- A locked account cannot sign in — the user sees an "account locked" error message on the login page.
- The lockout applies to the specific user account, not to an IP address.

### Unlocking an Account

- Only an **App Admin** can unlock a locked account. This is done from the [User Management](admin-users.md) panel using the **Unlock** action.
- When an administrator unlocks the account, the failed attempt counter is reset to zero.
- The user can then sign in with their correct password (or reset it via [Password Reset](password-reset.md) if forgotten).

> **If you are locked out:** Contact your system administrator and ask them to unlock your account from the Admin panel.

---

## Theme Preference

Atlantisboard supports three visual themes. Your theme preference is saved per-account and persists across devices and sessions.

| Option | Description |
|--------|-------------|
| **Light** | A bright, high-contrast theme with light backgrounds and dark text. |
| **Dark** | A dark theme with reduced brightness, designed for low-light environments and reduced eye strain. |
| **Auto** | Automatically follows your operating system's theme preference. If your OS switches between light and dark mode (e.g. based on time of day), Atlantisboard follows suit. |

The theme setting affects the overall application chrome (navigation bars, sidebars, modals, dropdowns). Board-specific theming (colours, backgrounds) is controlled separately via [Board Settings](board-settings-theme.md).

---

## Related Pages

- [Profile Settings](user-profile.md) — update your display name, avatar, and language.
- [Registration & Sign-In](accounts-auth.md) — password requirements during registration.
- [Password Reset & Email Verification](password-reset.md) — recover access with a forgotten password.
- [User Management](admin-users.md) — administrators can unlock locked accounts.
- [Notification Preferences](user-notifications.md) — configure notification delivery channels.
