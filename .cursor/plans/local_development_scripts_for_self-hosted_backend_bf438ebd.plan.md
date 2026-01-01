---
name: Local Development Scripts for Self-Hosted Backend
overview: Create comprehensive setup, start, stop, and restart scripts for local development with the self-hosted backend (PostgreSQL, MinIO, Node.js API, React frontend) as specified in Phase 7 of the migration plan.
todos: []
---

# Local D

evelopment Scripts Plan for Self-Hosted Backend

## Overview

This plan creates development scripts to easily set up, start, stop, and restart the local development environment for the self-hosted AtlantisBoard backend. The scripts will manage Docker Compose services (PostgreSQL, MinIO), the Node.js backend API, and the React frontend.

## Architecture

The local development environment consists of:

1. **Backend Services (Docker Compose)**:

- PostgreSQL database (port 5432)
- MinIO S3-compatible storage (ports 9000, 9001)
- Backend API server (port 3000) - runs locally with hot reload

2. **Frontend**:

- React/Vite dev server (port 8080) - runs locally with hot reload

3. **Environment Files**:

- `backend/.env` - Backend environment variables
- `.env.local` - Frontend environment variables (optional, for Vite)

## Scripts to Create

### 1. `scripts/dev-setup-backend.sh` - Initial Setup Script

**Purpose**: One-time setup for new developers or after cloning the repository.**Tasks**:

1. Check prerequisites (Docker, Node.js, npm)
2. Create `backend/.env` from `backend/env.example.txt` if it doesn't exist
3. Generate JWT secrets if not present
4. Install backend dependencies (`cd backend && npm install`)
5. Install frontend dependencies (`npm install`)
6. Generate Prisma client (`cd backend && npm run prisma:generate`)
7. Start Docker services (PostgreSQL, MinIO)
8. Wait for services to be healthy
9. Run database migrations (`cd backend && ./scripts/migrate-db.sh`)
10. Verify setup completion

**Features**:

- Interactive prompts for missing environment variables
- Automatic JWT secret generation using `openssl`
- Validation of all required environment variables
- Clear error messages and recovery suggestions
- Idempotent (safe to run multiple times)

**Output**:

- Success message with next steps
- URLs for accessing services:
- Frontend: http://127.0.0.1:8080
- Backend API: http://127.0.0.1:3000
- MinIO Console: http://127.0.0.1:9001

### 2. `scripts/dev-start-backend.sh` - Start All Services

**Purpose**: Start all services for development (backend services, frontend).**Tasks**:

1. Check if `backend/.env` exists (prompt to run setup if missing)
2. Start Docker Compose services (`cd backend && docker-compose up -d`)
3. Wait for PostgreSQL to be healthy
4. Wait for MinIO to be healthy
5. Verify database connection
6. Start backend API server in background (`cd backend && npm run dev`)
7. Start frontend dev server in foreground (`npm run dev`)
8. Handle cleanup on exit (Ctrl+C)

**Features**:

- Background process management for backend API
- Foreground process for frontend (for easy viewing of logs)
- Graceful shutdown on Ctrl+C
- Health checks before starting dependent services
- Process ID tracking for cleanup

**Output**:

- Status messages for each service
- URLs for accessing services
- Instructions for stopping services

### 3. `scripts/dev-stop-backend.sh` - Stop All Services

**Purpose**: Stop all running services cleanly.**Tasks**:

1. Stop frontend dev server (if running)
2. Stop backend API server (if running)
3. Stop Docker Compose services (`cd backend && docker-compose down`)
4. Optionally remove volumes (with confirmation prompt)
5. Clean up any background processes

**Features**:

- Graceful shutdown of all processes
- Option to keep or remove Docker volumes
- Process cleanup verification
- Status messages

### 4. `scripts/dev-restart-backend.sh` - Restart All Services

**Purpose**: Restart all services (useful after environment variable changes).**Tasks**:

1. Call `dev-stop-backend.sh`
2. Wait for services to fully stop
3. Call `dev-start-backend.sh`

**Features**:

