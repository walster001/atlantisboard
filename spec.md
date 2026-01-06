# AtlantisBoard - Application Specification

## Overview

AtlantisBoard is a self-hosted, highly customizable Kanban board application built with React, TypeScript, Express.js, and PostgreSQL. The application provides real-time collaboration features, extensive theming capabilities, role-based access control, and board import functionality from Trello and Wekan.

## Architecture

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite for build tooling
- React Router for navigation
- Tailwind CSS with shadcn/ui components
- @hello-pangea/dnd for drag-and-drop
- TanStack Query for data fetching
- WebSocket client for real-time updates

**Backend:**
- Express.js with TypeScript
- Prisma ORM for database access
- PostgreSQL database
- JWT authentication (access + refresh tokens)
- Passport.js for OAuth (Google)
- WebSocket server integrated into Express server
- Rate limiting middleware

### System Architecture

The application follows a client-server architecture with:
- **Single Express server** handling both HTTP API and WebSocket connections on the same port (default: 3000)
- **WebSocket path**: `/realtime` for real-time event subscriptions
- **API routes**: `/api/*` for REST endpoints
- **Frontend**: Single-page application (SPA) served via Vite dev server or static build

## Core Data Models

### User Management
- **User**: Core user account with email, password hash (optional for OAuth), provider info, email verification status
- **Profile**: Extended user information (full name, avatar URL, admin flag)
- **RefreshToken**: JWT refresh tokens for session management

### Workspace & Board Hierarchy
- **Workspace**: Top-level container owned by a user, contains multiple boards
- **Board**: Kanban board belonging to a workspace, has theme, background, description
- **Column**: List/column within a board, has position, title, optional color
- **Card**: Task/item within a column, has title, description, position, due date, color, priority

### Board Membership & Permissions
- **BoardMember**: User membership in a board with role (admin, manager, viewer)
- **CustomRole**: Custom role definitions with granular permissions
- **RolePermission**: Permission keys assigned to custom roles (e.g., 'board.edit', 'board.members.add')
- **BoardMemberCustomRole**: Assignment of custom roles to board members
- **BoardMemberAuditLog**: Audit trail for role changes and member actions

### Board Content
- **Label**: Board-level labels with name and color
- **CardLabel**: Many-to-many relationship between cards and labels
- **CardAssignee**: User assignments to cards
- **CardSubtask**: Checklist items within cards (with completion tracking)
- **CardAttachment**: File attachments on cards

### Theming & Customization
- **BoardTheme**: Complete theme definition with colors for navbar, columns, cards, scrollbars, card windows
- **AppSettings**: Global application settings (custom logos, app name, tagline, login styling, audit log retention)
- **CustomFont**: Custom font definitions for branding

### Invitations
- **BoardInviteToken**: Invite links for board access (one-time or reusable, with expiration, role assignment)

### Import System
- **ImportPendingAssignee**: Temporary storage for assignees that need user mapping during board import
- **ImportPendingAttachment**: Temporary storage for attachments that need resolution during board import

### External Integration
- **MysqlConfig**: Encrypted MySQL database configuration for external user verification (Google OAuth with database verification mode)

## Authentication & Authorization

### Authentication Methods

1. **Email/Password**: Traditional sign-up and sign-in with password hashing
2. **Google OAuth**: OAuth 2.0 flow via Passport.js
3. **Google OAuth + External Verification**: Google OAuth with additional verification against external MySQL database

### Login Styles (AppSettings.loginStyle)
- `google_only`: Only Google OAuth available
- `email_only`: Only email/password available
- `google_verified`: Google OAuth with external database verification

### Authorization Levels

1. **App Admin** (`Profile.isAdmin`): Full system access, can access admin configuration panel
2. **Board Admin**: Full control over a specific board
3. **Board Manager**: Can edit board content, manage members (but not change admin roles)
4. **Board Viewer**: Read-only access to board

### Permission System

