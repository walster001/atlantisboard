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

- [What is Atlantisboard?](/wiki/getting-started/) — Product overview, core vocabulary, and technology stack.
- [System Requirements](/wiki/system-requirements/) — Hardware, software, network, and browser requirements.

### Deployment & Installation

- [npm install (`atlantisboard`)](/wiki/npm-install/) — Interactive Whiptail wizard (npm or GitHub release zip).
- [Debian installation (auto setup)](/wiki/debian-install/) — Recommended Debian path with `atlantisboard-setup` and Docker full stack.
- [Docker Compose Installation (Recommended)](/wiki/docker-compose-install/) — Step-by-step Docker Compose setup from a git clone.
- [Environment Variables Reference](/wiki/environment-variables/) — Complete reference for every `.env` configuration variable.
- [Reverse Proxy Setup (Nginx / Caddy)](/wiki/reverse-proxy/) — Production-ready Nginx and Caddy configurations with WebSocket support.
- [Manual (Non-Docker) Installation](/wiki/manual-install/) — Installing without Docker, including a systemd service example.
- [Updating & Maintenance](/wiki/updating/) — How to update Atlantisboard and roll back if needed.

### First-Time Setup

- [Creating the First Admin Account](/wiki/first-admin-account/) — First user registration and automatic admin promotion.
- [Initial Configuration Walkthrough](/wiki/initial-configuration/) — Recommended order for configuring a new installation.

### Admin Configuration

- [General Settings](/wiki/admin-general/) — Global application preferences.
- [Login Options](/wiki/admin-login-options/) — Authentication methods, registration modes, Google OAuth, and database verification.
- [Permissions & Roles](/wiki/admin-permissions/) — Role-based access control, built-in roles, custom roles, and the 15 permission categories.
- [User Management](/wiki/admin-users/) — User table, capabilities, bulk actions, and account management.
- [Email (SMTP) Configuration](/wiki/admin-email/) — Provider presets, SMTP settings, and test emails.
- [Database Maintenance](/wiki/admin-database/) — Statistics, collection sizes, and cleanup tools.
- [Backup & Restore](/wiki/admin-backup/) — Scheduled backups, restore points, and retention policies.
- [System Monitor](/wiki/admin-monitor/) — CPU, memory, disk, and runtime metrics dashboard.

### Admin Customisation

- [Login Branding](/wiki/admin-login-branding/) — Logo, colours, backgrounds, and login page preview.
- [App Branding](/wiki/admin-app-branding/) — Navbar icon, colours, homepage background, and default font.
- [Email Branding](/wiki/admin-email-branding/) — Email template colours, footer, and preview.
- [Custom Fonts](/wiki/admin-custom-fonts/) — Upload fonts, manage the font catalog, and set the default UI font.

### Accounts & Authentication

- [Registration & Sign-In](/wiki/accounts-auth/) — Registration flow, password requirements, and email verification.
- [Password Reset & Email Verification](/wiki/password-reset/) — Forgot password, reset tokens, and verification emails.
- [Google OAuth Sign-In](/wiki/google-oauth/) — OAuth setup, account merge, and error handling.

### User Account & Profile

- [Profile Settings](/wiki/user-profile/) — Display name, avatar, and language selector.
- [Password & Security](/wiki/user-security/) — Change password, account lockout, and appearance preferences.
- [Notification Preferences](/wiki/user-notifications/) — Per-category notification toggles and delivery methods.

### Home Screen & Workspaces

- [The Home Page](/wiki/home-page/) — Board tiles, quick actions, starred boards, and layout overview.
- [Workspaces](/wiki/workspaces/) — Workspace management, colours, drag reorder, and context menu.
- [Creating & Managing Boards](/wiki/create-board/) — Board creation, context menu actions, and board card management.

### Boards

- [Board Overview](/wiki/board-overview/) — Anatomy of a board, navbar, member avatars, and responsive layout.
- [Lists & Columns](/wiki/lists/) — Creating, renaming, deleting, and configuring list columns.
- [Cards](/wiki/cards/) — Card preview anatomy, creating/editing/archiving cards.
- [Card Detail](/wiki/card-detail/) — Full card modal with description, labels, dates, checklists, comments, attachments, and reminders.
- [Drag & Drop](/wiki/drag-and-drop/) — Custom pointer event system, cross-list dragging, mobile gestures, and scroll zones.
- [Filtering & Search](/wiki/filtering-search/) — Board filter bar with text, label, member, and date filters.
- [Real-Time Collaboration](/wiki/realtime/) — MongoDB Change Streams, Socket.io, and live updates.

### Board Settings

- [Card Settings](/wiki/board-settings-card/) — Card display toggles, card size, and default card colour.
- [List Settings](/wiki/board-settings-list/) — Card count, descriptions, collapse, lock, and default positions.
- [Labels](/wiki/board-settings-labels/) — Label management and the 18 built-in label colours.
- [Users & Permissions](/wiki/board-settings-users/) — Board member roles and per-member management.
- [Invites & Sharing](/wiki/board-settings-invites/) — Invite links, email invites, and pending invites.
- [Theme & Colouring](/wiki/board-settings-theme/) — Theme catalog, system vs custom themes, and Intelligent Contrast.
- [Background](/wiki/board-settings-background/) — Background modes, image upload, scale modes, and opacity slider.
- [Audit Log](/wiki/board-settings-audit/) — Member activity events, pagination, and retention.

### Themes

- [Default Themes](/wiki/themes/) — The 8 built-in themes and the 20-slot colour palette system.
- [Custom Theme Editor](/wiki/theme-editor/) — Creating custom themes with the visual editor and live preview.
- [Sharing & Managing Themes](/wiki/theme-sharing/) — Theme permissions, duplicating, and applying themes.

### Import & Export

- [Importing Boards](/wiki/import/) — Supported formats (Atlantisboard, Trello®, WeKan®, CSV), import flow, and user management.
- [Exporting Boards](/wiki/export/) — CSV, Trello®, WeKan®, and Atlantisboard export formats with column configuration.

### More

- [Offline & PWA](/wiki/offline-pwa/) — Progressive Web App installation, offline caching, and sync.
- [Keyboard Shortcuts & Tips](/wiki/keyboard-shortcuts/) — Keyboard interactions, mobile gestures, and accessibility notes.

---

*This wiki is a living document. If you spot an error or have a suggestion, open an issue on the project repository.*
