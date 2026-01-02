# Docker Compose Port Mapping Fix

## Issue

Error: `invalid hostPort: 3000` when running `docker compose up -d`

## Root Cause

Docker Compose v5.0.0 has stricter port mapping syntax requirements. The short-form syntax `${API_PORT:-3000}:3000` was being parsed, but Docker Compose v5 prefers explicit long-form syntax for better validation.

## Fix Applied

Changed from short-form:
```yaml
ports:
  - "${API_PORT:-3000}:3000"
```

To long-form (explicit):
```yaml
ports:
  - target: 3000
    published: "${API_PORT:-3000}"
    protocol: tcp
```

## Verification

- ✅ `docker compose config` validates successfully
- ✅ Port mapping shows correctly: `published: "3000", target: 3000, protocol: tcp`
- ✅ No "invalid hostPort" errors
- ✅ Compatible with Docker Compose v5.0.0

## Notes

- The long-form syntax is more explicit and preferred in Docker Compose v2+
- Environment variable substitution still works: `${API_PORT:-3000}`
- Default value (3000) is used if API_PORT is not set
- Protocol is explicitly set to `tcp` (default, but explicit is better)