The application uses a granular permission system with permission keys like:
- `app.admin.access`: Access admin panel
- `board.edit`: Edit board content (cards, columns)
- `board.members.add`: Add members to board
- `board.members.role.change`: Change member roles
- `board.settings.edit`: Edit board settings

Permissions are checked:
- **Client-side**: For UI element visibility (UX only, not security)
- **Server-side**: Via RLS policies and route middleware (actual security)

## Key Features

### Real-Time Collaboration

The application provides real-time synchronization via WebSocket connections:

1. **WebSocket Connection**: Established on `/realtime` path after authentication
2. **Subscription Model**: Clients subscribe to workspace-level changes (which includes all boards, columns, cards, members)
3. **Event Broadcasting**: Server broadcasts database changes (INSERT, UPDATE, DELETE) to all subscribed clients
4. **Optimistic Updates**: Client applies local changes immediately, then reconciles with server state via timestamps
5. **Conflict Resolution**: Timestamp-based conflict resolution (newer timestamp wins)
6. **Event Batching**: Multiple rapid updates are batched together to prevent UI flicker

**Real-time Events Handled:**
- Board updates (name, description, background, theme)
- Column changes (create, update, delete, reorder)
- Card changes (create, update, delete, move between columns)
- Card details (attachments, subtasks, assignees, labels)
- Member changes (add, remove, role changes)
- Permission changes (custom roles, role assignments)

### Board Management

**Board Creation:**
- Created within a workspace
- Can assign a theme at creation
- Can set background color or image URL
- Position determines display order

**Board Settings:**
- Edit name, description
- Change background (color or image)
- Apply themes
- Manage labels
- View/edit members
- View audit logs
- Configure audit log retention

**Board Themes:**
- Customizable colors for all UI elements
- Navbar color, column color, card colors, scrollbar colors
- Card window (detail modal) colors
- Intelligent contrast mode for card windows
- Default themes can be created and reused

### Card Management

**Card Features:**
- Title and rich text description (Markdown support)
- Due dates
- Labels (multiple per card)
- Assignees (multiple users)
- Subtasks/checklists (with completion tracking)
- File attachments
- Custom colors
- Priority levels (none, low, medium, high)

**Card Operations:**
- Drag-and-drop between columns
- Reorder within columns
- Edit in detail modal
- Delete
- Batch color updates (apply color to all cards)

### Column Management

**Column Features:**
- Title (editable inline)
- Position (for horizontal ordering)
- Optional custom color
- Cards contained within

**Column Operations:**
- Create new columns
- Rename columns
- Delete columns (cascades to cards)
- Reorder columns (drag-and-drop)
- Batch color updates (apply color to all columns)

### Drag-and-Drop

- **Columns**: Horizontal reordering via drag-and-drop
- **Cards**: Drag between columns or reorder within columns
- **Mobile**: Touch-friendly drag with carousel interface
- **Desktop**: Mouse drag with space-bar + drag for board scrolling

### Board Import

**Supported Sources:**
- Trello (JSON export)
- Wekan (MongoDB export)

**Import Process:**
1. User uploads export file
2. Server parses and validates structure
3. Creates board, columns, cards with preserved structure
4. Handles labels, assignees, attachments
5. Creates pending records for assignees/attachments that need user mapping
6. User resolves pending items after import

**Import Features:**
- Preserves card positions and column order
- Imports labels with colors
- Handles card descriptions (Markdown)
- Imports attachments (with pending resolution)
- Maps assignees (creates pending records for unknown users)

### Invitation System

**Invite Token Types:**
- **One-time**: Single use, expires after first redemption
- **Reusable**: Can be used multiple times (with optional max uses and expiration)

**Invite Features:**
- Generate invite links with tokens
- Assign role when token is redeemed
- Assign custom role when token is redeemed
- Expiration dates
- Usage tracking

**Invite Flow:**
1. Board admin/manager generates invite link
2. Link shared with user (via `/invite/:token` route)
3. User clicks link (stored in sessionStorage if not logged in)
4. User signs in/signs up
5. Token automatically redeemed on home page
6. User added to board with assigned role

