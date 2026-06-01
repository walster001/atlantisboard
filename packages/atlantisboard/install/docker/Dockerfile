# Production image for npm package full-stack install (pre-built dist/ from install context).
FROM oven/bun:1.3.5-alpine

WORKDIR /app

# Pin with ATLANTISBOARD_MC_RELEASE in install/docker/image-defaults.env (must match ATLANTISBOARD_MINIO_MC_IMAGE tag).
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
RUN apk add --no-cache ca-certificates curl && \
    curl -fsSL "https://github.com/minio/mc/releases/download/${MC_RELEASE}/mc.linux-amd64.${MC_RELEASE}" \
      -o /usr/local/bin/mc && \
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