- Ensures clean restart
- Preserves data (doesn't remove volumes)
- Quick way to apply configuration changes

## Implementation Details

### Environment Variable Management

**Backend Environment File (`backend/.env`)**:

- Source: `backend/env.example.txt`
- Required variables:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing secret (auto-generated if missing)
- `JWT_REFRESH_SECRET` - Refresh token secret (auto-generated if missing)
- `S3_ACCESS_KEY` - MinIO access key (default: minioadmin)
- `S3_SECRET_KEY` - MinIO secret key (default: minioadmin)
- Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MYSQL_ENCRYPTION_KEY`

**Frontend Environment Variables**:

- `VITE_API_URL` - Backend API URL (default: http://127.0.0.1:3000/api)
- `VITE_WS_URL` - WebSocket URL (default: ws://127.0.0.1:3000/realtime)
- `VITE_S3_URL` - S3 storage URL (default: http://127.0.0.1:9000)
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)

### Prerequisites Checking

**Required tools**:

- Docker and Docker Compose (version 3.8+)
- Node.js 20+ (LTS recommended)
- npm or equivalent package manager
- `openssl` (for JWT secret generation)

**Validation**:

- Check Docker is running: `docker ps`
- Check Node.js version: `node --version`
- Check Docker Compose version: `docker compose version`

### Service Health Checks

**PostgreSQL**:

- Command: `pg_isready -h localhost -p 5432 -U postgres`
- Retry: 5 times with 2-second intervals

**MinIO**:

- Command: `curl -f http://localhost:9000/minio/health/live`
- Retry: 3 times with 5-second intervals

**Backend API**:

- Command: `curl -f http://localhost:3000/health` (if health endpoint exists)
- Or: Check process is running

### Process Management

**Backend API Server**:

- Run in background: `cd backend && npm run dev &`
- Store PID in file: `backend/.dev-api.pid`
- Log output to: `backend/.dev-api.log`

**Frontend Dev Server**:

- Run in foreground: `npm run dev`
- Allows direct viewing of Vite output
- Handles Ctrl+C for graceful shutdown

### Error Handling

**Common Issues and Solutions**:

1. **Port already in use**: Check what's using the port, offer to kill process
2. **Docker not running**: Prompt to start Docker
3. **Database connection failed**: Check PostgreSQL is healthy, verify DATABASE_URL
4. **Missing environment variables**: Prompt to run setup script
5. **Migration failures**: Show migration errors, suggest manual fix

### Logging and Output

**Script Output**:

- Use colors for status messages (green=success, yellow=warning, red=error)
- Clear section headers
- Progress indicators for long operations
- Final summary with service URLs

**Log Files**:

- Backend API logs: `backend/.dev-api.log`
- Script execution logs: Optional, can be enabled with `--verbose` flag

## File Structure

```javascript
scripts/
  dev-setup-backend.sh      # Initial setup
  dev-start-backend.sh      # Start services
  dev-stop-backend.sh       # Stop services
  dev-restart-backend.sh    # Restart services
  check-prerequisites.sh    # Helper: Check required tools
  generate-jwt-secrets.sh   # Helper: Generate JWT secrets
```



## Usage Examples

### First Time Setup

```bash
# Run setup (creates .env, installs deps, runs migrations)
./scripts/dev-setup-backend.sh

# Start all services
./scripts/dev-start-backend.sh
```



### Daily Development

```bash
# Start services
./scripts/dev-start-backend.sh

# Make code changes (hot reload works)

# Stop services
./scripts/dev-stop-backend.sh
```



### After Environment Changes

```bash
# Restart to apply new environment variables
./scripts/dev-restart-backend.sh
```



### Clean Slate

```bash
# Stop and remove volumes
./scripts/dev-stop-backend.sh
# Answer 'yes' to remove volumes

# Run setup again
./scripts/dev-setup-backend.sh
```



## Integration with Existing Scripts

**Preserve existing scripts**:

- `scripts/dev-setup.sh` - Keep for Supabase-based setup (if still needed)
- `scripts/dev-start.sh` - Keep for Supabase-based setup (if still needed)
- `scripts/dev-stop.sh` - Keep for Supabase-based setup (if still needed)

**New scripts are clearly named**:

- `dev-setup-backend.sh` - New self-hosted backend setup
- `dev-start-backend.sh` - New self-hosted backend start
- `dev-stop-backend.sh` - New self-hosted backend stop
- `dev-restart-backend.sh` - New self-hosted backend restart

## Testing the Scripts

**Test scenarios**:

1. Fresh clone setup (no .env files)
2. Existing setup (env files present)
3. Partial setup (some services running)
4. Port conflicts
5. Missing prerequisites
6. Database migration failures
7. Service health check failures

## Documentation

**Update documentation**:

- `docs/LOCAL_DEVELOPMENT.md` - Add section for self-hosted backend setup
- `README.md` - Update quick start instructions
- Create `docs/BACKEND_DEVELOPMENT.md` - Detailed backend development guide

## Success Criteria

- [ ] `dev-setup-backend.sh` successfully sets up environment on fresh clone
- [ ] `dev-start-backend.sh` starts all services correctly
- [ ] `dev-stop-backend.sh` stops all services cleanly
- [ ] `dev-restart-backend.sh` restarts services without data loss
- [ ] Scripts handle errors gracefully with helpful messages
- [ ] Scripts are idempotent (safe to run multiple times)
- [ ] All services are accessible after startup