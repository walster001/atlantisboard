---
name: Fix board import payload size limit
overview: Increase Express body parser size limit to handle large board import payloads that exceed the default 100kb limit.
todos:
  - id: increase_json_limit
    content: "Update express.json() middleware in backend/src/index.ts to include limit: '50mb' parameter"
    status: pending
  - id: increase_urlencoded_limit
    content: "Update express.urlencoded() middleware in backend/src/index.ts to include limit: '50mb' parameter"
    status: pending
---

# Fix board

import payload size limit

## Problem

Board import fails with `PayloadTooLargeError: request entity too large` because Express JSON body parser defaults to 100kb limit, but import payloads (with inline button icons, large descriptions, many cards) can exceed this.

## Root Cause

In `backend/src/index.ts` line 46, `express.json()` is called without a `limit` parameter, so it uses the default 100kb limit.

## Solution

Increase the JSON body parser limit for the import endpoint specifically, or globally with a reasonable limit (e.g., 10-50MB).

## Implementation

### File: `backend/src/index.ts`

Update the JSON body parser middleware to include a size limit that accommodates large board imports.**Option 1 (Recommended): Increase limit globally** - Simpler and handles future large payloads

- Modify line 46 to: `express.json({ limit: '50mb' })(req, res, next);`
- Also update urlencoded parser on line 48: `express.urlencoded({ extended: true, limit: '50mb' });`

**Option 2: Route-specific limit** - Only increase for import route

- Keep default limit globally
- Add a middleware specifically for `/api/boards/import` route with higher limit
- More complex but preserves smaller limits elsewhere

**Recommendation**: Use Option 1 with 50MB limit, as:

- Board imports are the largest payloads in the app
- 50MB is reasonable for modern servers
- Simpler to maintain
- Other endpoints won't be affected by the higher limit (they'll just have more headroom)

## Notes