### Member Management

**Member Operations:**
- Add members via email
- Remove members
- Change roles (admin, manager, viewer)
- Assign custom roles
- View member list with avatars
- Audit log of member changes

**Role Hierarchy:**
- Admin: Full control
- Manager: Can edit content and manage members (but not change admin roles)
- Viewer: Read-only

### Custom Roles & Permissions

**Custom Role System:**
- Create custom roles with descriptive names
- Assign granular permissions via permission keys
- Assign custom roles to board members
- Permissions checked server-side for security

**Permission Keys:**
- Dot-notation format (e.g., 'board.edit', 'board.members.add')
- Validated in application layer
- Stored as strings in database

### Theming & Branding

**App-Level Branding (Admin Settings):**
- Custom login logo (with size options)
- Custom home logo (with size options)
- Custom board logo (with size options)
- Custom app name (with font, size, color)
- Custom tagline (with font, size, color)
- Custom login background (color or image)
- Custom login box colors
- Custom Google button colors

**Board-Level Theming:**
- Board themes with comprehensive color customization
- Navbar colors
- Column colors
- Card colors (default and per-card)
- Scrollbar colors
- Card window (detail modal) colors
- Intelligent contrast mode

**Custom Fonts:**
- Upload custom fonts
- Apply to app name and tagline

### File Storage

**Attachment System:**
- Upload files to cards
- File metadata stored (name, type, size, URL)
- Files stored via storage service
- Attachment deletion cascades when card is deleted

### Audit Logging

**Board Member Audit Log:**
- Tracks all member role changes
- Records actor (who made the change)
- Records target (who was changed)
- Records old and new roles
- Configurable retention period (per board or global)

## User Interface

### Pages

1. **Home Page** (`/`):
   - Lists all workspaces and boards user has access to
   - Create new workspaces and boards
   - Edit/delete workspaces and boards
   - Board import dialog
   - Real-time updates when boards/workspaces change

2. **Auth Page** (`/auth`):
   - Sign in with email/password
   - Sign up with email/password
   - Sign in with Google OAuth
   - Handles OAuth callbacks
   - Shows verification errors for external database verification

3. **Board Page** (`/board/:boardId`):
   - Main Kanban board interface
   - Columns displayed horizontally (desktop/tablet) or in carousel (mobile)
   - Cards within columns
   - Drag-and-drop interface
   - Board header with name, settings, member management
   - Card detail modal
   - Board settings modal

4. **Admin Config Page** (`/admin/config`):
   - Configuration tab: General, Login Options, Permissions, Integrations
   - Customisation tab: Login Branding, App Branding, Custom Fonts, Templates
   - Only accessible to app admins

5. **Invite Page** (`/invite/:token`):
   - Displays invite information
   - Redirects to sign-in if not authenticated
   - Automatically redeems token after authentication

6. **NotFound Page** (`/*`):
   - 404 error page

### Responsive Design

**Mobile (< 768px):**
- Column carousel with swipe navigation
- Simplified header with overflow menu
- Touch-optimized drag-and-drop
- Bottom sheet dialogs for actions

**Tablet (768px - 1024px):**
- Horizontal scroll layout
- Full header with all actions
- Touch and mouse support

**Desktop (> 1024px):**
- Full horizontal layout
- All features visible
- Space-bar + drag for board scrolling
- Keyboard shortcuts support

### Components

**Kanban Components:**
- `KanbanColumn`: Individual column with cards
- `KanbanCard`: Individual card component
- `MobileColumnCarousel`: Mobile swipe interface
- `CardDetailModal`: Full card editing interface
- `BoardSettingsModal`: Board configuration dialog

**UI Components (shadcn/ui):**
- Buttons, inputs, dialogs, dropdowns, toasts, etc.
- Fully customizable via Tailwind CSS

