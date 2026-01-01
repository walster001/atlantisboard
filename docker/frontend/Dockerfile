# =====================================================
# AtlantisBoard Frontend Docker Image
# Multi-stage build: Node.js build + Nginx serve
# =====================================================

# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb* ./

# Install dependencies
RUN npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_APP_URL

# Set environment variables for build
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
ENV VITE_APP_URL=${VITE_APP_URL}

# Build the application
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS production

# Install envsubst for template processing
RUN apk add --no-cache gettext

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom nginx configuration template
COPY docker/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create directory for SSL certificates (mounted from host)
RUN mkdir -p /etc/nginx/ssl

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Create a simple health endpoint
RUN echo 'OK' > /usr/share/nginx/html/health

# Expose ports
EXPOSE 80
EXPOSE 443

# Use envsubst to process templates and start nginx
CMD ["/bin/sh", "-c", "envsubst '${DOMAIN_NAME} ${KONG_HTTP_PORT} ${ENABLE_SSL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
