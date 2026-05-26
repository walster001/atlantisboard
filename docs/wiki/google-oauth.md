---
layout: wiki
title: "Google OAuth Sign-In"
description: "How Google sign-in works, account merging, database verification mode, error scenarios, and LAN setup."
parent: "Accounts & Authentication"
nav_order: 25
permalink: /wiki/google-oauth/
---

# Google OAuth Sign-In

Atlantisboard supports **Sign in with Google** as an authentication method, allowing users to log in with their Google account instead of (or in addition to) a local email and password. This page explains how Google sign-in works, how accounts are merged, and how to handle common scenarios.

> **Prerequisite:** Google OAuth must be enabled and configured by an administrator in [Login Options](admin-login-options.md). This requires a Google Cloud Console project with OAuth 2.0 credentials.

---

## How Google Sign-In Works

![Google sign-in button](images/auth-google.png)

1. On the login page, click the **Sign in with Google** button.
2. A Google authentication window opens where you select your Google account and grant consent.
3. Google redirects you back to Atlantisboard with an authentication token.
4. Atlantisboard verifies the token with Google and retrieves your profile information (name, email, and profile picture).
5. You are signed in and redirected to the home page.

If this is your first sign-in and no local account exists with your Google email, a new account is created automatically (subject to the configured [registration mode](accounts-auth.md#registration-modes)).

---

## Account Merge

If a **local account** already exists with the same email address as your Google account, Atlantisboard automatically **links the Google identity to the existing local account**. This means:

- You can sign in with either your local password or Google OAuth — both methods work for the same account.
- Your existing boards, workspaces, and permissions are preserved.
- Your Google profile picture becomes available as a fallback avatar.

No manual action is required — the merge happens automatically on first Google sign-in when a matching email is found.

---

## Google + Database Verification Mode

When the administrator selects the **Google Login + Database Verification** authentication method, an additional verification step occurs after Google authenticates the user:

1. The user signs in with Google as usual.
2. Atlantisboard takes the user's email from Google and runs it against an **external MySQL database** using a configurable SQL query.
3. If the query returns a result, the user is allowed to proceed. If not, sign-in is rejected.

This mode is useful for organisations that maintain an external employee or member database and want to restrict access to users who appear in that database — even though authentication itself is handled by Google.

### How the SQL Query Works

The administrator configures a parameterised `SELECT` query with a `?` placeholder for the user's email. For example:

```sql
SELECT 1 FROM employees WHERE email = ? AND active = 1
```

If this query returns at least one row, verification passes. The query is executed against the external MySQL database configured in the [Login Options](admin-login-options.md) panel.

---

## Error Scenarios

| Scenario | What Happens |
|----------|--------------|
| **Email conflict** | If a Google account's email matches an existing local account that is already linked to a *different* Google identity, sign-in fails with a conflict error. Contact an administrator to resolve the conflict. |
| **Unverified account** | If mandatory email verification is enabled and the matching local account has not been verified, the Google sign-in may be blocked. Verify your email first, or ask an administrator to manually verify your account. |
| **Missing email from Google** | In rare cases, a Google account may not have an email address available (e.g. certain enterprise configurations). Sign-in is rejected because Atlantisboard requires an email for account identification. |
| **Registration disabled** | If the registration mode is set to "Disabled" and no existing account matches the Google email, sign-in is rejected. The user must be pre-registered or the admin must switch to a different registration mode. |
| **Invite-only registration** | If the registration mode is "Invite-only", Google sign-in for new users is only allowed when the user arrives via a valid invite link. Existing users with a matching email can still sign in normally. |
| **Database verification failed** | In Google + Database Verification mode, if the external MySQL query returns no results for the user's email, sign-in is rejected with a verification error. |

---

## LAN / Private IP Setup

Google OAuth requires redirect URIs that Google's servers can validate. When running Atlantisboard on a **local network (LAN)** or a **private IP address** that is not publicly reachable, standard OAuth redirect flows may not work.

Atlantisboard supports a device-based OAuth flow for these environments. Configure the following environment variables:

| Variable | Description |
|----------|-------------|
| `GOOGLE_OAUTH_DEVICE_ID` | A unique device identifier for your Atlantisboard instance. |
| `GOOGLE_OAUTH_DEVICE_NAME` | A human-readable name for the device (e.g. "Office Server"). |
| `GOOGLE_OAUTH_BROWSER_ORIGIN` | The origin URL used for the redirect URI (e.g. `http://192.168.1.100:3000`). |

These parameters are passed to Google during the OAuth flow to enable authentication on private networks. See [Environment Variables Reference](environment-variables.md) for the full list of Google OAuth variables.

---

## Administrator Setup

To enable Google OAuth for your Atlantisboard instance:

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google+ API** or **Google Identity** service.
3. Create **OAuth 2.0 Client ID** credentials (type: Web application).
4. Add the authorised redirect URI: `https://your-domain.com/api/v1/auth/google/callback`.
5. Copy the **Client ID** and **Client Secret** into the [Login Options](admin-login-options.md) panel in Atlantisboard.
6. Select an authentication method that includes Google (e.g. "Local Accounts + Google" or "Google Login Only").
7. Save the configuration.

For detailed field descriptions and the "Replace credentials" workflow, see [Login Options](admin-login-options.md).

---

## Related Pages

- [Login Options](admin-login-options.md) — configure Google OAuth credentials and authentication methods.
- [Registration & Sign-In](accounts-auth.md) — registration modes and local account sign-in.
- [Environment Variables Reference](environment-variables.md) — Google OAuth and LAN-related environment variables.
- [Password Reset & Email Verification](password-reset.md) — email verification for merged accounts.
