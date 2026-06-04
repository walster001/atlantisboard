# Multi-stage image for repo-root docker-compose.prod.yml (context: repository root).
#
# Targets:
#   development — CI: full install + in-image build (NODE_ENV=development)
#   production  — production Compose app service (NODE_ENV=production)

FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app

FROM base AS deps-dev
COPY package.json bun.lock ./
ENV ATLANTISBOARD_SKIP_SETUP=1
RUN bun install --frozen-lockfile --ignore-scripts \
  && rm -rf /root/.bun/install/cache

FROM deps-dev AS build
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
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
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
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
RUN addgroup -g 1001 -S nodejs \
  && adduser -S bunjs -u 1001 \
  && chown -R bunjs:nodejs /app
USER bunjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["bun", "run", "dist/server/index.js"]
