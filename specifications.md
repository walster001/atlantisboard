# Kanboard Application - Technical Specifications

## 1. Project Overview

A fully-functional, self-hosted Kanban board application combining the best features of Trello, Wekan, and Atlantisboard. The application will support local development mode and Docker deployment, with emphasis on single page application (SPA) architecture and real-time collaboration.

NOTE: All code MUST STRICTLY adhere to OWASP standards, including passport authentication implementation. https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html

## 2. Technology Stack

### Frontend
- **React** (v19.2.3) - Component-based UI library
- **TypeScript** (v5.9.3) - Type-safe JavaScript
- **React Router** (v7.12.0) - Client-side routing for SPA navigation
- **Tailwind CSS** (v4.1.18) - Utility-first CSS framework
- **Mantine UI** (v8.3.0) - React component library with CSS-in-JS styling
- **Dexie.js** (v4.2.1) - In-browser IndexedDB wrapper for real-time client-side storage
- **Socket.io Client** (v4.8.3) - Real-time client communication
- **Custom pointer drag-and-drop** - Delegated pointer handlers for Kanban and home board grid (`useKanbanDelegatedPointerDrag`, `kanbanPointerDrag`); touch-friendly `touch-action` and column auto-scroll as implemented in client code (no `@atlaskit/pragmatic-drag-and-drop` dependency)
- **Tiptap** (v3.20.4) - `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit` — ProseMirror-based rich text editor for card descriptions
- **@tiptap/static-renderer** (v3.20.4) - Read-only static rendering of stored JSON in card detail view
- **lowlight** (v3.3.0) - Syntax highlighting for code blocks (via `@tiptap/extension-code-block-lowlight`)
- **date-fns** (Latest) - Modern date utility library
- **zod** (v4.3.5) - Schema validation library
- **react-hook-form** (v7.70.0) - Performant form library with validation
- **axios** (Latest) - HTTP client for API requests
- **react-virtuoso** (v4.18.1) - Virtual scrolling for large lists

### Backend
- **Bun** (v1.3.5+) - JavaScript runtime, bundler, package manager, and test runner (replaces Node.js, Vite, npm, and test runner)
- **Express.js** (v5.2.1) - Web application framework
- **TypeScript** (v5.9.3) - Type-safe server-side code (Bun has built-in TypeScript support)
- **MongoDB** (v8.x or Latest) - NoSQL database
- **Mongoose** (v9.1.2) - MongoDB object modeling
- **Socket.io** (v4.8.3) - Real-time bidirectional communication (enhanced performance on Bun)
- **MongoDB Change Streams** - Real-time database change notifications
- **Passport.js** (v0.7.0 - Ensure latest with security patches) - Authentication middleware
- **Bun.password** - Built-in password hashing with Argon2id support (replaces Argon2id package)
- **jsonwebtoken** (Latest) - JWT token management
- **Redis** (Latest) - In-memory data store for session storage and caching (required)
- **Helmet.js** (Latest) - Security headers middleware
- **express-rate-limit** (Latest) - Rate limiting middleware
- **Pompelmi** (Latest) - Malware file scanning library
- **resumable.js** (Latest) - Resumable file uploads with MinIO TUS protocol support

### Authentication & External Services
- **Google OAuth 2.0** - Google authentication
- **Bun SQL API** - Built-in SQL support for external MySQL verification (replaces MySQL Client package)
- **nodemailer** - Email functionality (if needed)

### Storage & File Management
- **MinIO** (Latest) - Object storage for file attachments (S3-compatible)
  - Local MinIO storage by default
  - Optional S3 server configuration for cloud storage
  - Direct serve with optional CDN support
  - **Default Buckets**:
    - `import-inline` - For custom Wekan inline button images
    - `card-attachments` - For attachments on cards (organized by folders with card-id as folder name)
    - `branding` - For white-labeling (custom login logos, navbar logos, any branding assets) - **Public access**
    - `fonts` - For custom fonts
  - Access key management via environment variables and config file
  - No versioning support
  - No lifecycle policies

### Development & Deployment
- **Docker** (Latest) - Containerization
- **Docker Compose** (Latest) - Multi-container orchestration
- **Bun** (v1.3.5+) - All-in-one toolkit:
  - Runtime (replaces Node.js)
  - Bundler (replaces Vite)
  - Package manager (replaces npm)
  - Test runner (replaces Jest/Vitest)
  - Built-in HMR and hot reloading
  - Built-in TypeScript support
  - Built-in .env support
  - Built-in JSON parsing (for Trello/Wekan imports)
- **ESLint** (Latest) - Code linting
- **Prettier** (Latest) - Code formatting
- **bun build --analyze** - Built-in bundle size analysis (replaces webpack-bundle-analyzer)
- **bun audit** / **Snyk** - Dependency vulnerability scanning (bun audit replaces npm audit)
- **Winston** / **Pino** (Latest) - Structured logging
- **Sentry** (Latest) - Error monitoring and tracking
- **Swagger** / **OpenAPI** (Latest) - API documentation

### Import/Export Tools (Bun-Compatible)
- **fast-csv** (Latest) - Fast CSV parsing and formatting (Bun-compatible)
- **papaparse** (Latest) - Powerful CSV parser, works in browser and Bun runtime
- **zod** (v4.3.5) - Schema validation for import data validation (already in stack)
- Note: Trello/Wekan JSON imports use Bun's built-in JSON.parse() - no additional package needed

## 3. Architecture Overview

### Single Page Application (SPA)
- Primary rendering strategy: Client-side rendering with React
- Bun runtime serves static HTML shell and API endpoints (via Express.js)
- React Router for client-side routing and navigation
- All rendering and interactivity handled on the client
- Fast navigation without full page reloads
- Optimized initial bundle loading with code splitting (via Bun bundler)
- Built-in HMR and hot reloading for development

### Real-Time Architecture
- **MongoDB Change Streams** → Server listens to database changes
- **Socket.io** → Server broadcasts changes to connected clients
- **Dexie.js** → Client maintains local database copy for instant UI updates
- **Optimistic Updates** → UI updates immediately, syncs with server

### Data Flow
```
User Action → Client (Dexie.js) → Socket.io → Server → MongoDB
                                                      ↓
User Action ← Client (Dexie.js) ← Socket.io ← Change Streams
```

## 4. Core Features

### 4.1 Authentication System

#### Single Auth Screen
- Unified authentication interface on application start
- Login method selection configurable by admin
- Supports multiple authentication providers simultaneously

#### Authentication Methods

**Email/Password Login**
- User registration with email verification
- Secure password storage using Bun.password.hash() with Argon2id (built-in)
- Password reset functionality
- Session management with JWT tokens
- Remember me functionality

**Google OAuth Login**
- Standard Google OAuth 2.0 flow
- User profile retrieval from Google
- Automatic account creation on first login
- Profile picture and name synchronization

**Google OAuth + External MySQL Verification**
- Google OAuth authentication (as above)
- Post-authentication verification against external MySQL database using Bun's built-in SQL API
- Configurable connection settings (host, port, database, credentials)
- User lookup by email or custom identifier
- Role/permission mapping from external database
- Fallback handling for users not found in external DB

#### Admin Configuration
- Enable/disable authentication methods
- Configure OAuth credentials
- Configure external MySQL connection settings
- Set default authentication method
- Customize login screen branding

### 4.2 Workspace & Board Management

#### Workspaces
- **Multi-workspace support**: Users can belong to multiple workspaces
- **Workspace creation**: Users can create new workspaces
- **Workspace settings**:
  - Name and description
  - Logo/avatar
  - Member management (add/remove users)
  - Role assignment (Admin, Manager, Member, Viewer)
  - Workspace visibility (Public, Private, Team)
  - Workspace deletion/archiving:
    - Archiving hides workspace from normal view
    - Archived workspaces accessible to admins
    - Archiving archives all boards in workspace
    - Workspaces are restorable
    - Auto-delete archived workspaces after 5 days

