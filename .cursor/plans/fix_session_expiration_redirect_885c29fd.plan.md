---
name: Fix Session Expiration Redirect
overview: Implement immediate redirect to login page when session expires (401 from /auth/me), ensuring expired sessions don't remain open. Add redirect logic in useAuth hook and enhance client.ts to handle 401 errors properly.
todos:
  - id: "1"
    content: Add useNavigate hook to useAuth.tsx and import react-router-dom
    status: completed
  - id: "2"
    content: Modify initializeSession() in useAuth.tsx to detect 401 errors and redirect immediately
    status: completed
    dependencies:
      - "1"
  - id: "3"
    content: Add OAuth callback protection to prevent redirect during OAuth processing
    status: completed
    dependencies:
      - "2"
  - id: "4"
    content: Enhance error handling in client.ts getSession() to properly identify 401 status
    status: completed
  - id: "5"
    content: Add route check to prevent redirect if already on /auth page
    status: completed
    dependencies:
      - "2"
---

# Fix Session Expiration Redirect

## Problem

When `/auth/me` returns 401 (session expired), the application clears tokens but doesn't immediately redirect to login. This leaves the session in an inconsistent state until React state updates propagate, causing a delay and potential race conditions.

## Solution Overview

1. Add immediate redirect in `useAuth.tsx` when `getSession()` returns 401
2. Enhance `client.ts` to detect 401 errors from `/auth/me` specifically
3. Ensure redirect doesn't interfere with OAuth callbacks
4. Add proper cleanup when session expires

## Implementation Details

### 1. Update `src/hooks/useAuth.tsx`

**Changes:**

- Import `useNavigate` from `react-router-dom`
- In `initializeSession()` function (lines 204-247):
- When `getSession()` returns an error with status 401, immediately redirect to `/auth`
- Clear session state before redirecting
- Add check to prevent redirect during OAuth callback processing
- In OAuth callback handler (lines 121-201):
- If `getSession()` fails with 401 during OAuth processing, redirect to `/auth` with error state

**Key modifications:**

```typescript
// Add at top
import { useNavigate } from 'react-router-dom';

// In AuthProvider component, add:
const navigate = useNavigate();

// In initializeSession(), after getSession() call:
if (error && error.message?.includes('401') || /* check for 401 status */) {
  // Clear state
  setSession(null);
  setUser(null);
  setIsAppAdmin(false);
  api.clearAuth();
  // Redirect immediately
  navigate('/auth', { replace: true });
  setLoading(false);
  return;
}
```



### 2. Update `src/integrations/api/client.ts`

**Changes:**

- Enhance `getSession()` method (lines 220-265) to return more detailed error information
- Add status code detection in error handling
- When `/auth/me` returns 401, ensure error is properly propagated with status information

**Key modifications:**

```typescript
// In getSession() method, enhance error handling:
const result = await this.request<{...}>('/auth/me');

if (result.error) {
  // Check if it's a 401 error
  const is401 = result.error.message?.includes('401') || 
                result.error.message?.includes('Unauthorized');
  
  this.clearAuth();
  return { 
    data: { session: null }, 
    error: is401 ? new Error('401: Session expired') : result.error 
  };
}
```

**Alternative approach:** Add a callback mechanism for 401 errors that can be set by the auth hook, but this adds complexity. The simpler approach is to handle redirect in `useAuth.tsx` based on error detection.

### 3. Handle Edge Cases

**OAuth Callback Protection:**

- Ensure redirect doesn't happen during OAuth callback processing
- Check `window.location.hash` for OAuth tokens before redirecting
- In `useAuth.tsx`, add guard in `initializeSession()` to skip redirect if OAuth callback is in progress

**Multiple 401 Handling:**

- Ensure redirect only happens once (use a flag or check current route)
- Don't redirect if already on `/auth` page

## Files to Modify

1. **[src/hooks/useAuth.tsx](src/hooks/useAuth.tsx)**

- Add `useNavigate` import and hook usage
- Modify `initializeSession()` to redirect on 401
- Add OAuth callback protection

2. **[src/integrations/api/client.ts](src/integrations/api/client.ts)**

- Enhance error handling in `getSession()` to properly identify 401 errors
- Ensure error messages include status information

## Testing Considerations

- Test session expiration scenario: manually expire token, verify immediate redirect
- Test OAuth callback: ensure redirect doesn't interfere with OAuth flow
- Test normal session: ensure valid sessions still work correctly
- Test refresh token failure: when refresh fails, should redirect to login

## Flow Diagram

```mermaid
flowchart TD
    A[User makes request] --> B{Has access token?}
    B -->|No| C[Redirect to /auth]
    B -->|Yes| D[Call /auth/me]
    D --> E{Response status?}
    E -->|200 OK| F[Session valid, continue]
    E -->|401 Unauthorized| G[Clear auth tokens]
    G --> H[Clear user state]
    H --> I[Redirect to /auth immediately]
    E -->|Other error| J[Handle error, no redirect]
    
    K[OAuth callback] --> L{Processing OAuth?}
    L -->|Yes| M[Skip redirect, process callback]
    L -->|No| D
```



## Success Criteria

- When `/auth/me` returns 401, user is immediately redirected to `/auth`
- No delay or "session appears valid" state
- OAuth callbacks are not interrupted
- Valid sessions continue to work normally