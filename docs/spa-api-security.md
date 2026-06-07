# SPA & API Security

Developer and operator reference for the Atlantisboard same-origin SPA security model. Covers CSRF bootstrap, cookie semantics, signed media URLs, OAuth exclusions, production CORS/TLS, and Socket.io scale-out.

Related audit IDs: API-007 through API-017 (see [ports-api-audit.md](../ports-api-audit.md)).

---

## Request pipeline (summary)

```
Browser (same origin)
  → Helmet (CSP, HSTS in production)
  → CORS (credentials, explicit CORS_ORIGIN)
  → cookie-parser
  → express-session (Redis store, sessionId cookie)
  → passport.initialize / passport.session
  → express.json / urlencoded
  → /api/v1 routing
       → [public GET asset mounts before CSRF]
       → csrfProtectionUnlessExcluded (OAuth paths excluded — AUTH-007)
       → route-group auth + rate limits
       → handler → service-layer permission checks
```

---

## Pre-auth CSRF bootstrap (API-008)

State-changing requests to public auth endpoints (`POST /auth/register`, `POST /auth/login`, password reset, `POST /auth/oauth/exchange`, etc.) require CSRF protection **before** the user has a JWT.

### Client requirement

1. Call **`GET /api/v1/csrf/token`** (safe GET; excluded from CSRF middleware) **before** the first mutating request on register/login flows.
2. The response sets:
   - `csrf-token` cookie (readable by JS; `sameSite: strict`)
   - `X-CSRF-Token` response header
   - JSON body `{ "csrfToken": "…" }`
3. On every `POST` / `PUT` / `PATCH` / `DELETE`, send the token in the **`X-CSRF-Token`** header. The header value must match the `csrf-token` cookie (double-submit). The token is also verified against a **per-session secret** stored in Redis (`Bun.CSRF`).

The SPA client (`src/client/utils/api.ts`) calls `ensureCsrfToken()` on startup and before mutating requests; third-party or test clients must replicate this bootstrap.

### Session prerequisite

CSRF issuance requires an `express-session` record. The first `GET /csrf/token` creates a session when `saveUninitialized` allows it, establishing the `sessionId` cookie needed for subsequent pre-auth mutators.

---

## Cookie model (AUTH-001, AUTH-004)

| Cookie | Purpose | `httpOnly` | `sameSite` | Notes |
|--------|---------|------------|------------|-------|
| **`sessionId`** | Redis-backed session; CSRF secret binding; OAuth `state` / return path | Yes | **`lax`** | Required for Google OAuth return navigation (cross-site redirect from Google). AUTH-004. |
| **`token`** | JWT authentication | Yes | **`strict`** | Issued on login/register/OAuth success. Primary API auth in production. |
| **`csrf-token`** | CSRF double-submit (not auth) | No | **`strict`** | Paired with `X-CSRF-Token` header; 1-hour max age. |

**Why two SameSite values:** OAuth callback is a cross-site top-level navigation. `sessionId` with `sameSite: lax` is sent on that redirect so Passport can validate OAuth `state` and restore `oauthReturnTo`. Mutating API auth relies on the JWT (`strict`) plus session-bound CSRF, not on cross-site cookie delivery.

**Session fixation:** `regenerateSession` runs on login; CSRF secret is per session (AUTH-001).

---

## OAuth CSRF exemption (API-010, AUTH-007)

Browser OAuth redirects cannot send `X-CSRF-Token`. These paths are **excluded** from CSRF middleware (`src/server/routes/index.ts`):

- `GET /api/v1/auth/google`
- `GET /api/v1/auth/google/callback`

**Mitigation:** Passport Google OAuth20 validates the **`state`** parameter on callback. Invalid or missing `state` causes authentication failure (logged as e.g. "denied or invalid state").

### Periodic review checklist

Run after Passport/`passport-google-oauth20` upgrades, OAuth config changes, or quarterly:

- [ ] `CSRF_EXCLUDED_PATHS` in `src/server/routes/index.ts` contains **only** `/auth/google` and `/auth/google/callback` (no broad wildcards).
- [ ] Google strategy is registered with `session: true` so `state` is session-bound.
- [ ] `sessionId` cookie remains `sameSite: 'lax'` (`src/server/middleware/session.ts` AUTH-004 comment intact).
- [ ] OAuth routes use `authRateLimiter`.
- [ ] `GOOGLE_OAUTH_BROWSER_ORIGIN` / callback URL alignment documented in [google-oauth wiki](wiki/google-oauth.md).
- [ ] No new state-changing GET routes added under `/auth/*` without CSRF or explicit threat-model review.

---

## Signed media URLs & `MEDIA_SIGN_SECRET` rotation (API-009)

Public GET routes for branding, fonts, board backgrounds, import-inline icons, and avatars use `requireSignedAssetOrAuth`. Signed URLs bypass CSRF by design (safe GET + HMAC).

### TTL

Default signed URL lifetime: **24 hours** (`DEFAULT_TTL_SECONDS = 86_400` in `src/server/utils/signedAssetUrl.ts`). Minimum enforced TTL when minting: **60 seconds**. URLs include `exp` (Unix seconds) and `sig` (HMAC-SHA256 over `path:exp`).

`MEDIA_SIGN_SECRET` must be **distinct from `JWT_SECRET`**; production startup enforces this (`assertProductionSecrets`).

### Rotation runbook (compromise or scheduled)

