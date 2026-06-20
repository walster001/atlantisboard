---
layout: wiki
title: "Reverse Proxy Setup"
description: "Production-ready Nginx and Caddy configurations for Atlantisboard with TLS and WebSocket support."
parent: "Deployment & Installation"
nav_order: 6
permalink: /wiki/reverse-proxy/
---

# Reverse Proxy Setup (Nginx / Caddy)

A reverse proxy sits in front of Atlantisboard to provide TLS (HTTPS) termination, domain-based routing, HTTP/2, and WebSocket upgrade handling. This page provides complete, copy-pasteable configurations for both **Nginx** and **Caddy**.

![Reverse proxy architecture](images/reverse-proxy-diagram.png)

---

## Why Use a Reverse Proxy?

- **TLS termination** — serve your application over HTTPS with a valid certificate (Let's Encrypt or your own CA).
- **Domain name** — access Atlantisboard at `https://boards.example.com` instead of `http://192.168.1.10:3000`.
- **HTTP/2** — improved performance for modern browsers.
- **WebSocket upgrade** — Atlantisboard uses Socket.io for real-time collaboration. The proxy must forward WebSocket upgrade requests.
- **Security headers** — centralise security headers at the proxy layer.
- **Upload size control** — enforce maximum request body sizes for file uploads.
- **Video streaming** — attachment video uses HTTP `Range` requests; the proxy must forward range headers and avoid buffering entire responses.

---

## Environment Variable Alignment

Before configuring your reverse proxy, update these variables in your `.env` file:

```ini
TRUST_PROXY_HOPS=1
CORS_ORIGIN=https://boards.example.com
APP_URL=https://boards.example.com
API_URL=https://boards.example.com/api/v1
```

| Variable | Why It Matters |
|----------|---------------|
| `TRUST_PROXY_HOPS` | Tells Express how many proxy hops to trust for `X-Forwarded-For` headers. Set to `1` for a single Nginx or Caddy proxy. |
| `CORS_ORIGIN` | Must match your public domain exactly. Wildcard `*` is rejected in production. |
| `APP_URL` | Used for generating absolute URLs (e.g. in emails, OAuth redirects). Must be the full public URL including the scheme. |

---

## Nginx Configuration

### Prerequisites

- Nginx installed (`sudo apt install nginx` on Debian/Ubuntu)
- A domain name pointing to your server
- Certbot installed for Let's Encrypt certificates (`sudo apt install certbot python3-certbot-nginx`)

### Obtain a TLS Certificate

```bash
sudo certbot --nginx -d boards.example.com
```

### Server Block

Create or edit `/etc/nginx/sites-available/atlantisboard`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name boards.example.com;

    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name boards.example.com;

    # TLS certificates (managed by Certbot)
    ssl_certificate     /etc/letsencrypt/live/boards.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boards.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Upload size limit — match or exceed CARD_ATTACHMENT_MAX_MB
    client_max_body_size 100m;

    # Proxy headers
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket support (required for Socket.io real-time updates)
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";

    # Proxy timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;

    # Main application
    location / {
        proxy_pass http://127.0.0.1:3000;
    }

    # Attachment video — disable buffering so Range requests stream correctly
    location /api/v1/attachments/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Socket.io path — explicit location for clarity
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;

        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;

        proxy_cache_bypass $http_upgrade;
    }

    # Static asset caching (optional performance boost)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
        proxy_pass http://127.0.0.1:3000;

        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Enable the Site and Reload

```bash
sudo ln -s /etc/nginx/sites-available/atlantisboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> **Tip:** Run `sudo nginx -t` to test your configuration before reloading. This catches syntax errors without disrupting the running server.

---

## Caddy Configuration

Caddy automatically obtains and renews TLS certificates from Let's Encrypt. No manual certificate management is required.

### Prerequisites

- Caddy installed ([official install guide](https://caddyserver.com/docs/install))
- A domain name pointing to your server
- Ports 80 and 443 available (Caddy needs them for the ACME challenge)

### Caddyfile

Create or edit `/etc/caddy/Caddyfile`:

```caddyfile
boards.example.com {
    # Reverse proxy to the Atlantisboard application
    reverse_proxy localhost:3000 {
        # Required for WebSocket upgrades (Socket.io)
        # Caddy handles WebSocket upgrades automatically when it
        # detects the Upgrade header, but we explicitly enable
        # streaming to avoid buffering issues with SSE/WebSocket.
        flush_interval -1
    }

    # Encode responses with gzip/zstd for performance
    encode gzip zstd

    # Request body size limit — match or exceed CARD_ATTACHMENT_MAX_MB
    request_body {
        max_size 100MB
    }

    # Optional: security headers
    header {
        X-Content-Type-Options  nosniff
        X-Frame-Options         DENY
        Referrer-Policy         strict-origin-when-cross-origin
    }

    # Optional: static asset caching
    @static path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff2 *.woff *.ttf
    header @static Cache-Control "public, max-age=2592000, immutable"

    # Logging
    log {
        output file /var/log/caddy/atlantisboard.log
        format json
    }
}
```

> **Log rotation:** `atlantisboard-setup` installs `/etc/logrotate.d/atlantisboard-caddy` (daily rotation, 14 days retained) when Caddy is configured.

### Start / Reload Caddy

```bash
# Validate configuration
caddy validate --config /etc/caddy/Caddyfile

# Reload with new configuration
sudo systemctl reload caddy
```

> **Note:** Caddy handles WebSocket upgrades automatically. You do not need to configure explicit upgrade headers as you would with Nginx.

---

## Verifying WebSocket Connectivity

After configuring your reverse proxy, verify that WebSocket connections work:

1. Open Atlantisboard in your browser.
2. Open the browser developer tools (F12) → **Network** tab.
3. Filter by "WS" (WebSocket).
4. You should see a WebSocket connection to `/socket.io/` with status **101 Switching Protocols**.

If you see repeated failed connection attempts or 400 errors, double-check:
- The `Upgrade` and `Connection` headers in your Nginx config.
- That `TRUST_PROXY_HOPS=1` is set in your `.env` file.
- That `CORS_ORIGIN` matches your public domain exactly (including the scheme).

---

## Common Issues

| Problem | Solution |
|---------|----------|
| 502 Bad Gateway | Atlantisboard is not running or is listening on a different port. Check `docker compose ps` and your `PORT` variable. |
| WebSocket connection fails | Ensure `proxy_http_version 1.1` and the `Upgrade`/`Connection` headers are set (Nginx). |
| File uploads fail with 413 | Increase `client_max_body_size` (Nginx) or `max_size` in `request_body` (Caddy). |
| CORS errors in browser console | Set `CORS_ORIGIN` in `.env` to match your exact public domain. |
| Certificate errors | Run `sudo certbot renew --dry-run` (Nginx) or check Caddy logs for ACME errors. |
| Mixed content warnings | Ensure `APP_URL` uses `https://` and all proxy headers forward the correct protocol. |

---

## See Also

- [Environment Variables Reference](environment-variables.md) — details on `TRUST_PROXY_HOPS`, `CORS_ORIGIN`, and `APP_URL`
- [Docker Compose Installation](docker-compose-install.md) — the default deployment setup
