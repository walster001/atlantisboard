---
name: GitHub Wiki Documentation
overview: Create comprehensive, production-ready GitHub Wiki documentation for AtlantisBoard covering all features, functionality, and user workflows. Documentation will be structured for end users, administrators, and developers, avoiding internal references.
todos:
  - id: explore-codebase
    content: Explore codebase to understand all features and functionality
    status: pending
  - id: create-introduction
    content: Create Introduction/Home page documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-getting-started
    content: Create Getting Started documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-workspaces
    content: Create Workspaces documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-boards-columns
    content: Create Boards and Columns documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-cards
    content: Create comprehensive Cards documentation (including inline buttons, attachments, subtasks)
    status: completed
    dependencies:
      - explore-codebase
  - id: create-roles-permissions
    content: Create Users and Roles documentation (built-in roles, custom roles, permissions)
    status: completed
    dependencies:
      - explore-codebase
  - id: create-invites
    content: Create Invites documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-realtime
    content: Create Real-Time Features documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-file-management
    content: Create File Management documentation (Minio storage)
    status: completed
    dependencies:
      - explore-codebase
  - id: create-themes-branding
    content: Create Themes and Branding documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-audit-logs
    content: Create Audit Logs documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-notifications
    content: Create Notifications and Feedback documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-import
    content: Create Board Import documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-troubleshooting
    content: Create Troubleshooting guide
    status: completed
    dependencies:
      - explore-codebase
  - id: create-best-practices
    content: Create Best Practices documentation
    status: completed
    dependencies:
      - explore-codebase
  - id: create-api-overview
    content: Create optional API Overview documentation (high-level only)
    status: completed
    dependencies:
      - explore-codebase
  - id: review-edit
    content: Review all documentation for consistency, clarity, and production-readiness
    status: completed
    dependencies:
      - create-introduction
      - create-getting-started
      - create-workspaces
      - create-boards-columns
      - create-cards
      - create-roles-permissions
      - create-invites
      - create-realtime
      - create-file-management
      - create-themes-branding
      - create-audit-logs
      - create-notifications
      - create-import
      - create-troubleshooting
      - create-best-practices
      - create-api-overview
---

# GitHub Wiki Documentation Plan for AtlantisBoard

## Overview

Generate complete documentation for AtlantisBoard, a Kanban-style project management tool. Documentation will be structured as GitHub Wiki pages covering all features and functionality in user-friendly language.

## Documentation Structure

The documentation will be organized into the following main sections:

### 1. Home / Introduction Page

- Overview of AtlantisBoard as a customizable Kanban board application
- Key concepts: Workspaces, Boards, Columns, Cards, Users, Roles
- High-level feature list

### 2. Getting Started

- Account creation and login (local accounts, Google OAuth)
- First workspace and board setup
- Navigation overview: Homepage, Board views, Settings
- User profile management

### 3. Workspaces

- Creating and managing workspaces
- Workspace members (automatic access to all boards in workspace)
- Workspace-level organization
- Real-time updates for workspace members

### 4. Boards and Columns

- Creating boards within workspaces
- Column management: create, rename, delete, reorder (drag-and-drop)
- Column color customization (per-column colors, theme colors, transparent option)
- Column-level permissions (through board roles)
- Board settings overview

### 5. Cards

- Creating and editing cards
- Card details: title, description (rich text with markdown and code support)
- Moving cards between columns (drag-and-drop)
- Card colors (individual and "apply to all" functionality)
- Due dates (with overdue/upcoming indicators)
- Labels (creating, assigning, custom colors)
- Assigning members to cards
- Attachments (uploading, viewing, downloading, deleting files)
- Subtasks/Checklists (creating, toggling completion, organizing)
- Inline buttons (embedded in card descriptions with custom icons stored in Minio)
- Card detail modal features

### 6. Users and Roles

