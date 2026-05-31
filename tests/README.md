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
bun test
```

When Mongo or Redis are unavailable, DB-backed suites **skip with an explicit label** in the test name (they do not hang for ~3s waiting for `/health`).

## Environment variables

| Variable | Required for | Notes |
| -------- | ------------- | ----- |
| `MONGODB_URI` or `MONGODB_TEST_URI` + Redis | HTTP integration (`api.test.ts`, `permissionsPrivateBoard.test.ts`) | Server bootstrap uses `MONGODB_URI`; either URI satisfies the HTTP gate. |
| `MONGODB_TEST_URI` + Redis | `tests/integration/*` direct DB helpers | Separate test DB recommended. |
| `TEST_BASE_URL` | Optional | Reuse an already-running server (e.g. dev on `:3000`) instead of starting an ephemeral listener. |
| `NODE_ENV=test` | Auto-set by harness | Set by `ensureTestServer()` when starting the app under test. |

See also [Environment Variables Reference](../docs/wiki/environment-variables.md) and `.env.example`.

## Test categories

### Unit / pure (always run)

Files under `tests/*.test.ts` that do not import `ensureTestServer` — no external services.

### HTTP integration (`tests/api.test.ts`, `tests/permissionsPrivateBoard.test.ts`, `tests/integration/*`)

Use `describeDbIntegration` from `tests/helpers/integrationEnv.ts`. Require **`MONGODB_TEST_URI` + Redis**. The shared harness in `tests/helpers/testServer.ts`:

1. Probes `TEST_BASE_URL` or `http://127.0.0.1:3000` (reuse dev server if healthy).
2. Otherwise starts the Express app once on an ephemeral port via `startHttpServer({ port: 0 })`.

Mutating routes use `apiInject` (`tests/helpers/integrationHttp.ts`) for CSRF token + session cookies.

### Security / permission DB tests

- `tests/permissionsWorkspaceDelete.test.ts` — `workspaces.delete` owner-only rule (`describeMongoTest`; needs `MONGODB_TEST_URI` only).
- `tests/requireSignedAssetOrAuth.test.ts` — signed-asset JWT user lock / existence checks (needs `MONGODB_TEST_URI` + running server for `getAuthToken`).

## Global setup

`bunfig.toml` preloads `tests/setup.ts`, which connects and clears the test database when `MONGODB_TEST_URI` and Redis are both configured (matches CI).

## CI

`.github/workflows/reusable-verify.yml` sets `MONGODB_TEST_URI`, `MONGODB_URI`, `REDIS_HOST`, `REDIS_URL`, and required secrets before `bun test`.