#### Boards
- **Board creation**: Create boards within workspaces
- **Board types**: Personal boards, workspace boards
- **Board settings**:
  - Name and description
  - Background (color/image)
  - Visibility (Private, Workspace, Public)
  - Permission levels (Admin, Manager, Member, Viewer)
  - Board templates
  - Board archiving/deletion
- **Board views**: 
  - Kanban view (primary) - Column-based view
  - List view (primary) - Same as Kanban but different presentation (no swimlanes, keep it simple just columns)
  - Calendar view removed from scope

### 4.3 Lists & Cards

#### Lists (Columns)
- **List creation**: Add lists to boards
- **List management**:
  - Drag-and-drop reordering
  - List renaming
  - List archiving
  - List deletion
  - List limits (max cards)
- **List settings**:
  - WIP (Work In Progress) limits
  - List color coding

#### Cards
- **Card creation**: Add cards to lists
- **Card properties**:
  - Title (required)
  - Description (rich text, Tiptap JSON with static read view)
  - Labels/Tags (color-coded, custom labels)
  - Due dates and reminders
  - Checklists with progress tracking
  - Attachments (files, images, links)
  - Comments and activity log
  - Card cover (image/color)
  - Card position/ordering
- **Card actions**:
  - Drag-and-drop between lists
  - Card duplication:
    - Duplicate to chosen target list
    - Copy all properties (labels, checklists, attachments, comments)
    - Copy assignees, due dates, and reminders
    - Position: Same position in target list
  - Card archiving
  - Card deletion
  - Card templates
- **Card assignments**:
  - Assign to users
  - Multiple assignees support
  - Assignment notifications

### 4.4 Rich Text Editor
- Markdown support in card descriptions
- Code block syntax highlighting
- Inline formatting (bold, italic, underline, strikethrough)
- Lists (ordered, unordered)
- Links and images
- Tables
- Real-time collaborative editing (future enhancement)

### 4.5 Real-Time Collaboration

#### Real-Time Updates
- **Live board updates**: Changes visible to all users instantly
- **Presence indicators**: Show who's viewing/editing
- **Typing indicators**: Show when users are typing comments
- **Conflict resolution**: Handle simultaneous edits gracefully
- **Optimistic UI**: Immediate feedback before server confirmation

#### Notifications
- In-app notifications
- Browser push notifications (PWA)
- Notification preferences per user:
  - Per-type preferences (reminders, assignments, comments, mentions, invites)
  - Delivery methods per type (in-app, push, SMS future)
  - Global notification toggle
  - Email notifications removed from scope
- Notification storage: Separate Notifications collection
- Read/unread status tracking
- Auto-delete notifications after 10 days

### 4.6 User Management & Permissions

#### User Roles
- **Admin**: Full control over workspace/board
- **Manager**: Can manage boards, members, settings
- **Member**: Can only add and remove users at viewer level permission to board
- **Viewer**: Read-only access

#### Permission System
- Granular permissions per board
- Permission inheritance from workspace
- Custom permission sets:
  - All admins can create custom permission sets
  - Permission strings for all actions (e.g., `boards.user.view`, `admin.modifyrole`, `admin.viewpermission.roles`)
  - Toggle switches and 'Permissions Roles' tab in admin configuration
  - Permission granularity: Create permission strings for all actions any authenticated user could perform

### 4.7 Import/Export Functionality

#### Import

**Trello Import (JSON Format)**
- **Workspace Mapping**:
  - Trello organizations → Create new workspace in application
  - Workspace name: Use Trello organization name or "Imported from Trello"
  - Workspace visibility: Set to "private" by default
  - Workspace owner: User performing the import
- **Board Mapping**:
  - Trello board → Application board
  - Board name: Preserve Trello board name
  - Board description: Map from Trello board description
  - Board background: Map Trello board background (color or image URL)
  - Board visibility: Map from Trello board visibility settings
  - Board members: Map Trello board members (if email matches existing users)
  - Board settings: Preserve board preferences
- **List Mapping**:
  - Trello lists → Application lists
  - List name: Preserve Trello list name
  - List position: Preserve Trello list position/order
  - List archived status: Map Trello list closed status
- **Card Mapping**:
  - Trello cards → Application cards
  - Card title: Preserve Trello card name
  - Card description: Map Trello card description (plain text wrapped as Tiptap JSON)
  - Card position: Preserve Trello card position within list
  - Card cover: Map Trello card cover (image URL or color)
  - Card archived status: Map Trello card closed status
  - Card due date: Map Trello card due date
  - Card start date: Map from Trello card start date (if available)
  - Card completion: Map Trello card completion status
  - Card created date: Preserve Trello card creation date
  - Card updated date: Preserve Trello card last modified date
- **Label Mapping**:
  - Trello labels → Application labels
  - Label name: Preserve Trello label name
  - Label color: Map Trello label color to closest application color
  - Label assignment: Preserve label assignments to cards
- **Checklist Mapping**:
  - Trello checklists → Application checklists
  - Checklist title: Preserve Trello checklist name
  - Checklist items: Map Trello checklist items to application checklist items
  - Item text: Preserve Trello checklist item name
  - Item completion: Map Trello checklist item state (complete/incomplete)
  - Item completion date: Preserve Trello checklist item completion date (if completed)
- **Attachment Mapping**:
  - Trello attachments → Application attachment placeholders
  - Create placeholder entries for all Trello attachments
  - Placeholder format: `[Attachment: {filename} - {size} - {type}]`
  - Include original attachment URL in placeholder description (if available)
  - Preserve attachment metadata (name, size, type, upload date)
  - Do not download or import actual attachment files
- **Comment Mapping**:
  - Trello comments → Application card comments
  - Comment text: Preserve Trello comment data
  - Comment author: Map Trello member to application user (by email)
  - Comment date: Preserve Trello comment creation date
  - Comment updates: Preserve Trello comment modification history
- **Member Mapping**:
  - Trello members → Application users
  - Match by email address (if user exists in application)
  - Don't create users for unmatched trello member imports
  - All imported users that are matched have viewer permissions by default

**Wekan Import (JSON Format)**
- **Workspace Creation**:
  - Each Wekan board → Create new workspace in application
  - Workspace name: Use Wekan board title or "Imported from Wekan - {board name}"
  - Workspace description: Map from Wekan board description
  - Workspace visibility: Set to "private" by default
  - Workspace owner: User performing the import
- **Board Mapping**:
  - Wekan board → Application board (within created workspace)
  - Board name: Preserve Wekan board title
  - Board description: Map from Wekan board description
  - Board background: Map Wekan board background (color or image)
  - Board visibility: Map from Wekan board permission settings
  - Board members: Map Wekan board members (if email matches existing users)
  - Board archived status: Map Wekan board archived state
- **List Mapping**:
  - Wekan swimlanes/lists → Application lists
  - List name: Preserve Wekan list/swimlane title
  - List position: Preserve Wekan list position
  - List archived status: Map Wekan list archived state
  - List WIP limit: Map from Wekan list settings (if available)
- **Card Mapping**:
  - Wekan cards → Application cards
  - Card title: Preserve Wekan card title
  - Card description: Map Wekan card description (plain text wrapped as Tiptap JSON)
  - Card position: Preserve Wekan card sort order
  - Card cover: Map Wekan card cover image (if available)
  - Card archived status: Map Wekan card archived state
  - Card due date: Map Wekan card due date
  - Card start date: Map Wekan card start date (if available)
  - Card completion: Map Wekan card completion status
  - Card created date: Preserve Wekan card creation date
  - Card updated date: Preserve Wekan card modification date
