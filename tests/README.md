# Test suite

## Quick start

```bash
# Unit tests only (no Mongo/Redis required)
bun test

# Full integration + security tests (Mongo replica set + Redis)
export MONGODB_TEST_URI='mongodb://127.0.0.1:27017/kanboard_test?replicaSet=rs0'
export REDIS_HOST=localhost
export REDIS_PORT=6379
# Or CI-style:
# export REDIS_URL=redis://localhost:6379
bun test --timeout 120000 --max-concurrency 1
```

When Mongo or Redis are unavailable, DB-backed suites **skip with an explicit label** in the test name (they do not hang for ~3s waiting for `/health`).

If env vars are set but services are down, `tests/setup.ts` probes Mongo/Redis (≤4s) and skips global DB hooks with a console warning instead of a 30s Mongoose hang.

## Environment variables

| Variable | Required for | Notes |
| -------- | ------------- | ----- |
| `MONGODB_URI` or `MONGODB_TEST_URI` + Redis | HTTP integration (`api.test.ts`, `permissionsPrivateBoard.test.ts`) | Server bootstrap uses `MONGODB_URI`; either URI satisfies the HTTP gate. |
| `MONGODB_TEST_URI` + Redis | `tests/integration/*` direct DB helpers | Separate test DB recommended. |
| `TEST_BASE_URL` | Optional | Reuse an already-running server (e.g. dev on `:3000`) instead of starting an ephemeral listener. |
| `NODE_ENV=test` | Auto-set by harness | Set by `tests/preload-env.ts` and `ensureTestServer()` when starting the app under test. |
| `LOG_LEVEL` | `warn` in tests | Default via `tests/preload-env.ts` and CI test job — suppresses info-level audit/redis noise in `bun test` output. Use `LOG_LEVEL=info` locally to debug server logs during integration runs. |

See also [Environment Variables Reference](../docs/wiki/environment-variables.md) and `.env.example`.

## Test categories

### Unit / pure (always run)

Files under `tests/*.test.ts` that do not import `ensureTestServer` — no external services.

**Installer** (`tests/installerLib.test.ts`): runs `tests/installer/installer-lib.harness.sh` against `packages/atlantisboard/install/lib/common.sh` — path validation, mock whiptail capture isolation (stderr, per `whiptail(1)`), `.env` newline format, and static guards (no legacy `whiptail … 3>&2 1>&2` capture redirects). No Mongo/Redis/real whiptail required. Fast subset: `bun run test:installer`.

### HTTP integration (`tests/api.test.ts`, `tests/permissionsPrivateBoard.test.ts`, `tests/integration/*`)

Use `describeDbIntegration` / `describeHttpIntegration` from `tests/helpers/integrationEnv.ts`. Require **`MONGODB_TEST_URI` + Redis**. The shared harness in `tests/helpers/testServer.ts`:

1. Starts the Express app once on an ephemeral port via `startHttpServer({ port: 0 })` on the CI runner (never assumes `:3000` when `NODE_ENV=test`).

Mutating routes use `apiInject` (`tests/helpers/integrationHttp.ts`) for CSRF token + session cookies.

### Security / permission DB tests

- `tests/permissionsWorkspaceDelete.test.ts` — `workspaces.delete` owner-only rule (`describeMongoTest`; needs `MONGODB_TEST_URI` only).
- `tests/requireSignedAssetOrAuth.test.ts` — signed-asset JWT user lock / existence checks (needs `MONGODB_TEST_URI` + running server for `getAuthToken`).

## Global setup

`bunfig.toml` preloads `tests/setup.ts`, which connects and clears the test database when `MONGODB_TEST_URI` and Redis are both configured (matches CI).

- **Do not** call `disconnectTestDatabase()` from per-file `afterAll` hooks — only `tests/setup.ts` tears down the shared Mongoose connection used by the HTTP server and other suites.
- `clearTestDatabase()` defaults to **not** waiting on `/health` (server is started once in global setup). Pass `{ waitForHttp: true }` only when the server may not be up yet.

## CI

`.github/workflows/reusable-verify.yml` provides:

| Service | How |
| ------- | --- |
| **Redis** | GitHub Actions service container `redis:7-alpine` on port 6379 |
| **MongoDB** | `docker run` `mongo:8.0.4` with `--replSet rs0`, initiated before tests |
| **Secrets** | `CI_SESSION_SECRET`, `CI_JWT_SECRET`, `CI_CSRF_SECRET`, `CI_ENCRYPTION_KEY`, `CI_MEDIA_SIGN_SECRET` (each ≥32 chars; media sign ≠ JWT) — see `.github/SECRETS.md` |

Env set for the test job: `MONGODB_URI`, `MONGODB_TEST_URI` (replica-set URI), `REDIS_HOST`, `REDIS_URL`, `NODE_ENV=test`.

Test command: `bun test --timeout 120000 --max-concurrency 1` (serial files; per-test timeout 120s). Integration `beforeAll` hooks use `INTEGRATION_HOOK_TIMEOUT_MS` (60s local / 120s CI) so server bootstrap is not cut off by Bun’s default 5s hook limit.

MinIO is **not** required for CI tests (bucket init is skipped in test).
