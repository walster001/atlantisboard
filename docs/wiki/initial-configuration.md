---
layout: wiki
title: "Initial Configuration Walkthrough"
description: "Recommended order for configuring a new Atlantisboard installation."
parent: "First-Time Setup"
nav_order: 10
permalink: /wiki/initial-configuration/
---

# Initial Configuration Walkthrough

After creating your [first admin account](first-admin-account.md), follow this recommended order to configure your Atlantisboard installation. Each step builds on the previous one, so working through them in sequence ensures everything is set up correctly.

---

## Step 1: Login Options

**Admin → Login Options**

Start here to decide how users will authenticate and register.

- **Choose your authentication method**:
  - *Local Accounts* — email and password only (simplest setup).
  - *Local Accounts + Google* — both local passwords and Google sign-in.
  - *Google Login Only* — no local passwords; users sign in exclusively with Google.
  - *Google Login + Database Verification* — Google sign-in verified against an external MySQL database.

- **Set the registration mode**:
  - *Open* — anyone can create an account.
  - *Invite-only* — users need an invite link from an existing member.
  - *Disabled* — no new registrations; only existing accounts can log in.

- **Configure mandatory email verification** — require users to verify their email before accessing the application. This is automatically forced on when Google OAuth is configured alongside local accounts.

- **Set up Google OAuth** (if applicable) — enter your Client ID and Client Secret from the Google Cloud Console.

See [Login Options](admin-login-options.md) for detailed instructions.

---

## Step 2: Email (SMTP)

**Admin → Email**

Configure SMTP so that Atlantisboard can send essential emails:

- **Password reset** links
- **Email verification** messages
- **Board invitation** emails

Choose a preconfigured provider (Gmail, SendGrid, Mailgun, Postmark, SES, Brevo) or enter custom SMTP settings. After saving, use the **Send Test Email** feature to verify your configuration works.

> **Warning:** Without SMTP configured, users will not be able to reset forgotten passwords or receive email invitations. Set this up early.

---

## Step 3: Permissions & Roles

**Admin → Permissions & Roles**

Review the built-in roles and create custom roles if your team needs them.

- **Admin** — full workspace and board administration.
- **Manager** — day-to-day board operations with constrained hierarchy.
- **Viewer** — read-only collaboration role.

Adjust the 15 permission categories to match your organisation's needs. Consider the hierarchy mode for role assignment — this controls which roles a user with a given hierarchy level can assign to others.

See [Permissions & Roles](admin-permissions.md) for the full reference.

---

## Step 4: Backup

**Admin → Backup & Restore**

Set up backups before your team starts creating boards and adding data.

1. **Set `BACKUP_LOCATION`** in your `.env` file to an absolute path on the server (e.g. `/var/backups/atlantisboard`). The directory must exist and be writable.
2. **Configure retention** — choose how many days to keep old backups (1–3,650 days).
3. **Test a manual backup** — click "Create Backup" and verify it completes successfully.
4. **Set up scheduled backups** (optional) — configure automatic backups at your preferred frequency.

> **Tip:** If using Docker, mount the backup location as a host volume so backup archives are accessible outside the container.

---

## Step 5: Customisation

**Admin → Customisation**

Brand your Atlantisboard instance to match your organisation's identity:

- **Login Branding** — customise the login page background, logo, app name, tagline, and sign-in button colours. A live preview shows your changes in real time.
- **App Branding** — customise the homepage and board navbar icons, labels, colours, and background.
- **Email Branding** — style the transactional emails (password reset, verification) with your brand colours and footer text.
- **Custom Fonts** — upload `.woff2`, `.woff`, `.ttf`, or `.otf` font files to use throughout the application.

---

## You're Ready

Once you have completed these five steps, your Atlantisboard installation is ready for your team. The next things to do:

- **Create your first workspace** on the home page.
- **Create your first board** within the workspace.
- **Invite team members** using invite links (Admin → Login Options must allow registration or invite-only mode).

---

## Quick Reference Links

| Configuration Area | Where to Find It | Wiki Page |
|--------------------|--------------------|-----------|
| Login Options | Admin → Login Options | [Login Options](admin-login-options.md) |
| Permissions & Roles | Admin → Permissions & Roles | [Permissions & Roles](admin-permissions.md) |
| General Settings | Admin → General Settings | [General Settings](admin-general.md) |
| Environment Variables | `.env` file | [Environment Variables Reference](environment-variables.md) |
