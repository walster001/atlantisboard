---
layout: wiki
title: "Atlantisboard Wiki"
description: "Official documentation for deploying, configuring, and using Atlantisboard."
nav_order: 1
permalink: /wiki/
---

# Atlantisboard Wiki

Welcome to the official Atlantisboard documentation. Whether you are deploying Atlantisboard for the first time, configuring it for your team, or learning how to get the most out of your boards, you will find everything you need here.

Atlantisboard is a self-hosted, real-time collaborative Kanban board designed for teams that want full control over their project management data. This wiki covers installation, administration, day-to-day usage, and advanced customisation.

> **Tip:** Every page in this wiki is indexed and searchable from the sidebar. Use the search bar to quickly find what you need.

---

## Table of Contents

### Getting Started

- [What is Atlantisboard?](getting-started.md) — Product overview, core vocabulary, and technology stack.
- [System Requirements](system-requirements.md) — Hardware, software, network, and browser requirements.

### Deployment & Installation

- [Docker Compose Installation (Recommended)](docker-compose-install.md) — Step-by-step Docker Compose setup with container explanations.
- [Environment Variables Reference](environment-variables.md) — Complete reference for every `.env` configuration variable.
- [Reverse Proxy Setup (Nginx / Caddy)](reverse-proxy.md) — Production-ready Nginx and Caddy configurations with WebSocket support.
- [Manual (Non-Docker) Installation](manual-install.md) — Installing without Docker, including a systemd service example.
- [Updating & Maintenance](updating.md) — How to update Atlantisboard and roll back if needed.

### First-Time Setup

- [Creating the First Admin Account](first-admin-account.md) — First user registration and automatic admin promotion.
- [Initial Configuration Walkthrough](initial-configuration.md) — Recommended order for configuring a new installation.

### Admin Configuration

- [General Settings](admin-general.md) — Global application preferences.
- [Login Options](admin-login-options.md) — Authentication methods, registration modes, Google OAuth, and database verification.
- [Permissions & Roles](admin-permissions.md) — Role-based access control, built-in roles, custom roles, and the 15 permission categories.
- [User Management](admin-users.md) — User table, capabilities, bulk actions, and account management.
- [Email (SMTP) Configuration](admin-email.md) — Provider presets, SMTP settings, and test emails.
- [Database Maintenance](admin-database.md) — Statistics, collection sizes, and cleanup tools.
- [Backup & Restore](admin-backup.md) — Scheduled backups, restore points, and retention policies.
- [System Monitor](admin-monitor.md) — CPU, memory, disk, and runtime metrics dashboard.

### Admin Customisation

- [Login Branding](admin-login-branding.md) — Logo, colours, backgrounds, and login page preview.
- [App Branding](admin-app-branding.md) — Navbar icon, colours, homepage background, and default font.
- [Email Branding](admin-email-branding.md) — Email template colours, footer, and preview.
- [Custom Fonts](admin-custom-fonts.md) — Upload fonts, manage the font catalog, and set the default UI font.

### Accounts & Authentication

- [Registration & Sign-In](accounts-auth.md) — Registration flow, password requirements, and email verification.
- [Password Reset & Email Verification](password-reset.md) — Forgot password, reset tokens, and verification emails.
- [Google OAuth Sign-In](google-oauth.md) — OAuth setup, account merge, and error handling.

### User Account & Profile

- [Profile Settings](user-profile.md) — Display name, avatar, and language selector.
- [Password & Security](user-security.md) — Change password, account lockout, and appearance preferences.
- [Notification Preferences](user-notifications.md) — Per-category notification toggles and delivery methods.

### Home Screen & Workspaces

- [The Home Page](home-page.md) — Board tiles, quick actions, starred boards, and layout overview.
- [Workspaces](workspaces.md) — Workspace management, colours, drag reorder, and context menu.
- [Creating & Managing Boards](create-board.md) — Board creation, context menu actions, and board card management.

### Boards

- [Board Overview](board-overview.md) — Anatomy of a board, navbar, member avatars, and responsive layout.
- [Lists & Columns](lists.md) — Creating, renaming, deleting, and configuring list columns.
- [Cards](cards.md) — Card preview anatomy, creating/editing/archiving cards.
- [Card Detail](card-detail.md) — Full card modal with description, labels, dates, checklists, comments, attachments, and reminders.
- [Drag & Drop](drag-and-drop.md) — Custom pointer event system, cross-list dragging, mobile gestures, and scroll zones.
- [Filtering & Search](filtering-search.md) — Board filter bar with text, label, member, and date filters.
- [Real-Time Collaboration](realtime.md) — MongoDB Change Streams, Socket.io, and live updates.

### Board Settings

- [Card Settings](board-settings-card.md) — Card display toggles, card size, and default card colour.
- [List Settings](board-settings-list.md) — Card count, descriptions, collapse, lock, and default positions.
- [Labels](board-settings-labels.md) — Label management and the 18 built-in label colours.
- [Users & Permissions](board-settings-users.md) — Board member roles and per-member management.
- [Invites & Sharing](board-settings-invites.md) — Invite links, email invites, and pending invites.
- [Theme & Colouring](board-settings-theme.md) — Theme catalog, system vs custom themes, and Intelligent Contrast.
- [Background](board-settings-background.md) — Background modes, image upload, scale modes, and opacity slider.
- [Audit Log](board-settings-audit.md) — Member activity events, pagination, and retention.

### Themes

- [Default Themes](themes.md) — The 8 built-in themes and the 20-slot colour palette system.
- [Custom Theme Editor](theme-editor.md) — Creating custom themes with the visual editor and live preview.
- [Sharing & Managing Themes](theme-sharing.md) — Theme permissions, duplicating, and applying themes.

### Import & Export

- [Importing Boards](import.md) — Supported formats (Atlantisboard, Trello®, WeKan®, CSV), import flow, and user management.
- [Exporting Boards](export.md) — CSV, Trello®, WeKan®, and Atlantisboard export formats with column configuration.

### More

- [Offline & PWA](offline-pwa.md) — Progressive Web App installation, offline caching, and sync.
- [Keyboard Shortcuts & Tips](keyboard-shortcuts.md) — Keyboard interactions, mobile gestures, and accessibility notes.

---

*This wiki is a living document. If you spot an error or have a suggestion, open an issue on the project repository.*
