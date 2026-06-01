# Multi-stage Dockerfile for optimized builds

# Stage 1: Build stage
FROM oven/bun:1.3.5-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Stage 2: Production stage
FROM oven/bun:1.3.5-alpine

WORKDIR /app

# Install MinIO Client (mc) for backup mirroring.
# Pinned version for reproducible production images.
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
RUN apk add --no-cache ca-certificates curl && \
    curl -fsSL "https://github.com/minio/mc/releases/download/${MC_RELEASE}/mc.linux-amd64.${MC_RELEASE}" \
      -o /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc && \
    /usr/local/bin/mc --version

# Copy package files and install production dependencies only
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bunjs -u 1001

# Change ownership
RUN chown -R bunjs:nodejs /app

USER bunjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "dist/server/index.js"]




