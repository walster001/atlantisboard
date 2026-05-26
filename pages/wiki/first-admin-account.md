---
layout: wiki
title: "Creating the First Admin Account"
description: "How to register the first user and gain automatic App Admin privileges."
parent: "First-Time Setup"
nav_order: 9
permalink: /wiki/first-admin-account/
---

# Creating the First Admin Account

When you launch Atlantisboard for the first time, there are no users in the system. The first person to register automatically becomes the **App Admin** — the global administrator with full control over the application.

![First registration screen](/assets/wiki/first-admin-register.png)

---

## How It Works

Atlantisboard includes a built-in first-user bypass that guarantees you can always create an initial administrator:

1. **Registration is always open** when there are zero users in the database, regardless of the configured registration mode (even if it is set to "Disabled" or "Invite Only").
2. **The first registered user is automatically promoted to App Admin** and flagged as the founding administrator.
3. Once the first user exists, the configured registration mode takes effect for all subsequent registrations.

> **Tip:** If registration was accidentally set to "Disabled" before any users were created, don't worry — the first-user bypass still works. Simply navigate to the registration page and create your account.

---

## Step-by-Step

### 1. Open the Registration Page

Navigate to your Atlantisboard instance in your browser (e.g. `https://boards.example.com`) and click the **Sign Up** or **Register** link on the login page.

### 2. Fill in Your Details

Complete the registration form:

| Field | Requirements |
|-------|-------------|
| **Display Name** | Your name as it will appear throughout the application |
| **Username** | A unique username for your account |
| **Email** | A valid email address (used for login and notifications) |
| **Password** | Minimum 12 characters |
| **Confirm Password** | Must match the password field |

### 3. Meet the Password Requirements

Atlantisboard enforces strong passwords. The password strength meter has 5 segments, one for each requirement:

- Minimum **12 characters** in length
- At least one **uppercase** letter
- At least one **lowercase** letter
- At least one **number**
- At least one **special character**

All 5 segments must be filled for the password to be accepted.

### 4. Complete Registration

Click **Register**. Your account is created and automatically promoted to App Admin.

If mandatory email verification is enabled, you will see a "check your email" screen. Click the verification link in your inbox to activate your account before signing in. The verification token expires after 10 minutes — use the **Resend** link if needed.

### 5. Verify Your Admin Status

After signing in, confirm that you have admin privileges:

- Your user menu (top-right corner) shows an **admin badge**.
- You can access the **Admin Configuration** page from the navigation (visible only to App Admins).

---

## What If I Need Another Admin?

Once logged in as the founding admin, you can promote additional users to App Admin from the **Admin → Permissions & Roles** panel. Search for a user and toggle their App Admin status. See [Permissions & Roles](/wiki/admin-permissions/) for details.

---

## Next Steps

- [Initial Configuration Walkthrough](/wiki/initial-configuration/) — recommended order for setting up your new installation.
- [Login Options](/wiki/admin-login-options/) — configure authentication methods and registration modes.