- **Label Mapping**:
  - Wekan labels → Application labels
  - Label name: Preserve Wekan label name
  - Label color: Map Wekan label color to closest application color
  - Label assignment: Preserve label assignments to cards
- **Checklist Mapping**:
  - Wekan checklists → Application checklists
  - Checklist title: Preserve Wekan checklist title
  - Checklist items: Map Wekan checklist items (subtasks)
  - Item text: Preserve Wekan checklist item title
  - Item completion: Map Wekan checklist item finished state
  - Item completion date: Preserve Wekan checklist item finish date (if completed)
  - Item sort order: Preserve Wekan checklist item sort order
- **Attachment Mapping**:
  - Wekan attachments → Application attachment placeholders
  - Create placeholder entries for all Wekan attachments
  - Placeholder format: `[Attachment: {filename} - {size} - {type}]`
  - Include original attachment path/URL in placeholder description (if available)
  - Preserve attachment metadata (name, size, type, upload date, uploader)
  - Do not download or import actual attachment files
- **Comment Mapping**:
  - Wekan comments → Application card comments
  - Comment text: Preserve Wekan comment text
  - Comment author: Map Wekan user to application user (by email or username)
  - Comment date: Preserve Wekan comment creation date
  - Comment updates: Preserve Wekan comment modification history
- **User Mapping**:
  - Wekan users → Application users
  - Match by email address or username (if user exists in application)
  - Don't create users for unmatched Wekan users
  - All imported users that are matched should have viewer permissions assigned by default