1. **Generate** a new secret (≥32 random bytes; store in secrets manager).
2. **Deploy** updated `MEDIA_SIGN_SECRET` to all app instances simultaneously (rolling deploy is OK only if old secret is retained briefly — see step 4).
3. **Restart** app processes so `signingSecret()` picks up the new value.
4. **Invalidate old URLs:** After rotation, all URLs signed with the previous secret fail verification immediately. Plan for:
   - Users refreshing pages (login branding, board backgrounds in `<img>` tags).
   - Re-minting: authenticated flows and server-side `createSignedAssetUrl` / `rewriteBrandingPathToSigned` issue new URLs on next request.
5. **Optional dual-secret window:** Not implemented in code today. For zero-downtime rotation, a future enhancement could verify against current + previous secret for max TTL (24h). Until then, expect up to one TTL of broken images if rotating without coordinated refresh.
6. **Audit:** Review MinIO access logs and app logs for abnormal signed-URL fetch volume after rotation.
7. **Do not** reuse the compromised secret; rotate `JWT_SECRET` separately if JWT signing was also exposed.

---

## Production CORS (API-007)

`CORS_ALLOW_MISSING_ORIGIN` defaults to **`false`**.

| Setting | Effect |
|---------|--------|
| `false` (default, **required in production**) | Credentialed API calls without an `Origin` header are rejected. Browsers and installed PWAs send `Origin`. |
| `true` | Allows non-browser automation (curl, scripts) without `Origin` while still requiring JWT + CSRF for mutators. |

**Production policy:** Keep `CORS_ALLOW_MISSING_ORIGIN=false` unless a documented server-to-server integration uses a separate auth model. See [environment-variables.md](wiki/environment-variables.md).

`CORS_ORIGIN` must list explicit origins; wildcards are blocked at production startup (`assertProductionCorsConfig`).

---

## TLS and HSTS (Part 3 P2)

Terminate TLS at a reverse proxy (Nginx, Caddy) in production. See [reverse-proxy.md](wiki/reverse-proxy.md).

The app sets **HSTS** via Helmet when `NODE_ENV=production`:

```ts
strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true }
```

(`src/server/index.ts`)

**Operator checklist:**

- [ ] HTTPS on public listener (443 or equivalent).
- [ ] `APP_URL`, `CORS_ORIGIN`, and `API_URL` use `https://`.
- [ ] `TRUST_PROXY_HOPS` matches proxy depth (typically `1`).
- [ ] Proxy forwards `X-Forwarded-Proto` so secure cookies and redirects are correct.
- [ ] Do not expose plain HTTP to the internet without redirect-to-HTTPS at the edge.

Helmet also enforces strict CSP in production; do not disable HSTS at the app layer without compensating proxy headers.

---

## Socket.io horizontal scaling (Part 3 P2)

Socket.io shares the **same HTTP port** as Express (`PORT`, default 3000). WebSocket upgrade path: `/socket.io/`.

For **multiple app instances** behind a load balancer:

1. **Redis** is already required for sessions, rate limits, and change-stream resume tokens.
2. **Choose one:**
   - **Sticky sessions (session affinity)** at the load balancer so a client's HTTP and WebSocket stay on one node, **or**
   - **Redis Socket.io adapter** (`@socket.io/redis-adapter`) so events broadcast across nodes (not bundled in repo today — ops must add when scaling horizontally).
3. Ensure WebSocket upgrade headers (`Upgrade`, `Connection`) are forwarded (see [reverse-proxy.md](wiki/reverse-proxy.md)).
4. Change streams run per server process; room joins still re-check permissions on `board:join` / `workspace:join`.

Single-node deployments do not need sticky sessions or a Redis adapter.

---

## API validation standard (API-013, backlog)

New and migrated route handlers should use **`parseOrThrow`** from `src/server/utils/zodValidation.ts` with **`respondZodValidationError`** in catch blocks for consistent `400 VALIDATION_ERROR` responses.

Card routes currently use `schema.parse` directly (`cards/_helpers.ts`); standardizing on `parseOrThrow` is a **backlog consistency item**, not a security defect.

---

## Accepted risks (P3 — no code change)

| ID | Endpoint / area | Risk | Acceptance rationale |
|----|-----------------|------|----------------------|
| **API-014** | `GET /health` | Returns timestamp | Standard liveness probe; no sensitive data. |
| **API-015** | `GET /users/vapid-public-key` | Unauthenticated | VAPID public key is intentionally public for web push subscription. |
| **API-016** | `GET /api/v1/test` | Dev test endpoint | Registered only when `NODE_ENV !== 'production'`. |
| **API-017** | `GET /themes/` | Mounted before CSRF middleware | Read-only GET; no state change. |

---

## Control references

| ID | Topic | Location |
|----|-------|----------|
| AUTH-001 | Per-session CSRF secret | `src/server/middleware/csrf.ts`, `session.ts` |
| AUTH-004 | Session `sameSite: lax` for OAuth | `src/server/middleware/session.ts` |
| AUTH-007 | OAuth CSRF exclusion | `src/server/routes/index.ts` |
| API-008 | CSRF bootstrap | This doc; `src/server/routes/csrf.ts`; `src/client/utils/api.ts` |
| API-009 | Signed assets | `src/server/utils/signedAssetUrl.ts`; rotation runbook above |
| API-010 | OAuth review | Checklist above |

---

## See also

- [Environment variables](wiki/environment-variables.md) — `CORS_*`, `MEDIA_SIGN_SECRET`, secrets checklist
- [Reverse proxy setup](wiki/reverse-proxy.md) — TLS, WebSocket, `TRUST_PROXY_HOPS`
- [Real-time collaboration](wiki/realtime.md) — change streams and Socket.io architecture
- [Google OAuth](wiki/google-oauth.md) — end-user OAuth flows
- [ports-api-audit.md](../ports-api-audit.md) — full audit register and verification commands
