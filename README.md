# Kanboard Application

A fully-functional, self-hosted Kanban board application combining the best features of Trello, Wekan, and Atlantisboard. Built with modern technologies including Bun, React, TypeScript, MongoDB, and Socket.io for real-time collaboration.

## Features

### Core Features
- **Multi-workspace Support**: Organize your boards into workspaces
- **Kanban & List Views**: Flexible board views with drag-and-drop
- **Real-time Collaboration**: Live updates via Socket.io and MongoDB Change Streams
- **Rich Card Management**: Labels, checklists, comments, attachments, due dates, and more
- **Advanced Permissions**: Role-based access control (Admin, Manager, Member, Viewer)
- **Invite Links**: Workspace and board-level invites with role specification

### Authentication
- Email/Password authentication with secure password hashing (Argon2id)
- Google OAuth 2.0 integration
- Google OAuth with external MySQL verification
- Account lockout protection
- Configurable authentication methods

### Import/Export
- **Trello Import**: Import boards from Trello JSON exports
- **Wekan Import**: Import from Wekan JSON format (planned)
- **CSV Import**: Import cards from CSV/TSV files (planned)
- **Export**: Export boards as JSON or CSV

### Templates
- **Board Templates**: Pre-configured boards with lists, labels, and sample cards
- **Card Templates**: Reusable card templates with default checklists and labels

### Admin Features
- **Admin Panel**: Centralized configuration management
- **Security Settings**: Configure authentication methods, rate limiting, and more
- **Activity Logs**: Track all user activities (Admins and Managers only)
- **Notification System**: In-app and push notifications

### PWA Support
- Offline functionality with service worker
- Installable as a Progressive Web App
- Background sync for offline actions

## Technology Stack

### Backend
- **Bun** (v1.3.5+) - Runtime, bundler, package manager, test runner
- **Express.js** (v5.2.1) - Web framework
- **TypeScript** (v5.9.3) - Type-safe code
- **MongoDB** (v8.x) - NoSQL database
- **Mongoose** (v9.1.2) - MongoDB ODM
- **Socket.io** (v4.8.3) - Real-time communication
- **Passport.js** (v0.7.0) - Authentication
- **Redis** - Session storage and caching
- **MinIO** - Object storage for file attachments

### Frontend
- **React** (v19.2.3) - UI library
- **TypeScript** (v5.9.3) - Type safety
- **React Router** (v7.11.0) - Client-side routing
- **Tailwind CSS** (v4.1.18) - Styling
- **DaisyUI** - Component library
- **Dexie.js** (v4.2.1) - IndexedDB wrapper
- **@dnd-kit** - Drag-and-drop functionality

## Prerequisites