**Admin Components:**
- `BrandingSettings`: Login page branding
- `AppBrandingSettings`: App-wide branding
- `CustomFontsSettings`: Font management
- `LoginOptionsSettings`: Authentication configuration
- `PermissionsSettings`: Permission management

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/signup`: Create new account
- `POST /api/auth/signin`: Sign in with email/password
- `POST /api/auth/refresh`: Refresh access token
- `POST /api/auth/signout`: Sign out
- `GET /api/auth/google`: Initiate Google OAuth
- `GET /api/auth/google/callback`: Google OAuth callback
- `GET /api/auth/me`: Get current user info
- `POST /api/auth/verify-email`: Verify email against external database

### Workspaces (`/api/workspaces`)
- `GET /api/workspaces`: List user's workspaces
- `POST /api/workspaces`: Create workspace
- `PATCH /api/workspaces/:id`: Update workspace
- `DELETE /api/workspaces/:id`: Delete workspace

### Boards (`/api/boards`)
- `GET /api/boards/:id`: Get board details
- `POST /api/boards`: Create board
- `PATCH /api/boards/:id`: Update board
- `DELETE /api/boards/:id`: Delete board
- `POST /api/boards/import`: Import board from Trello/Wekan

### Columns (`/api/columns`)
- `POST /api/columns`: Create column
- `PATCH /api/columns/:id`: Update column
- `DELETE /api/columns/:id`: Delete column

### Cards (`/api/cards`)
- `POST /api/cards`: Create card
- `PATCH /api/cards/:id`: Update card
- `DELETE /api/cards/:id`: Delete card

### Labels (`/api/labels`)
- `POST /api/labels`: Create label
- `PATCH /api/labels/:id`: Update label
- `DELETE /api/labels/:id`: Delete label
- `POST /api/labels/:id/assign`: Assign label to card
- `DELETE /api/labels/:id/assign/:cardId`: Remove label from card

### Subtasks (`/api/subtasks`)
- `POST /api/subtasks`: Create subtask
- `PATCH /api/subtasks/:id`: Update subtask
- `DELETE /api/subtasks/:id`: Delete subtask

### Members (`/api/members`)
- `GET /api/members/board/:boardId`: Get board members
- `POST /api/members/board/:boardId`: Add member to board
- `PATCH /api/members/board/:boardId/user/:userId`: Update member role
- `DELETE /api/members/board/:boardId/user/:userId`: Remove member

### Invites (`/api/invites`)
- `POST /api/invites`: Generate invite token
- `POST /api/invites/:token/redeem`: Redeem invite token
- `GET /api/invites/:token`: Get invite token info

### Storage (`/api/storage`)
- `POST /api/storage/:bucket/upload`: Upload file
- `DELETE /api/storage/:bucket/:path`: Delete file

### App Settings (`/api/app-settings`)
- `GET /api/app-settings`: Get app settings
- `PATCH /api/app-settings`: Update app settings

### Admin (`/api/admin`)
- Admin-only endpoints for system management

### RPC Functions (`/api/rpc`)
- `getHomeData`: Get all workspaces and boards for home page
- `get_board_data`: Get complete board data (columns, cards, labels, members)
- `get_board_member_profiles`: Get board members with profiles
- `update_card`: Update card with realtime broadcasting
- `batch_update_card_positions`: Batch update card positions
- `batch_update_column_positions`: Batch update column positions
- `batch_update_card_colors`: Batch update card colors
- `batch_update_column_colors`: Batch update column colors
- `redeem-invite-token`: Redeem invite token (function)
- `verify-user-email`: Verify user email against external database

### Database Routes (`/api/db/:table`)
- Generic CRUD operations for database tables
- Used for permissions tables (custom_roles, role_permissions, etc.)
- Emits realtime events for permission changes

## Real-Time System

### WebSocket Architecture

**Connection:**
- WebSocket server integrated into Express server
- Path: `/realtime`
- Authentication via JWT token in query string or Authorization header
- Connection persists for session duration

**Subscription Model:**
- Clients subscribe to workspace-level changes
- Workspace subscription includes all boards, columns, cards, members in that workspace
- Subscription registry manages active subscriptions
- Handles reconnection and subscription restoration

**Event Broadcasting:**
- Server broadcasts database changes (INSERT, UPDATE, DELETE) to all subscribed clients
- Events include table name, event type, new data, old data
- Events filtered by workspace membership

**Client-Side Handling:**
- Event batching to prevent UI flicker
- Optimistic updates with timestamp-based conflict resolution
- Echo suppression (ignore events from own actions)
- Buffering for out-of-order events

### Event Types

**Board Events:**
- Board name, description, background changes
- Theme assignment

**Column Events:**
- Column create, update, delete
- Column reorder (position changes)
- Column color changes

**Card Events:**
- Card create, update, delete
- Card move (column change)
- Card reorder (position change)
- Card color changes

**Card Detail Events:**
- Attachment create, update, delete
- Subtask create, update, delete
- Assignee add, remove
- Label assignment changes

**Member Events:**
- Member add, remove
- Role changes
- Custom role assignments

**Permission Events:**
- Custom role create, update, delete
- Permission assignment changes
- Board member custom role assignments

## Security

### Authentication Security
- JWT tokens with expiration
- Refresh token rotation
- Password hashing (bcrypt)
- OAuth 2.0 with PKCE
- Session timeout handling

### Authorization Security
- Row-Level Security (RLS) policies in database
- Route-level middleware checks
- Permission system with granular controls
- Server-side validation of all operations

### Data Security
- SQL injection prevention via Prisma ORM
- XSS prevention via input sanitization
- CORS configuration
- Rate limiting on API endpoints
- Helmet.js security headers

### File Upload Security
- File type validation
- File size limits
- Secure file storage
- Access control on file retrieval

## Performance Optimizations

### Frontend
- Code splitting with lazy loading
- React Query for caching and background updates
- Optimistic updates for instant UI feedback
- Debounced realtime updates
- Event batching to prevent excessive re-renders
- Memoization of expensive computations

### Backend
- Database indexing on foreign keys and frequently queried fields
- Batch operations for bulk updates
- Efficient RPC functions for complex queries
- Connection pooling
- Rate limiting to prevent abuse

### Real-Time
- Event batching for rapid changes
- Subscription registry to prevent duplicate subscriptions
- Efficient event filtering
- Connection reuse

## Error Handling

### Client-Side
- User-friendly error messages
- Toast notifications for errors
- Graceful degradation
- Retry logic for failed requests
- Error boundaries for React components

### Server-Side
- Structured error responses
- Error logging
- Validation error details
- Rate limit error handling
- Authentication error handling

## Configuration

### Environment Variables

**Backend:**
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for access tokens
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `API_PORT`: Server port (default: 3000)
- `CORS_ORIGIN`: Allowed CORS origin
- `NODE_ENV`: Environment (development/production)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window

**Frontend:**
- `VITE_API_URL`: Backend API URL

## Deployment

### Development
- Vite dev server for frontend (hot reload)
- Express dev server for backend (with TypeScript compilation)
- Separate processes, can run concurrently

### Production
- Frontend: Vite build to static files, served via Nginx
- Backend: Express server (Node.js)
- Database: PostgreSQL
- WebSocket: Integrated into Express server
- Docker support available

### Docker
- Frontend Dockerfile for static build
- Backend Dockerfile for Node.js server
- Docker Compose for full stack
- Nginx configuration for reverse proxy

## Planned Features

- CSV/TSV import
- Two-factor authentication (2FA)
- Enhanced sidebar with board settings, theming, member list
- Additional authentication providers
- Granular permission control in admin panel
- Mobile apps / Local storage / PWA support
- Standalone packaged app

## In Progress

- Database rate-limiting implementation
- Strict database/file handling security policies
- Session timeout for all logins

## Known Limitations

- WebSocket server cannot scale independently (integrated into Express)
- Real-time events may arrive out of order (handled via buffering)
- Large board imports may timeout (50MB limit configured)
- File storage implementation may vary by deployment

