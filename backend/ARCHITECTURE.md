# Backend Architecture Decisions

## WebSocket Server Integration

### Decision
The WebSocket server is **integrated into the main Express HTTP server** rather than running as a separate service.

### Implementation
- WebSocket server is initialized in `backend/src/index.ts` after the HTTP server starts
- Uses the same HTTP server instance for WebSocket upgrade requests
- WebSocket connections are handled on the `/realtime` path
- Both HTTP API and WebSocket run on the same port (API_PORT, default 3000)

### Rationale
1. **Simplified Deployment**: Single container instead of two separate services
2. **Shared Authentication**: Both HTTP and WebSocket use the same JWT middleware
3. **Resource Efficiency**: Single Node.js process handles both protocols
4. **Easier Development**: Single service to start and debug

### Trade-offs
- **Pros**: Simpler deployment, shared auth context, easier debugging
- **Cons**: Cannot scale WebSocket independently from HTTP API

### Alternative (Not Implemented)
The original plan suggested a separate WebSocket server (`backend/websocket/Dockerfile`). This would allow:
- Independent scaling of WebSocket connections
- Separate resource allocation
- Different deployment strategies

### Future Considerations
If WebSocket traffic becomes a bottleneck, the architecture can be refactored to:
1. Extract WebSocket server to separate service
2. Use a message queue (Redis Pub/Sub) for event broadcasting
3. Deploy WebSocket servers independently

### Current Configuration
- HTTP API: Port 3000
- WebSocket: Same port (3000), path `/realtime`
- Nginx routes `/api/*` to HTTP API
- Nginx routes `/ws/*` or `/realtime` to WebSocket upgrade