**CSV/TSV Import**
- **File Format**: Support both CSV and TSV formats
- **Column Mapping**:
  - Title/Name → Card title (required)
  - Description → Card description
  - List/Column → Target list name (create if doesn't exist)
  - Labels/Tags → Card labels (comma-separated)
  - Due Date → Card due date (parse various date formats)
  - Start Date → Card start date (if provided)
  - Assignees → Card assignees (comma-separated emails)
  - Position → Card position in list
  - Checklist Items → Card checklist items (semicolon-separated)
- **Bulk Processing**:
  - Process imports in batches (recommended: 100 cards per batch)
  - Show progress indicator during import
  - Error handling: Stop on first error and rollback
  - Validate data before import (required fields, date formats, etc.)

**Import Tools & Libraries (Bun-Compatible)**
- **JSON Parsing**: Use Bun's built-in JSON.parse() for Trello/Wekan JSON imports
- **CSV Parsing**: Consider Bun-compatible packages:
  - `fast-csv` (Latest) - Fast CSV parsing and formatting, Bun-compatible
  - `papaparse` (Latest) - Powerful CSV parser, works in browser and Bun runtime
- **Batch Processing**: Use Bun's native capabilities:
  - Process imports in batches using async/await with Promise.all()
  - Use Bun's fast file I/O for reading import files
  - Leverage Bun's performance for bulk database operations
- **Data Validation**: Use zod schemas for import data validation
- **Error Handling**: Implement comprehensive error handling and reporting
- **Progress Tracking**: Use Socket.io to broadcast import progress to client

#### Export
- **Board export**: Export board as JSON (include all cards, lists, labels, checklists, comments)
- **CSV export**: Export cards to CSV (configurable columns)
- **PDF export**: Export board as PDF (future)

### 4.8 Invite Links

#### Invite Link Types
- **Workspace-level invites**: Invite users to join a workspace
- **Board-level invites**: Invite users directly to a board
- **Board invites auto-add to workspace**: Board invites automatically add users to the parent workspace
- **Separate invite flows**: Different UI flows for workspace vs board invites
- **Cannot invite directly to board without workspace**: Users must be in workspace to access board

#### Invite Link Expiry
- **One-time invites**: Expire after 1 day
- **Recurring invites**: No expiry (valid until manually deleted)
- **Recurring link management**: Delete button in recurring links display for manual deletion
- **Auto-disable**: One-time invites automatically disabled after first use

#### Invite Link Permissions
- **Role specification**: Invite specifies the role (Admin, Manager, Member, Viewer)
- **Default role**: Viewer if role not specified
- **Role setting**: Only Admins can set the role when creating invites
- **Post-acceptance**: Workspace admins cannot change roles after invite acceptance

#### Invite Link Security
- **Token format**: UUID v4 (32 characters)
- **Cryptographically secure**: Yes
- **Rate limiting**: 300 attempts per minute on invite acceptance
- **IP tracking**: No IP address tracking

### 4.9 Labels Management

#### Label Scope
- **Board-level labels**: Labels are specific to each board
- **Label creation**: Labels are globally defined at board level in board settings modal
- **Label assignment**: Labels available to add at card level
- **Unlimited labels**: No maximum limit on labels per board

#### Label Color System
- **Color options**: Both predefined palette and custom hex color picker
- **Predefined colors**: Trello's 10 colors + Wekan's label colors (analyze Wekan CSS at https://github.com/wekan/wekan/blob/2325a5c5322357103af1794c3a0a499e78d8d142/client/components/cards/labels.css for exact background colors)
- **Custom colors**: Custom hex color picker available
- **Per-board customization**: Label colors customizable per board

#### Label Management Permissions
- **Create/Edit/Delete**: Only board Admins can create, edit, and delete labels
- **Viewers**: Can see labels but cannot manage them
- **Label deletion**: When label is deleted, it is automatically removed from all cards using the label

### 4.10 Reminders

#### Reminder Types
- **In-app notifications**: Yes
- **Browser push notifications**: Yes
- **Email reminders**: No
- **SMS (future)**: Planned for future
- **User preferences**: User preferences control delivery method

#### Reminder Timing
- **Custom time offsets**: Users can set custom reminder times (not fixed options only)
- **Multiple reminders**: Up to 3 reminders per due date
- **Time of day**: No specific time of day requirement
- **Flexible configuration**: Users can configure reminders relative to due date

#### Reminder Frequency
- **Repeat if overdue**: Yes, reminders repeat if task is overdue
- **Custom frequency**: User-specified repeat frequency (input field)
- **Maximum repeats**: Unlimited repeats until task is completed

#### Reminder Notifications
- **Respect preferences**: Reminders respect user notification preferences
- **Snooze feature**: No snooze feature
- **Dismissible**: Yes, reminders can be dismissed
- **Completed tasks**: Do not send reminders if task completed after reminder time

### 4.11 Board Templates

#### Template Scope
- **Global templates**: Templates are global, available to all admin users and custom roles with appropriate permissions
- **Template marketplace**: No template marketplace (future enhancement not planned)

#### Template Content
- **Pre-configured lists**: Yes
- **Default labels**: Yes
- **Default card templates**: Yes
- **Board settings**: Visibility and custom permissions included
- **Sample cards**: Sample cards with descriptions included
- **Checklists**: Checklists included

#### Template Application
- **Create board via template**: Separate "Create board via Template" button (as opposed to regular "Create Board" button)
- **Apply to existing board**: No, templates cannot be applied to existing boards
- **Customization**: Users can customize template content before applying, and board is fully customizable after applying
- **Reversible**: Template application is not reversible

#### Template Permissions
- **Create templates**: Only Admins can create templates
- **Share templates**: Only Admins can share templates
- **Template visibility**: All templates are private (no public/private option)
- **Sharing**: Templates can be shared between workspaces

### 4.12 Card Templates

#### Template Scope
- **Board-level templates**: Card templates are board-specific

#### Template Content
- **Default title/description**: Yes
- **Default labels**: Yes
- **Default checklists**: Yes
- **Default assignees**: Yes
- **Default due date rules**: Yes (e.g., "7 days from creation")

#### Template Usage
- **Quick-add with template**: Quick-add button with template selection
- **Template library**: Template library available in card creation modal
- **Create from existing card**: Users can create templates from existing cards
- **Edit templates**: Templates can be edited after creation

### 4.13 Activity Log

#### Activity Log Scope
- **Board-level activity**: Yes
- **Card-level activity**: Yes
- **User-level activity feed**: Yes
- **Comprehensive logging**: All activity types are logged

#### Activity Log Retention
- **Configurable retention**: Configurable retention period per workspace/board
- **Default retention**: 30 days
- **Different retention per type**: No, same retention for all activity types
- **Archive**: No archiving of old activities
- **Cleanup method**: Both automatic (cron job) and manual
- **Cleanup frequency**: Weekly (respects per-workspace retention periods)
- **Cleanup logging**: Cleanup operations logged in audit trail
- **Export before cleanup**: No export functionality before cleanup

#### Activity Log Filtering
- **Filter by user**: No
- **Filter by activity type**: Yes
- **Filter by date range**: No
- **Filter by card/board**: Yes
- **Search functionality**: Yes

#### Activity Log Privacy
- **View permissions**: Only Admins and Managers can view activity logs
- **Different permissions per type**: No, same permissions for all activity types

### 4.14 Placeholder Users

#### Placeholder User Display
- **Display name**: Show original name from import source
- **Show email**: No, do not show original email
- **Special icon/badge**: Yes, special icon/badge to indicate placeholder status
- **Clickable/viewable**: Yes, placeholder users are clickable and viewable

#### Placeholder User Conversion
- **Auto-convert**: Automatic conversion when user signs up with matching email
- **Manual conversion**: Yes, all admins can manually convert placeholder users
- **Invite placeholders**: No, cannot invite placeholder users
- **Merge with existing**: Yes, placeholder users can be merged with existing users

#### Placeholder User Permissions
- **Default role**: Viewer role by default
- **Change permissions**: Permissions can be changed after conversion

### 4.15 List Settings

#### Max Cards Limit
- **Enforcement**: Both hard limit and soft limit options available
- **Visual indicator**: Yes, visual indicator when limit is reached
- **Exceed temporarily**: No, limit cannot be exceeded temporarily
- **When limit reached**: Both prevent new cards and show warning
- **Default limit**: 1000 cards per list

#### List Color Coding
- **Color application**: Background, border, and header colors all customizable
- **Customizable per list**: Yes, each list can have its own color
- **Apply to all**: Button to apply chosen color to all lists in the board
- **Color system**: Both predefined palette (20 colors) and custom hex colors

#### WIP Limits
- **Same as max cards**: WIP limit is the same as max cards limit
- **Visual indicator**: Yes, visual indicator when limit is reached
- **Prevent moving cards**: No, cards can still be moved when limit reached (warning only)
- **Enforcement**: Warning only (not a hard limit)
- **Scope**: Per-list WIP limit

### 4.16 Customization & Branding

#### Application Customization
- Customizable app name
- Custom login icon/logo
- Custom tagline text
- Font size and text size controls
- Theme selection (light/dark/custom)
- Color scheme customization

#### Board Customization
- Background images/colors
- Custom card cover images
- Label colors and names
- Board templates

## 5. Database Schema

### MongoDB Collections

#### Users
```typescript
{
  _id: ObjectId,
  email: string,
  username: string,
  passwordHash?: string, // null for OAuth-only users
  googleId?: string,
  profilePicture?: string,
  displayName: string,
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date,
  preferences: {
    theme: 'light' | 'dark' | 'auto',
    notifications: boolean, // global notification toggle
    language: string,
    notificationPreferences: {
      reminders: {
        inApp: boolean,
        push: boolean,
        sms: boolean // future
      },
      assignments: {
        inApp: boolean,
        push: boolean
      },
      comments: {
        inApp: boolean,
        push: boolean
      },
      mentions: {
        inApp: boolean,
        push: boolean
      },
      invites: {
        inApp: boolean,
        push: boolean
      }
    }
  },
  emailVerified: boolean,
  verificationToken?: string,
  isPlaceholder?: boolean, // true for placeholder users from imports
  placeholderSource?: 'trello' | 'wekan', // source of placeholder user
  placeholderEmail?: string, // original email from import source
  placeholderName?: string, // original name from import source
  failedLoginAttempts: number, // for account lockout
  lockedUntil?: Date // account lockout expiration
}
```

#### Workspaces
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  logo?: string,
  ownerId: ObjectId, // User reference
  visibility: 'public' | 'private' | 'team',
  archived: boolean,
  archivedAt?: Date,
  activityLogRetentionDays?: number, // Configurable retention period (default: 30 days)
  createdAt: Date,
  updatedAt: Date,
  members: [{
    userId: ObjectId,
    role: 'admin' | 'manager' | 'member' | 'viewer',
    joinedAt: Date
  }]
}
```

#### Boards
```typescript
{
  _id: ObjectId,
  workspaceId?: ObjectId, // null for personal boards
  name: string,
  description?: string,
  background?: string, // color or image URL
  visibility: 'private' | 'workspace' | 'public',
  ownerId: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  archived: boolean,
  archivedAt?: Date,
  members: [{
    userId: ObjectId,
    role: 'admin' | 'manager' | 'member' | 'viewer',
    addedAt: Date
  }],
  settings: {
    allowComments: boolean,
    allowAttachments: boolean,
    cardCoverImages: boolean
  },
  templateId?: ObjectId, // Reference to BoardTemplate if created from template
  cardTemplates: [ObjectId] // References to CardTemplates for this board
}
```

#### Lists
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  name: string,
  position: number,
  archived: boolean,
  createdAt: Date,
  updatedAt: Date,
  wipLimit?: number, // same as maxCards
  maxCards?: number, // default: 1000 per list
  color?: string // background, border, header color (hex or predefined)
}
```

#### Cards
```typescript
{
  _id: ObjectId,
  listId: ObjectId,
  boardId: ObjectId,
  title: string,
  description?: string,
  position: number,
  cover?: string, // image URL or color
  labels: [{
    id: string,
    name: string,
    color: string
  }],
  dueDate?: Date,
  startDate?: Date,
  completed: boolean,
  completedAt?: Date,
  archived: boolean,
  archivedAt?: Date,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  assignees: [ObjectId], // User references
  reminders: [{
    id: string,
    triggerAt: Date,
    repeatFrequency?: string, // custom frequency input
    sent: boolean,
    sentAt?: Date,
    dismissed: boolean
  }],
  attachments: [{
    id: string,
    name: string,
    url: string,
    type: string,
    size: number,
    uploadedAt: Date,
    uploadedBy: ObjectId
  }],
  comments: [{
    id: string,
    userId: ObjectId,
    text: string,
    createdAt: Date,
    updatedAt: Date
  }],
  checklists: [{
    id: string,
    title: string,
    items: [{
      id: string,
      text: string,
      completed: boolean,
      completedAt?: Date,
      sortOrder?: number // for preserving order from imports
    }]
  }]
}
```

#### Activities (Activity Log)
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  cardId?: ObjectId,
  userId: ObjectId,
  type: string, // 'card_created', 'card_moved', 'comment_added', etc.
  description: string,
  metadata: object,
  createdAt: Date
}
```

#### Sessions
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  token: string,
  expiresAt: Date,
  createdAt: Date,
  ipAddress?: string,
  userAgent?: string
}
```