- Built-in roles:
- **App Admin**: Global administrators with access to all features and user management
- **Board Admin**: Board-level administrators (manage board settings, members, content)
- **Manager**: Can manage members, create invites, view settings
- **Viewer**: Read-only access
- Custom roles: Creating and managing custom roles with granular permissions
- Permission categories: Boards, Columns, Cards, Labels, Attachments, Subtasks, Members, Invites, Settings
- Board-level vs App-level permissions
- App Admin management (viewing and updating app admin status)
- Real-time updates for role changes

### 7. Invites

- Generating invite links (one-time and recurring)
- Invite link types and expiration
- Accepting invites and automatic board/workspace assignments
- Managing active invite links
- Real-time updates for invite creation/deletion

### 8. Real-Time Features

- WebSocket-based real-time synchronization
- Features updated in real-time:
- Boards (creation, updates, deletion)
- Columns (create, update, delete, reorder)
- Cards (create, update, delete, move, color changes, assignees)
- Card details (attachments, subtasks, labels)
- Board members (add, remove, role changes)
- User role changes
- Conflict resolution using timestamps (last update wins)

### 9. File Management

- File uploads:
- Card attachments (stored in Minio)
- Inline button icons (stored in Minio, 500KB limit)
- Board background images (stored in Minio, 5MB limit)
- Branding assets (logos, stored in Minio)
- Supported file types and size limits
- File organization and storage structure
- Troubleshooting upload errors

### 10. Themes and Branding

- Board themes (customizable color schemes)
- Applying themes to boards
- Creating and editing custom themes
- Board background customization (colors and images)
- App-level branding (logos, app name, tagline, fonts)
- Custom fonts support

### 11. Audit Logs

- Board member audit logging
- Tracked actions: member added, removed, role changed
- Audit log entries include actor, target, timestamp, and changes
- Audit log retention settings
- Viewing audit logs (admin only)

### 12. Notifications and Feedback

- Toast notifications for actions and errors
- Real-time notifications for:
- Card moves and edits
- Role changes
- File upload success/failure
- Member additions/removals
- Permission changes
- Error messages and user-friendly feedback

### 13. Board Import

- Importing boards from Trello
- Importing boards from Wekan
- Handling imported data (cards, columns, labels, attachments)
- Inline button icon migration during import

### 14. Troubleshooting

- Common issues:
- Drag-and-drop not working
- Missing real-time updates
- File upload failures
- Permission access errors
- Real-time connection issues
- Steps to resolve issues
- Browser compatibility notes

### 15. Best Practices

- Workspace and board organization
- Using roles effectively for team management
- File management recommendations
- Custom roles and permissions design
- Board theme and branding tips
- Card organization strategies

### 16. API Overview (Optional/High-Level)

- General API structure (if publicly documented)
- Authentication requirements
- Key endpoints for boards, cards, users, files
- Rate limiting considerations
- No internal server URLs or endpoints

## Implementation Details

### Files to Reference

- `src/pages/Home.tsx` - Workspace and board management
- `src/pages/BoardPage.tsx` - Board view and card management
- `src/components/kanban/` - Card, column, and board components
- `src/components/admin/` - Admin features and permissions
- `src/lib/permissions/` - Permission system
- `src/realtime/workspaceSubscriptions.ts` - Real-time features
- `backend/prisma/schema.prisma` - Database structure reference

### Documentation Style

- Clear, concise language suitable for technical and non-technical users
- Step-by-step instructions where appropriate
- Examples and use cases
- Visual descriptions (since screenshots won't be included initially)
- No internal URLs, server addresses, or credentials
- No development/debug code references
- Production-ready content only

### Key Features to Document

1. Real-time synchronization and conflict resolution
2. Granular permission system with custom roles
3. App Admin vs Board Admin distinction
4. Inline buttons with custom icon support
5. "Apply to all" functionality for card/column colors
6. Audit logging for member changes
7. Workspace-based organization model
8. File storage via Minio (as requested)
9. Board themes and branding customization