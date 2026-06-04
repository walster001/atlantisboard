# Multi-stage image for atlantisboard full-stack Compose.
#
# Build context: package root (packages/atlantisboard or /opt/atlantisboard).
#
# Targets:
#   artifacts           — internal; pre-built dist/ + public/ from build-npm-package.sh
#   build-from-source   — internal; compile inside image (CI development target only)
#   development         — CI: full dev install + in-image build (not shipped in release zip)
#   production          — Release zip / Staging / installer Compose (pre-built dist only)
#
# Release zip must include dist/ and public/ and must NOT include src/ or docker/root.*.
# See packages/atlantisboard/.dockerignore.

FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app

# Pre-built artifacts from build-npm-package.sh (host CI / staging / production).
FROM base AS artifacts
COPY dist ./dist
COPY public ./public

# Source compile path — CI only (sync-docker-build-context.sh).
FROM base AS deps-dev
COPY docker/root.package.json package.json
COPY docker/root.bun.lock bun.lock
ENV ATLANTISBOARD_SKIP_SETUP=1
RUN bun install --frozen-lockfile --ignore-scripts \
  && rm -rf /root/.bun/install/cache

FROM deps-dev AS build-from-source
ENV NODE_ENV=production
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json tsconfig.typecheck.json postcss.config.js tailwind.config.js ./
COPY public ./public
RUN bun run build:client \
  && bun run build

FROM base AS development
ENV NODE_ENV=development
COPY --from=deps-dev /app/node_modules ./node_modules
COPY --from=build-from-source /app/dist ./dist
COPY --from=build-from-source /app/public ./public
COPY package.json bun.lock ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["bun", "run", "dist/server/index.js"]

FROM base AS production
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
RUN apk add --no-cache ca-certificates curl \
  && curl -fsSL \
    "https://github.com/minio/mc/releases/download/${MC_RELEASE}/mc.linux-amd64.${MC_RELEASE}" \
    -o /usr/local/bin/mc \
  && chmod +x /usr/local/bin/mc \
  && rm -rf /var/cache/apk/*
COPY package.json bun.lock ./
ENV ATLANTISBOARD_SKIP_SETUP=1 NODE_ENV=production
RUN bun install --frozen-lockfile --production --ignore-scripts \
  && rm -rf /root/.bun/install/cache
COPY --from=artifacts /app/dist ./dist
COPY --from=artifacts /app/public ./public
RUN addgroup -g 1001 -S nodejs \
  && adduser -S bunjs -u 1001 \
  && chown -R bunjs:nodejs /app
USER bunjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["bun", "run", "dist/server/index.js"]