#### InviteLinks
```typescript
{
  _id: ObjectId,
  workspaceId?: ObjectId, // null for board-level invites
  boardId?: ObjectId, // null for workspace-level invites
  token: string, // UUID v4, 32 characters, cryptographically secure
  type: 'workspace' | 'board',
  inviteType: 'one-time' | 'recurring',
  role: 'admin' | 'manager' | 'member' | 'viewer',
  expiresAt?: Date, // 1 day for one-time, null for recurring
  maxUses?: number, // null for recurring (unlimited)
  usedCount: number,
  createdBy: ObjectId, // Admin who created the invite
  createdAt: Date,
  lastUsedAt?: Date
}
```

#### BoardLabels
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  name: string,
  color: string, // hex color or predefined color name
  isPredefined: boolean, // true if using predefined color
  createdAt: Date,
  createdBy: ObjectId
}
```

#### BoardTemplates
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  category?: string,
  createdBy: ObjectId, // Admin
  createdAt: Date,
  updatedAt: Date,
  templateData: {
    lists: [{
      name: string,
      position: number,
      wipLimit?: number,
      maxCards?: number,
      color?: string
    }],
    defaultLabels: [{
      name: string,
      color: string
    }],
    defaultCardTemplates: [{
      title: string,
      description?: string,
      labels: [string],
      checklists: [...],
      assignees: [ObjectId],
      dueDateRule?: string
    }],
    boardSettings: {
      visibility: 'private' | 'workspace' | 'public',
      permissions: object
    },
    sampleCards: [{
      title: string,
      description?: string,
      listName: string,
      position: number
    }]
  }
}
```

#### CardTemplates
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  name: string,
  title: string,
  description?: string,
  defaultLabels: [string], // Label IDs
  defaultChecklists: [{
    title: string,
    items: [{
      text: string,
      sortOrder: number
    }]
  }],
  defaultAssignees: [ObjectId],
  dueDateRule?: string, // e.g., "7 days from creation"
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

#### ImportJobs
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  type: 'trello' | 'wekan' | 'csv',
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress: number, // 0-100
  totalItems: number,
  processedItems: number,
  errors: [{
    item: string,
    error: string
  }],
  result: {
    workspaceId?: ObjectId,
    boardId?: ObjectId,
    importedCount: number
  },
  createdAt: Date,
  updatedAt: Date,
  completedAt?: Date,
  expiresAt: Date // Auto-delete after 2 days
}
```

#### Notifications
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  type: 'reminder' | 'assignment' | 'comment' | 'mention' | 'invite',
  title: string,
  message: string,
  relatedCardId?: ObjectId,
  relatedBoardId?: ObjectId,
  read: boolean,
  readAt?: Date,
  delivered: boolean,
  deliveredAt?: Date,
  createdAt: Date,
  expiresAt: Date // Auto-delete after 10 days
}
```

#### AdminConfig
```typescript
{
  _id: ObjectId,
  authMethods: {
    emailPassword: boolean,
    googleOAuth: boolean,
    googleOAuthExternalMySQL: boolean
  },
  googleOAuth: {
    clientId?: string, // encrypted
    clientSecret?: string, // encrypted
    enabled: boolean
  },
  externalMySQL: {
    host?: string,
    port?: number,
    database?: string,
    username?: string, // encrypted
    password?: string, // encrypted
    enabled: boolean
  },
  defaultAuthMethod: 'email' | 'google' | 'google-external',
  loginScreenBranding: {
    appName?: string,
    logo?: string,
    tagline?: string
  },
  rateLimiting: {
    authEndpoints: { attempts: number, windowMinutes: number }, // default: 900 per 1 minute
    fileUploads: { attempts: number, windowMinutes: number }, // default: 10 per 1 minute
    generalAPI: { attempts: number, windowMinutes: number } // default: 1000 per 1 minute
  },
  updatedBy: ObjectId,
  updatedAt: Date
}
```

#### PermissionSets
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  permissions: [string], // e.g., ['boards.user.view', 'admin.modifyrole', 'admin.viewpermission.roles']
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## 6. API Endpoints

All API endpoints use version `/api/v1/` prefix for future compatibility.

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - Email/password login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/google` - Initiate Google OAuth
- `GET /api/v1/auth/google/callback` - Google OAuth callback
- `POST /api/v1/auth/google/verify-external` - Verify against external MySQL
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `GET /api/v1/auth/verify-email` - Verify email address
- `GET /api/v1/auth/me` - Get current user

### Workspaces
- `GET /api/v1/workspaces` - List user's workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces/:id` - Get workspace details
- `PUT /api/v1/workspaces/:id` - Update workspace
- `DELETE /api/v1/workspaces/:id` - Delete workspace
- `POST /api/v1/workspaces/:id/archive` - Archive workspace
  - Archives all boards in workspace
  - Hides workspace from normal view
  - Accessible to admins
- `POST /api/v1/workspaces/:id/restore` - Restore archived workspace
- `POST /api/v1/workspaces/:id/members` - Add member
- `DELETE /api/v1/workspaces/:id/members/:userId` - Remove member
- `PUT /api/v1/workspaces/:id/members/:userId` - Update member role

### Boards
- `GET /api/v1/boards` - List boards (filtered by workspace/user)
- `POST /api/v1/boards` - Create board
- `GET /api/v1/boards/:id` - Get board details
- `PUT /api/v1/boards/:id` - Update board
- `DELETE /api/v1/boards/:id` - Delete board
- `POST /api/v1/boards/:id/archive` - Archive board
- `POST /api/v1/boards/:id/restore` - Restore archived board
- `POST /api/v1/boards/:id/members` - Add board member
- `DELETE /api/v1/boards/:id/members/:userId` - Remove board member

### Lists
- `GET /api/v1/boards/:boardId/lists` - Get all lists for a board
- `POST /api/v1/boards/:boardId/lists` - Create list
- `PUT /api/v1/lists/:id` - Update list
- `DELETE /api/v1/lists/:id` - Delete list
- `PUT /api/v1/lists/reorder` - Reorder lists

### Cards
- `GET /api/v1/lists/:listId/cards` - Get all cards in a list
- `POST /api/v1/lists/:listId/cards` - Create card
- `GET /api/v1/cards/:id` - Get card details
- `PUT /api/v1/cards/:id` - Update card
- `DELETE /api/v1/cards/:id` - Delete card
- `PUT /api/v1/cards/:id/move` - Move card to different list
- `PUT /api/v1/cards/reorder` - Reorder cards
- `POST /api/v1/cards/:id/assignees` - Add assignee
- `DELETE /api/v1/cards/:id/assignees/:userId` - Remove assignee
- `POST /api/v1/cards/:id/attachments` - Upload attachment
  - Request: multipart/form-data
  - File size limit: 1000 MB
  - Progress tracking: Yes
  - Resumable uploads: Yes (using resumable.js with MinIO TUS protocol)
  - Malware scanning: Yes (using Pompelmi)
  - Storage: MinIO bucket `card-attachments` (organized by card-id folders)
  - Serving: Direct serve with authentication verification (except branding folder which is public)
  - Response: { id, name, url, type, size, uploadedAt, uploadedBy }
- `DELETE /api/v1/cards/:id/attachments/:attachmentId` - Delete attachment
- `POST /api/v1/cards/:id/comments` - Add comment
- `PUT /api/v1/cards/:id/comments/:commentId` - Update comment
- `DELETE /api/v1/cards/:id/comments/:commentId` - Delete comment
- `POST /api/v1/cards/:id/checklists` - Add checklist
- `PUT /api/v1/cards/:id/checklists/:checklistId` - Update checklist
- `DELETE /api/v1/cards/:id/checklists/:checklistId` - Delete checklist
- `POST /api/v1/cards/:id/duplicate` - Duplicate card
  - Request body: { listId?: string, position?: number }
  - Returns: New duplicated card
  - Copies all properties (labels, checklists, attachments, comments, assignees, due dates, reminders)
  - Position: Same position in target list (or specified position)

