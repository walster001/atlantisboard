# Production image for npm package full-stack install (pre-built dist/ from install context).
FROM oven/bun:1.3.5-alpine

WORKDIR /app

ARG MC_VERSION=RELEASE.2026-01-21T05-28-08Z
RUN apk add --no-cache ca-certificates curl && \
    curl -fsSL "https://dl.min.io/client/mc/release/linux-amd64/archive/mc-${MC_VERSION}" -o /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY dist ./dist
COPY public ./public

RUN addgroup -g 1001 -S nodejs && \
    adduser -S bunjs -u 1001 && \
    chown -R bunjs:nodejs /app

USER bunjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "dist/server/index.js"]
