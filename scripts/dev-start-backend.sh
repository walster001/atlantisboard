#!/bin/bash
# =====================================================
# AtlantisBoard Backend - Start Development Services
# =====================================================
# Starts all services for local development
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# PID files
BACKEND_PID_FILE="$BACKEND_DIR/.dev-api.pid"
BACKEND_LOG_FILE="$BACKEND_DIR/.dev-api.log"
FRONTEND_PID_FILE="$PROJECT_ROOT/.dev-frontend.pid"
FRONTEND_LOG_FILE="$PROJECT_ROOT/.dev-frontend.log"

# Terminal settings (for cleanup)
SAVED_STTY=""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    
    # Restore terminal settings if we changed them
    if [ -n "$SAVED_STTY" ] && [ -t 0 ]; then
        stty "$SAVED_STTY" 2>/dev/null || true
    fi
    
    # Stop backend API if running
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            echo -e "${BLUE}   Stopping backend API (PID: $BACKEND_PID)...${NC}"
            kill "$BACKEND_PID" 2>/dev/null || true
            wait "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    
    # Stop frontend if running
    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE")
        if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
            echo -e "${BLUE}   Stopping frontend (PID: $FRONTEND_PID)...${NC}"
            kill "$FRONTEND_PID" 2>/dev/null || true
            wait "$FRONTEND_PID" 2>/dev/null || true
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    
    # Stop Docker containers (preserve volumes/data)
    echo -e "${BLUE}   Stopping Docker containers...${NC}"
    cd "$BACKEND_DIR"
    if docker compose version &> /dev/null 2>&1; then
        docker compose down 2>/dev/null || true
    else
        docker-compose down 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 Starting AtlantisBoard Development Environment${NC}"
echo ""

# Check if .env exists
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
    echo -e "${YELLOW}   Please run setup first:${NC}"
    echo -e "${GREEN}   ./scripts/dev-setup-backend.sh${NC}"
    exit 1
fi

# Start Docker services
echo -e "${BLUE}🐳 Starting Docker services...${NC}"
cd "$BACKEND_DIR"

# Function to strip CRLF from a value
strip_crlf() {
    printf '%s' "$1" | tr -d '\r'
}

# Load environment variables
set -a
source .env 2>/dev/null || true
set +a

# #region agent log
# Debug: Check .env file line endings and strip CRLF from variables
DEBUG_LOG="$PROJECT_ROOT/.cursor/debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

# Check .env file line endings
if [ -f "$BACKEND_DIR/.env" ]; then
    ENV_FILE_TYPE=$(file "$BACKEND_DIR/.env" 2>/dev/null || echo "unknown")
    echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:68\",\"message\":\"Checking .env file\",\"data\":{\"file_type\":\"$ENV_FILE_TYPE\",\"hypothesisId\":\"A\",\"runId\":\"post-fix\"}}" >> "$DEBUG_LOG" 2>&1 || true
fi

# Strip CRLF from all port-related environment variables
for var in API_PORT POSTGRES_PORT MINIO_PORT MINIO_CONSOLE_PORT WS_PORT; do
    eval "value=\$$var"
    if [ -n "$value" ]; then
        cleaned=$(strip_crlf "$value")
        if [ "$value" != "$cleaned" ]; then
            echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:77\",\"message\":\"Stripped CRLF from $var\",\"data\":{\"variable\":\"$var\",\"before\":\"$value\",\"after\":\"$cleaned\",\"hypothesisId\":\"C\",\"runId\":\"post-fix\"}}" >> "$DEBUG_LOG" 2>&1 || true
            export "$var=$cleaned"
        else
            echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:81\",\"message\":\"$var is clean\",\"data\":{\"variable\":\"$var\",\"value\":\"$cleaned\",\"hypothesisId\":\"C\",\"runId\":\"post-fix\"}}" >> "$DEBUG_LOG" 2>&1 || true
        fi
    fi
done
# #endregion

# #region agent log
# Debug: Check .env file line endings and API_PORT value
DEBUG_LOG="$PROJECT_ROOT/.cursor/debug.log"
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

# Check .env file line endings
if [ -f "$BACKEND_DIR/.env" ]; then
    ENV_FILE_TYPE=$(file "$BACKEND_DIR/.env" 2>/dev/null || echo "unknown")
    echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:68\",\"message\":\"Checking .env file\",\"data\":{\"file_type\":\"$ENV_FILE_TYPE\",\"hypothesisId\":\"A\"}}" >> "$DEBUG_LOG" 2>&1 || true