### Invite Links
- `POST /api/v1/workspaces/:id/invites` - Create workspace invite link
  - Request body: { type: 'one-time' | 'recurring', role: 'admin' | 'manager' | 'member' | 'viewer' }
  - Response: Invite link with token
  - Only Admins can create invites
- `POST /api/v1/boards/:id/invites` - Create board invite link
  - Request body: { type: 'one-time' | 'recurring', role: 'admin' | 'manager' | 'member' | 'viewer' }
  - Response: Invite link with token
  - Only Admins can create invites
  - Auto-adds user to parent workspace
- `GET /api/v1/invites/:token` - Get invite details (validate token)
  - Returns: Invite details (workspace/board, role, expiry, type)
- `POST /api/v1/invites/:token/accept` - Accept invite
  - Rate limited: 300 attempts per minute
  - Returns: Workspace/board access granted
- `DELETE /api/v1/invites/:token` - Revoke invite link
  - Only creator or workspace admin can revoke
- `GET /api/v1/workspaces/:id/invites` - List workspace invite links
  - Returns: List of active invite links
- `GET /api/v1/boards/:id/invites` - List board invite links
  - Returns: List of active invite links

### Labels
- `GET /api/v1/boards/:id/labels` - Get all board labels
- `POST /api/v1/boards/:id/labels` - Create board label
  - Request body: { name: string, color: string, isPredefined: boolean }
  - Only Admins can create labels
- `PUT /api/v1/labels/:id` - Update label
  - Only Admins can update labels
- `DELETE /api/v1/labels/:id` - Delete label
  - Only Admins can delete labels
  - Automatically removes label from all cards using it
- `POST /api/v1/cards/:id/labels/:labelId` - Assign label to card
- `DELETE /api/v1/cards/:id/labels/:labelId` - Remove label from card

### Reminders
- `GET /api/v1/cards/:id/reminders` - Get card reminders
- `POST /api/v1/cards/:id/reminders` - Create reminder
  - Request body: { triggerAt: Date, repeatFrequency?: string }
  - Max 3 reminders per card
- `PUT /api/v1/cards/:id/reminders/:reminderId` - Update reminder
- `DELETE /api/v1/cards/:id/reminders/:reminderId` - Delete reminder
- `POST /api/v1/cards/:id/reminders/:reminderId/dismiss` - Dismiss reminder

### Board Templates
- `GET /api/v1/templates/boards` - Get all board templates
  - Returns: List of global templates (Admins and authorized roles)
- `POST /api/v1/templates/boards` - Create board template
  - Request body: Template data (lists, labels, card templates, settings, sample cards)
  - Only Admins can create templates
- `GET /api/v1/templates/boards/:id` - Get board template details
- `PUT /api/v1/templates/boards/:id` - Update board template
  - Only Admins can update templates
- `DELETE /api/v1/templates/boards/:id` - Delete board template
  - Only Admins can delete templates
- `POST /api/v1/boards/create-from-template/:templateId` - Create board from template
  - Request body: { name: string, workspaceId?: ObjectId, customizations?: object }
  - Returns: New board created from template

### Card Templates
- `GET /api/v1/boards/:id/templates/cards` - Get card templates for board
- `POST /api/v1/boards/:id/templates/cards` - Create card template
  - Request body: { name, title, description, labels, checklists, assignees, dueDateRule }
- `GET /api/v1/templates/cards/:id` - Get card template details
- `PUT /api/v1/templates/cards/:id` - Update card template
- `DELETE /api/v1/templates/cards/:id` - Delete card template
- `POST /api/v1/cards/create-from-template/:templateId` - Create card from template
  - Request body: { listId: string, customizations?: object }

### Activity Log
- `GET /api/v1/boards/:id/activities` - Get board activity log
  - Query params: `type` (filter by activity type), `cardId` (filter by card), `search` (search text)
  - Only Admins and Managers can access
- `GET /api/v1/cards/:id/activities` - Get card activity log
  - Only Admins and Managers can access
- `GET /api/v1/activities` - Get user activity feed
  - Returns: User's activity across all boards
  - Only Admins and Managers can access

### List Settings
- `PUT /api/v1/lists/:id/settings` - Update list settings
  - Request body: { maxCards?: number, wipLimit?: number, color?: string }
  - Updates maxCards, WIP limit, and color settings

### Notifications
- `GET /api/v1/notifications` - Get all user notifications
  - Query params: `type` (filter by notification type)
  - Returns: All notifications (not paginated)
- `PUT /api/v1/notifications/:id/read` - Mark notification as read
- `PUT /api/v1/notifications/read-all` - Mark all notifications as read
- `DELETE /api/v1/notifications/:id` - Delete notification
- Auto-delete old notifications after 10 days

### User Preferences
- `PUT /api/v1/users/me/preferences` - Update user preferences
  - Request body: { theme?, notifications?, language?, notificationPreferences? }
- `PUT /api/v1/users/me/notification-preferences` - Update notification preferences
  - Request body: { reminders?, assignments?, comments?, mentions?, invites? }

### Placeholder Users
- `POST /api/v1/users/:id/convert-from-placeholder` - Manual conversion of placeholder user
  - Only all admins can convert
- `POST /api/v1/users/:placeholderId/merge/:userId` - Merge placeholder with existing user
  - Only all admins can merge

### Permission Sets
- `GET /api/v1/permission-sets` - Get all permission sets
- `POST /api/v1/permission-sets` - Create custom permission set
  - Request body: { name, description?, permissions: [string] }
  - Only all admins can create
- `GET /api/v1/permission-sets/:id` - Get permission set details
- `PUT /api/v1/permission-sets/:id` - Update permission set
  - Only all admins can update
- `DELETE /api/v1/permission-sets/:id` - Delete permission set
  - Only all admins can delete

### Import/Export
- `POST /api/v1/import/trello` - Import Trello board (JSON file upload)
  - Request body: multipart/form-data with JSON file
  - Response: Import progress ID and initial status
  - Creates workspace if Trello organization exists
  - Maps all board data (lists, cards, labels, checklists, comments, attachments as placeholders)
  - Error handling: Stop on first error and rollback
  - Progress updates: Batch updates every 10 items via Socket.io
- `POST /api/v1/import/wekan` - Import Wekan board (JSON file upload)
  - Request body: multipart/form-data with JSON file
  - Response: Import progress ID and initial status
  - Creates new workspace for each Wekan board
  - Maps all board data (lists, cards, labels, checklists, comments, attachments as placeholders)
  - Error handling: Stop on first error and rollback
  - Progress updates: Batch updates every 10 items via Socket.io
- `POST /api/v1/import/csv` - Import CSV/TSV
  - Request body: multipart/form-data with CSV/TSV file
  - Query params: `workspaceId` (optional), `boardId` (optional)
  - Response: Import progress ID and initial status
  - Supports column mapping configuration
  - Processes in batches (100 cards per batch)
  - Error handling: Stop on first error and rollback
  - Progress updates: Batch updates every 10 items via Socket.io
- `GET /api/v1/import/:importId/status` - Get import progress status
  - Returns: progress percentage, status, errors (summary format), imported count
  - Auto-deletes after 2 days
- `GET /api/v1/boards/:id/export` - Export board as JSON
  - Includes: board, lists, cards, labels, checklists, comments, metadata
  - Excludes: attachments (references only), user passwords, tokens
- `GET /api/v1/boards/:id/export/csv` - Export board as CSV
  - Query params: `columns` (comma-separated list of columns to include)
  - Returns: CSV file download

