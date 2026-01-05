# AtlantisBoard Directory Map

This document provides a comprehensive reference of the codebase structure, detailing what each directory and key file does. This is intended for AI agents and developers to quickly understand the project organization.

---

## 📁 Project Structure Overview

```
atlantisboard/
├── src/                    # Frontend application (React + Vite)
├── backend/                # Backend API server (Express + TypeScript)
├── public/                 # Static assets served to frontend
├── scripts/                # Development automation scripts
├── docker/                 # Docker configurations
├── docs/                   # Project documentation
├── .cursor/                # Cursor IDE configuration and rules
└── [config files]         # Root-level configuration files
```

---

## 🎨 FRONTEND (`src/`)

The frontend is a React application built with Vite, TypeScript, and Tailwind CSS. It uses React Router for routing and TanStack Query for data fetching.

### Entry Points

- **`src/main.tsx`** - Application entry point. Renders the root React component.
- **`src/App.tsx`** - Root component. Sets up providers (QueryClient, Auth, AppSettings), routing, and lazy-loaded page components.
- **`src/index.css`** - Global CSS styles and Tailwind CSS imports.
- **`src/App.css`** - Additional application-specific styles.

### Pages (`src/pages/`)

Route components that represent different views in the application:

- **`Home.tsx`** - Main dashboard/home page showing workspaces and boards
- **`BoardPage.tsx`** - Kanban board view with columns, cards, and drag-and-drop functionality
- **`Auth.tsx`** - Authentication page (login/signup) with OAuth support
- **`AdminConfig.tsx`** - Admin configuration panel for app settings
- **`InvitePage.tsx`** - Invite redemption page for board invitations
- **`Index.tsx`** - Index/landing page (if different from Home)
- **`NotFound.tsx`** - 404 error page component

### Components (`src/components/`)

#### UI Components (`src/components/ui/`)

shadcn/ui component library (50+ files). These are reusable, accessible UI primitives built on Radix UI:

- **Form components**: `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `slider.tsx`
- **Layout components**: `card.tsx`, `sheet.tsx`, `dialog.tsx`, `drawer.tsx`, `sidebar.tsx`, `accordion.tsx`, `tabs.tsx`, `separator.tsx`
- **Navigation**: `breadcrumb.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`
- **Feedback**: `toast.tsx`, `toaster.tsx`, `sonner.tsx`, `alert.tsx`, `alert-dialog.tsx`, `progress.tsx`
- **Overlays**: `popover.tsx`, `hover-card.tsx`, `tooltip.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`
- **Data display**: `table.tsx`, `chart.tsx`, `avatar.tsx`, `badge.tsx`, `skeleton.tsx`
- **Utilities**: `use-toast.ts` (toast hook), `form.tsx` (form wrapper with validation)

#### Kanban Components (`src/components/kanban/`)

Kanban board-specific components (22 files):

- **`kanban-card.tsx`** - Individual card component with drag-and-drop
- **`kanban-column.tsx`** - Column component containing cards
- **`card-detail-modal.tsx`** - Full card detail view modal
- **`card-edit-dialog.tsx`** - Card editing dialog/form
- **`card-attachment-section.tsx`** - File attachments UI for cards
- **`card-subtask-section.tsx`** - Subtasks/checklist UI for cards
- **`board-settings-modal.tsx`** - Board configuration and settings
- **`board-members-dialog.tsx`** - Board member management
- **`board-member-audit-log.tsx`** - Audit log viewer for board member actions
- **`board-labels-settings.tsx`** - Label management and configuration
- **`board-background-settings.tsx`** - Board background/image settings
- **`theme-settings.tsx`** - Theme customization UI
- **`theme-editor-modal.tsx`** - Advanced theme editor
- **`theme-color-input.tsx`** - Color picker input component
- **`color-picker.tsx`** - Color selection component
- **`markdown-renderer.tsx`** - Markdown content renderer
- **`toast-ui-markdown-editor.tsx`** - Markdown editor component
- **`inline-button-editor.tsx`** - Inline button configuration editor
- **`invite-link-button.tsx`** - Board invite link generator/button
- **`mobile-column-carousel.tsx`** - Mobile-optimized column navigation
- **`pull-to-refresh-indicator.tsx`** - Pull-to-refresh UI for mobile
- **`emojiData.ts`** - Emoji data/utilities

#### Admin Components (`src/components/admin/`)

Administration panel components (15 files):

- **`app-branding-settings.tsx`** - App-wide branding configuration
- **`branding-settings.tsx`** - Branding settings component
- **`custom-fonts-settings.tsx`** - Custom font configuration
- **`login-options-settings.tsx`** - Authentication method settings
- **`permissions/`** - Permission management system:
  - **`permissions-settings.tsx`** - Main permissions configuration UI
  - **`roles-list.tsx`** - List of custom roles
  - **`create-role-dialog.tsx`** - Dialog for creating new roles
  - **`delete-role-dialog.tsx`** - Role deletion confirmation
  - **`role-detail-view.tsx`** - Detailed role view and editing
  - **`categories-list.tsx`** - Permission categories display
  - **`toggle-slider.tsx`** - Permission toggle UI component
  - **`app-admin-user-list.tsx`** - App admin user management
  - **`types.ts`** - Permission-related TypeScript types
  - **`usePermissionsData.ts`** - Hook for permissions data fetching
  - **`index.ts`** - Barrel export file

#### Import Components (`src/components/import/`)

Board import functionality (3 files):

- **`board-import-dialog.tsx`** - Main import dialog for Trello/Wekan boards
- **`inline-button-icon-dialog.tsx`** - Icon selection for imported buttons
- **`types.ts`** - Import-related TypeScript types

#### Navigation (`src/components/`)

- **`nav-link.tsx`** - Navigation link component with active state

### Hooks (`src/hooks/`)

Custom React hooks for shared logic (11 files):

- **`useAuth.tsx`** - Authentication state and methods (login, logout, session)
- **`useAppSettings.tsx`** - Application settings context and provider
- **`usePermissions.ts`** - Permission checking hook for board operations
- **`usePermissionsRealtime.ts`** - Real-time permission updates via WebSocket
- **`useBatchedStateUpdate.ts`** - Batched state updates for performance
- **`useDebouncedFetch.ts`** - Debounced API fetching hook
- **`useDragScroll.ts`** - Drag-to-scroll functionality hook
- **`usePullToRefresh.ts`** - Pull-to-refresh gesture hook for mobile
- **`useResponsiveLayout.ts`** - Responsive layout utilities
- **`useStableRealtimeHandlers.ts`** - Stable WebSocket event handlers
- **`use-mobile.tsx`** - Mobile device detection hook
- **`use-toast.ts`** - Toast notification hook (re-exported from UI)

### Integrations (`src/integrations/`)

External service integrations:

- **`api/client.ts`** - Main API client with query builder, auth, and realtime support
  - Provides `api.from(table)` for database queries
  - Handles authentication tokens and refresh
  - WebSocket realtime client integration
- **`api/realtime.ts`** - WebSocket realtime client setup and management

### Libraries (`src/lib/`)

Shared utility libraries (14 files):

- **`utils.ts`** - General utility functions (cn, class merging, etc.)
- **`errorHandler.ts`** - Error handling and formatting utilities
- **`storage.ts`** - LocalStorage/sessionStorage utilities
- **`timestampUtils.ts`** - Date/time formatting and manipulation
- **`twemojiUtils.ts`** - Twemoji emoji rendering utilities
- **`validators.ts`** - Form validation schemas (Zod)
- **`constants.ts`** - Application constants and configuration
- **`realtimeManager.ts`** - Real-time event management and batching
- **`permissions/`** - Permission system library:
  - **`index.ts`** - Main exports (hasPermission, createPermissionContext, etc.)
  - **`types.ts`** - Permission system TypeScript types
  - **`registry.ts`** - Permission definitions and role mappings
  - **`resolver.ts`** - Permission checking logic
  - **`testing.ts`** - Permission testing utilities
  - **`runTests.ts`** - Auto-run permission tests in development

### Realtime (`src/realtime/`)

WebSocket realtime functionality (7 files):

- **`realtimeClient.ts`** - WebSocket client implementation
- **`subscriptionRegistry.ts`** - Channel subscription management
- **`permissionsSubscriptions.ts`** - Permission-specific subscriptions
- **`workspaceSubscriptions.ts`** - Workspace event subscriptions
- **`workspaceEventRouter.ts`** - Event routing for workspace updates
- **`eventBatcher.ts`** - Event batching for performance
- **`logger.ts`** - Real-time event logging

### Types (`src/types/`)

TypeScript type definitions (3 files):

- **`api.ts`** - API request/response types
- **`browser.ts`** - Browser-specific types
- **`kanban.ts`** - Kanban board data types (Board, Column, Card, etc.)

### Configuration Files

- **`vite-env.d.ts`** - Vite environment type definitions

---

## ⚙️ BACKEND (`backend/`)

The backend is an Express.js API server built with TypeScript, using Prisma ORM for database access and WebSocket for real-time features.

### Entry Point

- **`backend/src/index.ts`** - Express server entry point
  - Sets up middleware (CORS, helmet, rate limiting, session)
  - Configures Passport.js for OAuth
  - Registers all API routes
  - Initializes WebSocket realtime server
  - Starts HTTP server on configured port

### Configuration (`backend/src/config/`)

- **`env.ts`** - Environment variable loading and validation
  - Database connection strings
  - JWT secrets
  - OAuth credentials
  - CORS origins
  - Rate limiting configuration

### Database (`backend/src/db/`)

- **`client.ts`** - Prisma client singleton instance
  - Exports configured Prisma client for database operations

### Middleware (`backend/src/middleware/`)

Express middleware functions (3 files):

- **`auth.ts`** - Authentication middleware
  - JWT token verification
  - User session validation
  - Extracts user from token and attaches to request
- **`errorHandler.ts`** - Global error handling middleware
  - Catches and formats errors
  - Returns appropriate HTTP status codes
  - Logs errors for debugging
- **`permissions.ts`** - Permission checking middleware
  - Validates user permissions for protected routes
  - Checks board/workspace access
  - Enforces role-based access control

### Routes (`backend/src/routes/`)

API route handlers (16 files). Each file exports an Express router:

- **`auth.ts`** - Authentication endpoints
  - POST `/api/auth/signin` - Email/password login
  - POST `/api/auth/signup` - User registration
  - POST `/api/auth/signout` - Logout
  - POST `/api/auth/refresh` - Token refresh
  - GET `/api/auth/me` - Get current user
  - GET `/api/auth/google` - Google OAuth initiation
  - GET `/api/auth/google/callback` - Google OAuth callback
- **`db.ts`** - Generic database query endpoint
  - GET `/api/db/:table` - Query table with filters
  - POST `/api/db/:table` - Insert records
  - PATCH `/api/db/:table` - Update records
  - DELETE `/api/db/:table` - Delete records
- **`workspaces.ts`** - Workspace management
  - CRUD operations for workspaces
  - Workspace member management
- **`boards.ts`** - Board management
  - CRUD operations for boards
  - Board settings and configuration
- **`columns.ts`** - Column management
  - CRUD operations for columns
  - Column reordering
- **`cards.ts`** - Card management
  - CRUD operations for cards
  - Card assignment and due dates
  - Card position updates
- **`labels.ts`** - Label management
  - CRUD operations for labels
  - Label color and name management
- **`subtasks.ts`** - Subtask/checklist management
  - CRUD operations for subtasks
  - Subtask completion tracking
- **`members.ts`** - Member management
  - Board and workspace member operations
  - Role assignment
- **`app-settings.ts`** - Application settings
  - App-wide configuration
  - Branding settings
  - Theme settings
- **`home.ts`** - Home page data
  - Dashboard data aggregation
  - User's boards and workspaces
- **`rpc.ts`** - Remote procedure calls
  - Database function calls
  - Custom business logic endpoints
- **`storage.ts`** - File storage operations
  - File upload/download
  - S3/MinIO integration
  - Presigned URL generation
- **`invites.ts`** - Invite management
  - Invite token generation
  - Invite redemption
  - Invite validation
- **`admin.ts`** - Admin-only endpoints
  - User management
  - System configuration
  - MySQL connection testing
- **`board-import.ts`** - Board import functionality
  - Trello board import
  - Wekan board import
  - Data transformation and validation

### Services (`backend/src/services/`)

Business logic layer (14 files). Services contain the core business logic, separate from route handlers:

- **`auth.service.ts`** - Authentication business logic
  - Password hashing/verification
  - JWT token generation
  - OAuth user creation
- **`jwt.service.ts`** - JWT token utilities
  - Token signing and verification
  - Token payload encoding/decoding
- **`password.service.ts`** - Password management
  - Hashing with bcrypt
  - Password validation
- **`board.service.ts`** - Board business logic
  - Board creation with default columns
  - Board permission checks
  - Board data aggregation
- **`card.service.ts`** - Card business logic
  - Card creation and updates
  - Card position calculations
  - Card assignment logic
- **`column.service.ts`** - Column business logic
  - Column reordering
  - Column position management
- **`workspace.service.ts`** - Workspace business logic
  - Workspace creation
  - Member management
  - Permission inheritance
- **`member.service.ts`** - Member management logic
  - Role assignment
  - Access control
  - Member validation
- **`label.service.ts`** - Label business logic
  - Label creation and updates
  - Label color validation
- **`subtask.service.ts`** - Subtask business logic
  - Subtask completion tracking
  - Progress calculation
- **`storage.service.ts`** - File storage logic
  - S3/MinIO operations
  - Presigned URL generation
  - File validation and processing
- **`board-import.service.ts`** - Board import logic
  - Trello format parsing
  - Wekan format parsing
  - Data transformation
  - Validation and error handling
- **`home.service.ts`** - Home page data aggregation
  - User dashboard data
  - Board and workspace summaries
- **`mysql-verification.service.ts`** - MySQL connection testing
  - Connection validation
  - Database compatibility checks

### Realtime (`backend/src/realtime/`)

WebSocket server for real-time updates (2 files):

- **`server.ts`** - WebSocket server implementation
  - WebSocket connection handling
  - Channel subscription management
  - Event broadcasting
  - Authentication for WebSocket connections
  - Database change event listening
- **`emitter.ts`** - Event emitter for database changes
  - Prisma middleware integration
  - Database event detection
  - Event formatting and routing

### Libraries (`backend/src/lib/`)

Shared backend utilities:

- **`typeGuards.ts`** - TypeScript type guard functions
- **`permissions/`** - Backend permission system:
  - **`registry.ts`** - Permission definitions (matches frontend)
  - **`service.ts`** - Server-side permission checking
  - **`types.ts`** - Permission types

### Types (`backend/src/types/`)

- **`prisma.ts`** - Prisma-generated types and utilities

### Database Schema (`backend/prisma/`)

- **`schema.prisma`** - Prisma schema definition
  - Database models (User, Board, Card, Column, etc.)
  - Relationships and constraints
  - Enums and indexes
- **`migrations/`** - Database migration files
  - Historical migration records
  - SQL migration scripts
- **`seed.ts`** - Database seeding script
  - Initial data population
  - Development test data

### Build Output (`backend/dist/`)

Compiled TypeScript output (JavaScript and type definitions). Generated by `npm run build`.

### Configuration Files

- **`package.json`** - Backend dependencies and scripts
- **`tsconfig.json`** - TypeScript configuration for backend
- **`eslint.config.js`** - ESLint configuration
- **`docker-compose.yml`** - Docker Compose for local development (PostgreSQL, MinIO)
- **`docker-compose.storage.yml`** - Storage service configuration
- **`Dockerfile`** - Production Docker image definition
- **`env.example.txt`** - Environment variable template

### Scripts (`backend/`)

Various utility scripts (`.sh` and `.mjs` files):

- Database setup and migration scripts
- User management scripts
- Development utilities
- Database verification scripts

---

## 📦 STATIC ASSETS (`public/`)

Files served directly to the browser:

- **`favicon.ico`** - Site favicon
- **`fonts/`** - Custom font files
  - **`inter-latin.woff2`** - Inter font file
  - **`inter.css`** - Font CSS definitions
- **`placeholder.svg`** - Placeholder image
- **`permissions-mockup.html`** - Permissions UI mockup/reference
- **`robots.txt`** - Search engine crawler instructions

---

## 🛠️ DEVELOPMENT SCRIPTS (`scripts/`)

Shell scripts for development automation:

- **`dev-start-backend.sh`** - Start all development services (Docker, backend API, frontend)
- **`dev-stop-backend.sh`** - Stop all development services
- **`dev-setup-backend.sh`** - Initial backend setup (Node.js, Docker, dependencies)
- **`dev-restart-backend.sh`** - Restart backend services
- **`check-prerequisites.sh`** - Check for required tools (Node.js, Docker, etc.)
- **`generate-jwt-secrets.sh`** - Generate JWT secret keys

---

## 🐳 DOCKER CONFIGURATION (`docker/`)

Docker and containerization files:

- **`docker-compose.frontend.yml`** - Frontend container configuration
- **`docker-compose.full.yml`** - Full stack container configuration
- **`frontend/`** - Frontend Docker files
  - **`Dockerfile`** - Frontend production image
  - **`nginx.conf.template`** - Nginx configuration template
  - **`nginx-ssl.conf.template`** - SSL-enabled Nginx configuration
  - **`nginx-custom.conf`** - Custom Nginx settings
- **`nginx/`** - Nginx configuration files
  - **`nginx.conf`** - Main Nginx configuration

---

## 📚 DOCUMENTATION (`docs/`)

Project documentation:

- **`README.md`** - Main documentation file
- **`wiki/`** - Detailed documentation (14 markdown files):
  - **`Getting-Started.md`** - Setup and installation guide
  - **`API-Overview.md`** - API documentation
  - **`Boards-and-Columns.md`** - Board and column concepts
  - **`Cards.md`** - Card functionality
  - **`Workspaces.md`** - Workspace management
  - **`Users-and-Roles.md`** - User and role system
  - **`Themes-and-Branding.md`** - Theming and customization
  - **`File-Management.md`** - File upload and storage
  - **`Board-Import.md`** - Importing boards from Trello/Wekan
  - **`Invites.md`** - Invitation system
  - **`Real-Time-Features.md`** - WebSocket realtime functionality
  - **`Notifications-and-Feedback.md`** - User notifications
  - **`Audit-Logs.md`** - Audit logging system
  - **`Best-Practices.md`** - Development best practices
  - **`Troubleshooting.md`** - Common issues and solutions

---

## ⚙️ CURSOR IDE CONFIGURATION (`.cursor/`)

Cursor IDE-specific configuration and rules:

- **`rules/`** - Coding rules and guidelines (18 `.mdc` files):
  - **`codequality.mdc`** - Code quality guidelines (always applied)
  - **`clean-code.mdc`** - Clean code principles
  - **`typescript.mdc`** - TypeScript best practices
  - **`react.mdc`** - React patterns and conventions
  - **`nextjs.mdc`** - Next.js best practices (for reference)
  - **`node-express.mdc`** - Node.js/Express best practices
  - **`tailwind.mdc`** - Tailwind CSS guidelines
  - **`database.mdc`** - Database/Prisma best practices
  - **`component-naming-and-directory-structure.mdc`** - Component organization
  - **`function-ordering-conventions.mdc`** - Function ordering rules
  - **`general-coding-principles.mdc`** - General coding principles
  - **`minimal-code-changes-rule.mdc`** - Minimal change guidelines
  - **`bug-handling-with-todo-comments.mdc`** - Bug documentation
  - **`persona---senior-full-stack-developer.mdc`** - Developer persona
  - **`typescript-skip-jsdoc.mdc`** - JSDoc guidelines
  - **`performance-optimization-rules.mdc`** - Performance guidelines
  - **`vite-build-optimization-rule.mdc`** - Vite build optimization
  - **`general-typescript-node-js-next-js-rules.mdc`** - General TypeScript/Node rules
- **`plans/`** - Cursor plan files (generated by Cursor)
- **`debug.log`** - Debug logging output

---

## 📄 ROOT-LEVEL CONFIGURATION FILES

### Build & Development

- **`package.json`** - Frontend dependencies and npm scripts
  - Scripts: `dev`, `build`, `build:dev`, `lint`, `preview`
  - Dependencies: React, Vite, Tailwind, shadcn/ui components, etc.
- **`vite.config.ts`** - Vite build configuration
  - Server configuration (port 8080, host 127.0.0.1)
  - React plugin setup
  - Path aliases (`@/` → `src/`)
  - Code splitting and chunking strategy
- **`tsconfig.json`** - TypeScript project references
  - References `tsconfig.app.json` and `tsconfig.node.json`
  - Path aliases configuration
- **`tsconfig.app.json`** - Frontend TypeScript configuration
- **`tsconfig.node.json`** - Node tooling TypeScript configuration
- **`tailwind.config.ts`** - Tailwind CSS configuration
  - Theme customization
  - Plugin configuration
- **`postcss.config.js`** - PostCSS configuration
  - Tailwind CSS processing
  - Autoprefixer
- **`eslint.config.js`** - ESLint configuration
  - TypeScript ESLint rules
  - React hooks rules

### Project Configuration

- **`components.json`** - shadcn/ui component configuration
  - Component paths and aliases
  - Style configuration
- **`index.html`** - HTML entry point
  - Root div for React app
  - Meta tags and title
- **`bun.lockb`** - Bun package manager lockfile (if using Bun)
- **`run-with-nvm.sh`** - NVM wrapper script for npm commands
- **`setup-nvm.sh`** - NVM setup script

### Other Files

- **`debug.log`** - Root-level debug log file

---

## 🔑 Key Concepts

### Frontend Architecture

- **Component Structure**: Functional components with hooks
- **State Management**: React Context + TanStack Query for server state
- **Routing**: React Router with lazy-loaded routes
- **Styling**: Tailwind CSS with shadcn/ui components
- **API Communication**: Custom API client with query builder pattern
- **Real-time**: WebSocket client for live updates

### Backend Architecture

- **API Structure**: RESTful API with Express.js
- **Database**: Prisma ORM with PostgreSQL
- **Authentication**: JWT tokens + Passport.js for OAuth
- **Real-time**: WebSocket server for live updates
- **File Storage**: S3-compatible storage (MinIO in dev)
- **Permissions**: Role-based access control system

### Data Flow

1. **Frontend** makes API requests via `api` client
2. **Backend** routes handle requests and call services
3. **Services** contain business logic and database operations
4. **Prisma** executes database queries
5. **Realtime** server broadcasts changes via WebSocket
6. **Frontend** receives updates and updates UI reactively

### Permission System

- **Frontend**: `src/lib/permissions/` - Client-side permission checking
- **Backend**: `backend/src/lib/permissions/` - Server-side permission validation
- **Middleware**: `backend/src/middleware/permissions.ts` - Route protection
- **Components**: `src/components/admin/permissions/` - Permission UI

---

## 📝 Notes for Agents

1. **Frontend code** is in `src/` at the root level
2. **Backend code** is in `backend/src/`
3. **Shared types** should be kept in sync between frontend and backend
4. **Permission system** has both frontend and backend implementations
5. **Real-time updates** use WebSocket on both frontend and backend
6. **Database schema** is defined in `backend/prisma/schema.prisma`
7. **API client** provides a Supabase-like query builder interface
8. **Component naming** follows lowercase-with-dashes convention
9. **Always check** `.cursor/rules/` for coding guidelines before making changes

---

*Last updated: Generated from codebase analysis*