fi

# Check API_PORT value for CRLF issues
if [ -n "$API_PORT" ]; then
    API_PORT_LENGTH=${#API_PORT}
    # Check for carriage return using od or printf
    API_PORT_OD=$(printf '%s' "$API_PORT" | od -An -tx1 2>/dev/null | tr -d ' \n' || echo "od_not_available")
    echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:75\",\"message\":\"API_PORT value after sourcing .env\",\"data\":{\"value\":\"$API_PORT\",\"length\":$API_PORT_LENGTH,\"hex_bytes\":\"$API_PORT_OD\",\"hypothesisId\":\"A\"}}" >> "$DEBUG_LOG" 2>&1 || true
    
    # Check for carriage return
    if printf '%s' "$API_PORT" | grep -q $'\r' 2>/dev/null; then
        echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:79\",\"message\":\"CRLF detected in API_PORT\",\"data\":{\"hypothesisId\":\"A\"}}" >> "$DEBUG_LOG" 2>&1 || true
    fi
else
    echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:82\",\"message\":\"API_PORT not set, will use default\",\"data\":{\"hypothesisId\":\"A\"}}" >> "$DEBUG_LOG" 2>&1 || true
fi
# #endregion

# #region agent log
# Debug: Log docker-compose command and environment (after CRLF cleanup)
COMPOSE_CMD=""
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose up -d"
else
    COMPOSE_CMD="docker-compose up -d"
fi
echo "{\"timestamp\":$(date +%s%3N),\"location\":\"dev-start-backend.sh:91\",\"message\":\"About to run docker-compose\",\"data\":{\"command\":\"$COMPOSE_CMD\",\"api_port\":\"${API_PORT:-not_set}\",\"hypothesisId\":\"B\",\"runId\":\"post-fix\"}}" >> "$DEBUG_LOG" 2>&1 || true
# #endregion

# Start services
if docker compose version &> /dev/null 2>&1; then
    docker compose up -d
else
    docker-compose up -d
fi

echo -e "${GREEN}✅ Docker services started${NC}"

# Wait for PostgreSQL
echo ""
echo -e "${BLUE}⏳ Waiting for PostgreSQL...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
POSTGRES_READY=false

# Get database name and user from env or use defaults
DB_NAME=${POSTGRES_DB:-atlantisboard}
DB_USER=${POSTGRES_USER:-postgres}

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Try to find PostgreSQL container
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "postgres|atlantisboard.*postgres" | head -n1)
    if [ -n "$CONTAINER_NAME" ] && docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" &> /dev/null 2>&1; then
        POSTGRES_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 1
done
echo ""

if [ "$POSTGRES_READY" = true ]; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL did not become ready${NC}"
    echo -e "${YELLOW}   Check logs: docker logs atlantisboard-postgres${NC}"
    exit 1
fi

# Wait for MinIO
echo ""
echo -e "${BLUE}⏳ Waiting for MinIO...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0
MINIO_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:9000/minio/health/live &> /dev/null 2>&1; then
        MINIO_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ "$MINIO_READY" = true ]; then
    echo -e "${GREEN}✅ MinIO is ready${NC}"
else
    echo -e "${YELLOW}⚠️  MinIO health check failed, but continuing...${NC}"
fi

# Start backend API server in background
echo ""
echo -e "${BLUE}🔧 Starting backend API server...${NC}"
cd "$BACKEND_DIR"