### Admin
- `GET /api/v1/admin/config` - Get admin configuration
- `PUT /api/v1/admin/config` - Update admin configuration
  - Only App Admin/Admin/Custom roles with granular permissions can modify
  - Configuration changes logged in audit trail
  - Sensitive data (OAuth secrets, MySQL passwords) encrypted
  - Request body: { authMethods?, googleOAuth?, externalMySQL?, defaultAuthMethod?, loginScreenBranding?, rateLimiting? }
- `GET /api/v1/admin/users` - List all users
- `PUT /api/v1/admin/users/:id` - Update user
- `DELETE /api/v1/admin/users/:id` - Delete user
- `POST /api/v1/admin/users/:id/unlock` - Unlock locked user account

## 7. Real-Time Events (Socket.io)

### Client → Server Events
- `join:board` - Join a board room
- `leave:board` - Leave a board room
- `card:move` - Move a card
- `card:update` - Update card properties
- `card:create` - Create new card
- `card:delete` - Delete card
- `list:create` - Create new list
- `list:update` - Update list
- `list:delete` - Delete list
- `list:reorder` - Reorder lists
- `comment:add` - Add comment
- `comment:typing` - User is typing comment
- `presence:update` - Update user presence
- `label:assign` - Assign label to card
- `label:remove` - Remove label from card
- `reminder:dismiss` - Dismiss reminder notification
- `card:duplicate` - Duplicate card
- `workspace:archive` - Archive workspace
- `workspace:restore` - Restore workspace

### Server → Client Events
- `board:updated` - Board settings changed
- `card:created` - New card created
- `card:updated` - Card updated
- `card:moved` - Card moved to different list
- `card:deleted` - Card deleted
- `list:created` - New list created
- `list:updated` - List updated
- `list:deleted` - List deleted
- `list:reordered` - Lists reordered
- `comment:added` - New comment added
- `comment:updated` - Comment updated
- `comment:deleted` - Comment deleted
- `label:created` - Label created
- `label:updated` - Label updated
- `label:deleted` - Label deleted
- `label:assigned` - Label assigned to card
- `label:removed` - Label removed from card
- `checklist:item:created` - Checklist item created
- `checklist:item:updated` - Checklist item updated
- `checklist:item:deleted` - Checklist item deleted
- `checklist:item:completed` - Checklist item completed
- `reminder:created` - Reminder created
- `reminder:updated` - Reminder updated
- `reminder:deleted` - Reminder deleted
- `reminder:triggered` - Reminder triggered (notification sent)
- `import:progress` - Import progress update (batch updates every 10 items)
- `import:completed` - Import completed
- `import:error` - Import error occurred
- `invite:created` - Invite link created
- `invite:accepted` - Invite accepted
- `invite:revoked` - Invite revoked
- `notification:new` - New notification received
- `notification:read` - Notification marked as read
- `notification:deleted` - Notification deleted
- `card:duplicated` - Card duplicated
- `workspace:archived` - Workspace archived
- `workspace:restored` - Workspace restored
- `user:joined` - User joined board
- `user:left` - User left board
- `user:typing` - User is typing
- `error` - Error occurred

## 8. Security Requirements

### Authentication Security
- Password hashing using Bun.password.hash() with Argon2id (built-in, minimum 10 rounds)
- Password complexity requirements:
  - Minimum 12 characters
  - Mixed case (uppercase and lowercase)
  - At least one number
  - At least one special character
- JWT tokens with expiration
- Secure session management
- Session fixation protection (regenerate session ID on login)
- CSRF protection
- Rate limiting on authentication endpoints:
  - Auth endpoints: 900 attempts per 1 minute (admin configurable)
  - File uploads: 10 uploads per 1 minute per user (admin configurable)
  - General API: 1000 requests per 1 minute per user (admin configurable)
  - Rate limit scope: Both per user and per IP
  - Use express-rate-limit with Redis store
- Account lockout after failed attempts:
  - Failed attempts threshold: 3 attempts
  - Lockout duration: Permanent until admin unlock
  - Lockout scope: Both per account and per IP
  - No exponential backoff
  - Unlock mechanism: Admin unlock only

### Authorization
- Role-based access control (RBAC)
- Permission checks on all API endpoints
- Board/workspace membership verification
- Resource ownership validation

### Data Security
- Input validation and sanitization
- SQL injection prevention (for external MySQL)
- XSS prevention
- File upload validation and scanning:
  - Malware scanning: Yes (using Pompelmi library)
  - File size limit: 1000 MB per file
  - No file type restrictions
  - Progress tracking: Yes
  - Resumable uploads: Yes (using resumable.js with MinIO TUS protocol)
- Secure file storage:
  - Use MinIO for object storage (S3-compatible)
  - Local MinIO storage by default
  - Optional S3 server configuration for cloud storage
  - Serving strategy: Direct serve with authentication verification (except branding folder which is public)
  - Default buckets: import-inline, card-attachments, branding (public), fonts
  - Access key management: Both environment variables and config file
- Environment variable protection
- Secrets management
- Data encryption at rest:
  - Encrypt sensitive data in MongoDB using field-level encryption
  - Encrypt backup files and database dumps
  - Use MongoDB encryption at rest for production deployments
- Security event logging:
  - Log all failed authentication attempts
  - Log suspicious activities (multiple failed logins, unusual access patterns)
  - Log all sensitive operations (user deletions, permission changes, data exports)
  - Implement log retention policy (minimum 90 days, recommended 1 year)
  - Store security logs separately from application logs
- Audit trails (Required for MVP):
  - Track all user actions on sensitive resources (boards, workspaces, user management)
  - Maintain immutable audit logs for compliance
  - Include timestamp, user ID, IP address, action type, and resource affected
  - Enable audit log review and export functionality
  - Minimum features: User A added user B to board, changed permissions role, User A used invite link to join the board as {viewer} permissions role

### Network Security
- HTTPS in production
- CORS configuration (restrictive origins)
- Secure headers (Helmet.js) with explicit configuration:
  - Content Security Policy (CSP) with strict directives
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
  - Strict-Transport-Security (HSTS) for HTTPS
- Secure cookie configuration:
  - httpOnly flag (prevent JavaScript access)
  - secure flag (HTTPS only in production)
  - sameSite=strict (CSRF protection)
- Socket.io authentication
- WebSocket security (enhanced performance with Bun runtime)
- Dependency vulnerability scanning (bun audit, Snyk)
- Security testing procedures:
  - Regular penetration testing (quarterly recommended)
  - Automated security scanning in CI/CD pipeline
  - OWASP ZAP integration for vulnerability scanning
  - Regular dependency updates and security patches

## 9. Performance Requirements

### Response Times
- Initial page load: < 2 seconds
- API response time: < 200ms (p95)
- Real-time update latency: < 100ms
- Database query optimization with indexes

### Bundle Size Targets
- Initial bundle: < 200KB gzipped
- Route chunks: < 50KB gzipped per route
- Total application bundle: < 1MB gzipped
- Individual component chunks: < 30KB gzipped
- Monitor bundle size in CI/CD pipeline with automated alerts

### Scalability
- Support for 1000+ concurrent users per board
- Horizontal scaling capability
- Database connection pooling:
  - MongoDB connection pool size: 10-50 connections per instance
  - Connection timeout: 30 seconds
  - Idle connection timeout: 5 minutes
  - Monitor connection pool usage and adjust based on load
- Caching strategy:
  - Use Redis for session storage (required)
  - Use Redis for caching (required)
  - Redis connection pooling: Pool size 5
  - Redis persistence: Both RDB and AOF
  - Event-based cache invalidation
  - CDN for static assets (optional, configurable)

