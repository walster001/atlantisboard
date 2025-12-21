# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed
- **Session Security**: Configured JWT tokens to expire after 1 hour with refresh token rotation disabled, ensuring users must re-authenticate hourly for all authentication methods (local accounts, Google, Google + verification)

---

## [2024-12-21]

### Security
- **Hourly Re-authentication**: Added `[auth]` section to `supabase/config.toml` with:
  - `jwt_expiry = 3600` (1 hour session timeout)
  - `enable_refresh_token_rotation = false` (sessions truly expire, no silent renewal)
  - This ensures verification database checks run on every login for `google_verified` mode

### Improved
- **Invite Page Error Handling**: Enhanced error states in `InvitePage.tsx`:
  - Added `deleted` error type for removed invite links
  - Updated error icons: `Clock` for expired, `XCircle` for already used/invalid/deleted
  - Added `getErrorDescription()` function for user-friendly error messages
  - Improved error message clarity ("Link Already Used" instead of "Invite Already Used")

---

## Earlier Development (Pre-Changelog)

> **Note**: The following features were developed before this changelog was established. Dates are not available.

### Core Features
- **Kanban Board System**: Full drag-and-drop board with columns and cards
- **Workspace Management**: Multi-workspace support with owner permissions
- **Board Membership**: Role-based access control (admin, manager, viewer)
- **Card Features**: Labels, due dates, subtasks/checklists, assignees, attachments, color coding

### Authentication
- **Multi-mode Authentication**: Support for `local_accounts`, `google_only`, and `google_verified` login styles
- **Google OAuth Integration**: Sign in with Google support
- **Email Verification**: Configurable user verification via external MySQL database
- **Admin System**: App-wide admin designation via profiles table

### Theming & Customization
- **Board Themes**: Customizable colors for navbar, columns, cards, scrollbars, card windows
- **App Branding**: Custom logos, app names, taglines with font/color customization
- **Login Page Customization**: Custom backgrounds, logo placement, Google button styling
- **Custom Fonts**: Upload and use custom fonts throughout the app

### Import System
- **Wekan Import**: Import boards from Wekan JSON exports
- **Assignee Mapping**: Map imported users to existing profiles
- **Attachment Handling**: Manage pending attachments from imports
- **Inline Button Icons**: Replace CDN images during import

### Board Features
- **Board Invites**: Generate shareable invite links with expiration
- **Member Audit Log**: Track member additions, removals, and role changes
- **Background Settings**: Custom board background colors
- **Board Labels**: Colored labels for card categorization

---