- **Bun** v1.3.5 or higher ([Installation Guide](https://bun.sh/docs/installation))
- **Docker** and **Docker Compose** (for local development)
- **MongoDB** (via Docker or local installation)
- **Redis** (via Docker or local installation)
- **MinIO** (via Docker or local installation)

## Quick Start

### One-Click Development Deployment (Recommended)

For the fastest setup, use the automated development deployment script:

```bash
./scripts/dev-deploy.sh
```

This script will:
- Check all prerequisites (Bun, Docker, Docker Compose)
- Create `.env` file from template if missing
- Generate secure random secrets automatically
- Start Docker services (MongoDB, Redis, MinIO)
- Wait for services to be healthy
- Install dependencies
- Run TypeScript type checking
- Start the development server with hot reload

The application will be available at `http://localhost:3000`

### Access From Mobile / LAN (WSL2 on Windows)

If you run this app in WSL2 and want to open it from another device on your Wi-Fi:

1. Ensure server bind is enabled for all interfaces (already default here):
   - `.env` -> `HOST=0.0.0.0`
2. Forward a Windows port to the WSL app port (PowerShell as Administrator):
   ```powershell
   # Replace 36521 with your Windows listen port, and 3000 with app port in WSL
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=36521 connectaddress=<WSL_IP> connectport=3000
   New-NetFirewallRule -DisplayName "Kanboard WSL LAN 36521" -Direction Inbound -Protocol TCP -LocalPort 36521 -Action Allow
   ```
3. From phone/tablet on same network, open:
   - `http://<WINDOWS_LAN_IP>:36521`

Notes:
- Find `<WSL_IP>` from Ubuntu: `hostname -I`
- Find `<WINDOWS_LAN_IP>` from PowerShell: `ipconfig`
- For custom origins, set `.env` `CORS_ORIGIN` as comma-separated origins.

### Manual Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd atlboard-new
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start services**
   ```bash
   docker-compose up -d
   ```

4. **Install dependencies**
   ```bash
   bun install
   ```

5. **Start the development server**
   ```bash
   bun run dev
   ```

   This will:
   - Build the client application automatically (if not already built)
   - Start a watcher that rebuilds the client on file changes
   - Start the Express server with hot reload
   - Both processes run concurrently

The application will be available at `http://localhost:3000`

### Manual Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start MongoDB, Redis, and MinIO** (or use Docker Compose)

4. **Start the development server**
   ```bash
   bun run dev
   ```

   This automatically builds the client and watches for changes, so you get hot reloading for both frontend and backend.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/kanboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Session
SESSION_SECRET=your-session-secret-change-in-production

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Encryption Key (for admin config)
ENCRYPTION_KEY=your-encryption-key-change-in-production

# CORS
CORS_ORIGIN=http://localhost:3000
```

## Development

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run typecheck` - Run TypeScript type checking
- `bun test` - Run tests
- `bun run lint` - Run ESLint

### Deployment Scripts

The `scripts/` directory contains several helper scripts:

- `scripts/dev-deploy.sh` - One-click development deployment (automated setup)
- `scripts/prod-deploy.sh` - One-click production deployment
- `scripts/check-prerequisites.sh` - Check system prerequisites
- `scripts/setup-env.sh` - Setup environment file from template
- `scripts/wait-for-services.sh` - Wait for Docker services to be healthy
- `scripts/init-database.sh` - Initialize database
- `scripts/health-check.sh` - Comprehensive health check utility
- `scripts/print-wsl-lan-portproxy.sh` - Print PowerShell commands for WSL2 LAN access

**Usage Examples:**

```bash
# Development deployment
./scripts/dev-deploy.sh

# Production deployment
./scripts/prod-deploy.sh

# Health check
./scripts/health-check.sh http://localhost:3000

# Check prerequisites only
./scripts/check-prerequisites.sh
```

### Project Structure

```
atlboard-new/
├── src/
│   ├── server/          # Backend code
│   │   ├── config/      # Configuration files
│   │   ├── controllers/ # Route controllers
│   │   ├── middleware/  # Express middleware
│   │   ├── models/      # Mongoose models
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic
│   │   ├── sockets/     # Socket.io handlers
│   │   ├── utils/       # Utility functions
│   │   ├── workers/     # Background jobs
│   │   └── index.ts     # Server entry point
│   ├── client/          # Frontend code
│   │   ├── components/  # React components
│   │   ├── contexts/    # React contexts
│   │   ├── hooks/       # Custom React hooks
│   │   ├── pages/       # Page components
│   │   ├── store/       # Dexie.js database
│   │   ├── styles/      # CSS files
│   │   └── utils/       # Utility functions
│   └── shared/          # Shared types and utilities
├── public/              # Static files
├── scripts/             # Deployment and utility scripts
├── tests/               # Test files
├── docker-compose.yml   # Docker Compose configuration (development)
├── docker-compose.prod.yml # Docker Compose configuration (production)
├── Dockerfile           # Docker image definition
├── .env.example         # Environment variables template
└── package.json         # Dependencies and scripts
```

## Production Deployment

### One-Click Production Deployment (Recommended)

For production deployment, use the automated production deployment script:

```bash
./scripts/prod-deploy.sh
```

This script will:
- Check all prerequisites
- Validate production environment variables (ensures secure secrets are set)
- Build the Docker image
- Start all services (MongoDB, Redis, MinIO, App) via Docker Compose
- Wait for all services to be healthy
- Verify application health endpoint
- Show deployment status and useful commands

**Important**: Before running the production deployment script, ensure:
- Your `.env` file has production-ready values
- All secrets (JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY) are set to secure random strings
- `NODE_ENV=production` is set
- Database connection strings are configured correctly

### Manual Production Deployment

1. **Build the Docker image**
   ```bash
   docker build -t kanboard:latest .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Manual Deployment

1. **Build the application**
   ```bash
   bun run build
   ```

2. **Start the production server**
   ```bash
   bun run start
   ```

### Security Considerations

- Change all default secrets in production
- Use environment variables for sensitive data
- Enable HTTPS in production
- Configure proper CORS origins
- Set up firewall rules
- Regular security updates
- Monitor logs for suspicious activities

## API Documentation

The API follows RESTful conventions and is versioned at `/api/v1/`.

### Authentication Endpoints
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/google` - Initiate Google OAuth
- `GET /api/v1/auth/google/callback` - Google OAuth callback

### Workspace Endpoints
- `GET /api/v1/workspaces` - List workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces/:id` - Get workspace
- `PUT /api/v1/workspaces/:id` - Update workspace
- `DELETE /api/v1/workspaces/:id` - Delete workspace

### Board Endpoints
- `GET /api/v1/boards` - List boards
- `POST /api/v1/boards` - Create board
- `GET /api/v1/boards/:id` - Get board
- `PUT /api/v1/boards/:id` - Update board
- `DELETE /api/v1/boards/:id` - Delete board

### Import/Export Endpoints
- `POST /api/v1/import/trello` - Import Trello JSON
- `GET /api/v1/import/jobs/:jobId` - Get import job status
- `GET /api/v1/export/boards/:id/json` - Export board as JSON
- `GET /api/v1/export/boards/:id/csv` - Export board as CSV

## Background Jobs

The application includes automated background jobs:

- **Activity Log Cleanup**: Weekly cleanup respecting workspace retention periods
- **Import Job Cleanup**: Daily cleanup of completed/failed import jobs
- **Notification Cleanup**: Weekly cleanup of read notifications (after 10 days)
- **Orphaned Attachments Cleanup**: Daily cleanup of attachments from deleted cards
- **Reminder Delivery**: Check every 15 minutes for due reminders

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Specify your license here]

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

## Security

This application follows OWASP security best practices. If you discover a security vulnerability, please email [security-email] instead of using the issue tracker.

## Acknowledgments

- Inspired by Trello, Wekan, and Atlantisboard
- Built with Bun, React, and MongoDB
- Uses various open-source libraries and frameworks