# Check if already running
if [ -f "$BACKEND_PID_FILE" ]; then
    OLD_PID=$(cat "$BACKEND_PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Backend API already running (PID: $OLD_PID)${NC}"
        echo -e "${YELLOW}   Stopping old process...${NC}"
        kill "$OLD_PID" 2>/dev/null || true
        wait "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$BACKEND_PID_FILE"
fi

# Start backend in background
npm run dev > "$BACKEND_LOG_FILE" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

# Wait a moment to check if it started successfully
sleep 2
if ! ps -p "$BACKEND_PID" > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend API failed to start${NC}"
    echo -e "${YELLOW}   Check logs: tail -f $BACKEND_LOG_FILE${NC}"
    rm -f "$BACKEND_PID_FILE"
    exit 1
fi

echo -e "${GREEN}✅ Backend API started (PID: $BACKEND_PID)${NC}"
echo -e "${BLUE}   Logs: tail -f $BACKEND_LOG_FILE${NC}"

# Start frontend dev server in background
echo ""
echo -e "${BLUE}🎨 Starting frontend dev server...${NC}"
cd "$PROJECT_ROOT"

# Check if already running
if [ -f "$FRONTEND_PID_FILE" ]; then
    OLD_PID=$(cat "$FRONTEND_PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Frontend already running (PID: $OLD_PID)${NC}"
        echo -e "${YELLOW}   Stopping old process...${NC}"
        kill "$OLD_PID" 2>/dev/null || true
        wait "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$FRONTEND_PID_FILE"
fi

# Start frontend in background
npm run dev > "$FRONTEND_LOG_FILE" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

# Wait a moment to check if it started successfully
sleep 2
if ! ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
    echo -e "${RED}❌ Frontend failed to start${NC}"
    echo -e "${YELLOW}   Check logs: tail -f $FRONTEND_LOG_FILE${NC}"
    rm -f "$FRONTEND_PID_FILE"
    exit 1
fi

echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
echo -e "${BLUE}   Logs: tail -f $FRONTEND_LOG_FILE${NC}"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services started!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "  Frontend:    ${GREEN}http://127.0.0.1:8080${NC}"
echo -e "  Backend API: ${GREEN}http://127.0.0.1:3000${NC}"
echo -e "  MinIO:       ${GREEN}http://127.0.0.1:9000${NC}"
echo -e "  MinIO Console: ${GREEN}http://127.0.0.1:9001${NC}"
echo ""
echo -e "${YELLOW}Press 'r' to force reload, Ctrl+C to stop all services${NC}"
echo ""

# Function to display reload indicator
show_reload_indicator() {
    local service=$1
    local timestamp=$(date +"%H:%M:%S")
    echo -e "${GREEN}[$timestamp] 🔄 ${service} reloaded${NC}"
}

# Function to force backend reload
force_backend_reload() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            # Kill the backend process - tsx watch will restart it automatically
            # But since we're running it in background, we need to restart manually
            kill "$BACKEND_PID" 2>/dev/null || true
            wait "$BACKEND_PID" 2>/dev/null || true
            
            # Restart backend
            cd "$BACKEND_DIR"
            npm run dev > "$BACKEND_LOG_FILE" 2>&1 &
            BACKEND_PID=$!
            echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
            cd "$PROJECT_ROOT"
            
            show_reload_indicator "Backend"
        fi
    fi
}

# Function to force frontend reload
force_frontend_reload() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE")
        if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
            # Restart the frontend process to trigger reload
            kill "$FRONTEND_PID" 2>/dev/null || true
            wait "$FRONTEND_PID" 2>/dev/null || true
            
            # Restart frontend
            cd "$PROJECT_ROOT"
            npm run dev > "$FRONTEND_LOG_FILE" 2>&1 &
            FRONTEND_PID=$!
            echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
            
            show_reload_indicator "Frontend"
        fi
    fi
}

# Track last log positions for monitoring
BACKEND_LOG_POS_FILE="$BACKEND_DIR/.dev-api.log.pos"
FRONTEND_LOG_POS_FILE="$PROJECT_ROOT/.dev-frontend.log.pos"