### Optimization
- Code splitting and lazy loading for faster initial load:
  - Route-based code splitting with React.lazy
  - Component-level splitting for heavy components
  - Dynamic imports for non-critical features
- Client-side caching with Dexie.js for instant data access
- Image optimization and lazy loading:
  - Use modern image formats (WebP, AVIF) with fallbacks
  - Implement lazy loading for images below the fold
  - Responsive images with srcset
- Database indexing strategy:
  - Index frequently queried fields
  - Compound indexes for complex queries
  - Regular index performance monitoring
- Query optimization:
  - Select only required fields
  - Use pagination for large datasets
  - Implement query result caching where appropriate
- Bundle size optimization and tree-shaking:
  - Use `bun build --analyze` for bundle analysis (built-in)
  - Monitor bundle size in CI/CD pipeline
  - Remove unused dependencies
  - Use production builds with minification (via Bun bundler)
- API response caching:
  - HTTP caching headers (Cache-Control, ETag)
  - Client-side cache with Dexie.js
  - Cache invalidation strategy

### Mobile Optimization
- Touch-optimized drag-and-drop:
  - Use the **custom delegated pointer** Kanban pipeline with appropriate `touch-action` and drag previews as implemented under `src/client/components/board/`
  - Implement touch gesture support
  - Minimum 44x44px touch targets for all interactive elements
- Virtual scrolling for large lists:
  - Use react-virtuoso for performance with large datasets
  - Implement infinite scrolling where appropriate
- Mobile-first responsive design:
  - Use Tailwind CSS breakpoints (sm, md, lg, xl)
  - Test on various device sizes (320px to 4K)
  - Ensure readable font sizes (minimum 16px for body text)
- Touch-friendly UI elements:
  - Swipe gestures for card actions on mobile
  - Bottom sheet modals for mobile devices
  - Pull-to-refresh functionality
  - Touch-optimized button sizes and spacing
- Viewport configuration:
  - Proper viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
  - Prevent zoom on input focus (iOS): `user-scalable=no` (use sparingly)
- PWA support (Required for MVP):
  - Basic PWA: Web App Manifest (manifest.json), Service worker for offline caching
  - Advanced PWA features: Offline sync, push notifications, install prompt
  - App icons for various device sizes
  - Install prompt for supported browsers
- Mobile performance:
  - Optimize images for mobile (smaller sizes, WebP format)
  - Reduce initial bundle size for mobile networks
  - Implement progressive loading
  - Use intersection observer for lazy loading
- Offline functionality:
  - Service worker caching strategy:
    - Cache static assets (HTML, CSS, JS) with cache-first strategy
    - Cache API responses with network-first strategy and fallback
    - Implement cache versioning for updates
  - Offline data sync with Dexie.js:
    - Queue offline actions when network is unavailable
    - Sync queued actions when connection is restored
    - Implement conflict resolution for simultaneous offline edits
    - Show offline indicator to users
  - Offline-first approach for board data:
    - Load board data from Dexie.js cache immediately
    - Sync with server in background
    - Handle merge conflicts gracefully

## 10. Development Setup

### Local Development Mode
- Built-in hot module replacement (HMR) via Bun
- Built-in watch mode and hot reloading
- Source maps for debugging
- Built-in environment variable management (.env files) via Bun
- MongoDB local instance or Docker container
- Redis local instance or Docker container (required)
- MinIO local instance or Docker container (required)
- Development logging
- Error handling and reporting

### Background Jobs & Worker Process
- **Separate Bun worker process** for background jobs
- **Cron job configuration** for scheduled tasks:
  - Activity log cleanup: Weekly (respects per-workspace retention periods)
  - Import job cleanup: Daily (auto-delete after 2 days)
  - Reminder delivery check: Every 15 minutes
  - Notification cleanup: Weekly (auto-delete after 10 days)
  - Orphaned card attachments cleanup: Daily (from imports/cards)
- **Job implementation**:
  - No database tracking (direct scheduling)
  - Retry logic: Yes (max 3 retries)
  - Failed job handling: Both notify admin and log
  - No job queue system (direct Bun native scheduling)
- Worker process monitoring and health checks

### Docker Configuration
- Multi-stage Dockerfile for optimized builds
- Docker Compose for local development:
  - MongoDB container
  - Redis container (required)
  - MinIO container (required)
  - Application container
- Production Docker configuration
- Volume mounts for development
- Environment variable injection
- Redis persistence configuration (RDB + AOF)
- MinIO bucket initialization (import-inline, card-attachments, branding, fonts)

### Project Structure
```
/
├── src/
│   ├── server/           # Server-side code
│   │   ├── controllers/  # Route controllers
│   │   ├── models/       # Mongoose models
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── sockets/       # Socket.io handlers
│   │   ├── utils/        # Utility functions
│   │   └── config/       # Configuration
│   ├── client/           # Client-side code
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # React hooks
│   │   ├── store/        # State management (Dexie.js)
│   │   ├── utils/        # Client utilities
│   │   └── styles/       # CSS/Tailwind styles
│   └── shared/           # Shared types/utilities
│       └── types/        # TypeScript types
├── public/               # Static assets
├── docker/               # Docker configurations
├── scripts/              # Build/deployment scripts
├── tests/                # Test files
├── docs/                 # Documentation
├── .env.example          # Environment variable template
├── docker-compose.yml    # Docker Compose config
├── Dockerfile            # Production Dockerfile
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## 11. Testing Strategy

### Unit Tests
- Component testing (React Testing Library)
- Service/utility function testing using Bun test (built-in, Jest-compatible)
- Model validation testing using Bun test
- Aim for >80% code coverage

### Integration Tests
- API endpoint testing
- Database operations testing
- Authentication flow testing

### E2E Tests
- User workflows
- Real-time collaboration scenarios
- Import/export functionality

## 12. Deployment

### Docker Deployment
- Production-ready Docker images
- Docker Compose for multi-container setup
- Health checks
- Logging configuration
- Volume management for persistent data

### Environment Configuration
- Development environment
- Staging environment
- Production environment
- Environment-specific configurations

## 13. Future Enhancements (Out of Scope for MVP)

- Mobile applications (iOS/Android)
- Advanced analytics and reporting
- Time tracking
- Calendar integration (removed - not planned)
- Email integration (removed - email notifications not implemented)
- Third-party integrations (Slack, GitHub, etc.)
- Advanced search and filtering
- Custom fields on cards
- Two-factor authentication (2FA)
- Data backup and restore
- Guest access support (removed - not planned)

**Note**: Basic and advanced PWA features are in scope for MVP. Audit logs are required for MVP (security requirement).

## 14. Design Inspiration Notes

### From Atlantisboard
- Customizable branding and theming
- Clean, modern UI
- Flexible permission system
- Import capabilities from Trello/Wekan

### From Wekan
- Self-hosted focus
- Open-source community features
- Customizable boards and cards
- Real-time collaboration

### From Trello
- Intuitive drag-and-drop interface
- Card detail views
- Power-ups and integrations concept
- User-friendly design patterns

## 15. Success Criteria

### Functional Requirements
- ✅ All authentication methods working
- ✅ Workspace and board management functional
- ✅ Real-time collaboration working
- ✅ Import/export functionality complete
- ✅ Responsive design on all devices
- ✅ Admin configuration panel functional

### Non-Functional Requirements
- ✅ Application loads in < 2 seconds
- ✅ Real-time updates with < 100ms latency
- ✅ Supports 100+ concurrent users per board
- ✅ Secure authentication and authorization
- ✅ Docker deployment ready
- ✅ Comprehensive error handling

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-27  
**Status**: Draft - Ready for Review