# Function to monitor log files for automatic reloads
monitor_logs() {
    # Check backend log for reload patterns
    if [ -f "$BACKEND_LOG_FILE" ]; then
        # Get last position or start from beginning
        local last_pos=0
        if [ -f "$BACKEND_LOG_POS_FILE" ]; then
            last_pos=$(cat "$BACKEND_LOG_POS_FILE" 2>/dev/null || echo 0)
        fi
        
        # Get current file size
        local current_size=$(wc -c < "$BACKEND_LOG_FILE" 2>/dev/null || echo 0)
        
        if [ "$current_size" -gt "$last_pos" ]; then
            # Read new content since last position
            local new_content=$(tail -c +$((last_pos + 1)) "$BACKEND_LOG_FILE" 2>/dev/null || dd if="$BACKEND_LOG_FILE" bs=1 skip=$last_pos 2>/dev/null)
            
            # Check for reload patterns in new content
            if echo "$new_content" | grep -qiE "(restarting|watching.*file|file.*changed|reload|tsx.*watch)" 2>/dev/null; then
                show_reload_indicator "Backend"
            fi
            
            # Update position
            echo "$current_size" > "$BACKEND_LOG_POS_FILE" 2>/dev/null || true
        fi
    fi
    
    # Check frontend log for reload patterns
    if [ -f "$FRONTEND_LOG_FILE" ]; then
        # Get last position or start from beginning
        local last_pos=0
        if [ -f "$FRONTEND_LOG_POS_FILE" ]; then
            last_pos=$(cat "$FRONTEND_LOG_POS_FILE" 2>/dev/null || echo 0)
        fi
        
        # Get current file size
        local current_size=$(wc -c < "$FRONTEND_LOG_FILE" 2>/dev/null || echo 0)
        
        if [ "$current_size" -gt "$last_pos" ]; then
            # Read new content since last position
            local new_content=$(tail -c +$((last_pos + 1)) "$FRONTEND_LOG_FILE" 2>/dev/null || dd if="$FRONTEND_LOG_FILE" bs=1 skip=$last_pos 2>/dev/null)
            
            # Check for reload patterns in new content
            if echo "$new_content" | grep -qiE "(hmr|hot.*reload|page.*reload|vite.*hmr|reload|updated)" 2>/dev/null; then
                show_reload_indicator "Frontend"
            fi
            
            # Update position
            echo "$current_size" > "$FRONTEND_LOG_POS_FILE" 2>/dev/null || true
        fi
    fi
}

# Initialize log position files
echo "0" > "$BACKEND_LOG_POS_FILE" 2>/dev/null || true
echo "0" > "$FRONTEND_LOG_POS_FILE" 2>/dev/null || true

# Cleanup log position files on exit
cleanup_log_pos() {
    rm -f "$BACKEND_LOG_POS_FILE" "$FRONTEND_LOG_POS_FILE" 2>/dev/null || true
}
trap cleanup_log_pos EXIT

# Monitoring loop
MONITORING=true
LAST_RELOAD_CHECK=0

# Save terminal settings for keyboard input (if available)
SAVED_STTY=""
if [ -t 0 ] && command -v stty >/dev/null 2>&1; then
    SAVED_STTY=$(stty -g 2>/dev/null || echo "")
    # Configure terminal for single character input without requiring Enter
    # -icanon: disable canonical mode (allows single char input)
    # min 1 time 0: return immediately after 1 character
    stty -icanon min 1 time 0 2>/dev/null || true
fi

while [ "$MONITORING" = true ]; do
    # Check if processes are still running
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if ! ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            echo -e "${RED}❌ Backend process died${NC}"
            MONITORING=false
            break
        fi
    fi
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE")
        if ! ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
            echo -e "${RED}❌ Frontend process died${NC}"
            MONITORING=false
            break
        fi
    fi
    
    # Check for keyboard input (non-blocking with short timeout)
    # This works in most terminals including WSL when stty is configured
    if [ -t 0 ]; then
        # Use a very short timeout to make it non-blocking
        # -n 1: read only 1 character
        # -r: don't interpret backslashes
        # -t 0.05: timeout after 50ms
        if IFS= read -t 0.05 -n 1 -r input 2>/dev/null; then
            case "$input" in
                r|R)
                    echo ""
                    echo -e "${BLUE}🔄 Forcing reload...${NC}"
                    force_backend_reload
                    force_frontend_reload
                    # Clear any remaining buffered input
                    while IFS= read -t 0 -n 1 -r 2>/dev/null; do :; done
                    ;;
                *)
                    # Ignore other input
                    ;;
            esac
        fi
    fi
    
    # Monitor logs for automatic reloads (check every second to reduce CPU usage)
    CURRENT_TIME=$(date +%s 2>/dev/null || echo 0)
    if [ $((CURRENT_TIME - LAST_RELOAD_CHECK)) -ge 1 ]; then
        monitor_logs
        LAST_RELOAD_CHECK=$CURRENT_TIME
    fi
    
    # Small sleep to prevent excessive CPU usage
    sleep 0.1
done

# Restore terminal settings if we changed them
if [ -n "$SAVED_STTY" ] && [ -t 0 ]; then
    stty "$SAVED_STTY" 2>/dev/null || true
fi

# If we exit the loop, cleanup
cleanup

