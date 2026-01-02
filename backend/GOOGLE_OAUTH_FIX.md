# Google OAuth Login Fix

## Root Cause Analysis

The Google OAuth login was failing with "refused to connect" when redirecting to `http://127.0.0.1:3000/api/auth/google`. The root causes were:

1. **Route Only Registered When OAuth Configured**: The `/api/auth/google` route was only registered if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` were both set. If these weren't configured, the route didn't exist, causing connection issues.

2. **Server Binding**: The server wasn't explicitly bound to `0.0.0.0`, which could cause accessibility issues depending on the system configuration.

3. **No Helpful Error Messages**: When OAuth wasn't configured, users got generic connection errors instead of clear guidance.

## Fixes Applied

### 1. Always Register OAuth Routes
- The `/api/auth/google` and `/api/auth/google/callback` routes are now always registered
- If OAuth isn't configured, these routes return a helpful 503 error with clear instructions
- This ensures the endpoint is always reachable and provides actionable feedback

### 2. Explicit Server Binding
- Server now explicitly listens on `0.0.0.0` (all interfaces)
- Ensures accessibility via both `localhost` and `127.0.0.1`
- Added better startup logging to show OAuth configuration status

### 3. Improved Error Messages
- Clear error messages when OAuth isn't configured
- Startup logging shows OAuth configuration status
- Helps developers quickly identify configuration issues

## Configuration Requirements

### Backend Environment Variables

Ensure these are set in `backend/.env`:

```bash
# Required for Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional - defaults to http://127.0.0.1:3000/api/auth/google/callback
GOOGLE_CALLBACK_URL=http://127.0.0.1:3000/api/auth/google/callback

# Required - frontend origin
CORS_ORIGIN=http://127.0.0.1:8080
```

### Google Cloud Console Configuration

In your Google Cloud Console OAuth 2.0 Client ID settings:

**Authorized JavaScript origins:**
```
http://127.0.0.1:8080
http://localhost:8080
```

**Authorized redirect URIs:**
```
http://127.0.0.1:3000/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

**Important Notes:**
- Google treats `127.0.0.1` and `localhost` as different origins
- Add both if you use either in your setup
- No trailing slashes in redirect URIs
- Must match exactly (including protocol `http://`)

## Verification Steps

1. **Verify Backend is Running:**
   ```bash
   curl http://127.0.0.1:3000/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

2. **Verify OAuth Route Exists:**
   ```bash
   curl http://127.0.0.1:3000/api/auth/google
   ```
   - If configured: Redirects to Google OAuth
   - If not configured: Returns `{"error":"Google OAuth is not configured",...}`

3. **Check Backend Logs:**
   On startup, you should see:
   ```
   ✅ Google OAuth: Configured
   ```
   or
   ```
   ⚠️  Google OAuth: Not configured (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required)
   ```

4. **Test OAuth Flow:**
   - Click Google login button in frontend
   - Should redirect to Google OAuth consent screen
   - After authorization, should redirect back to frontend with tokens

## Troubleshooting

### "Refused to connect" Error

#### Backend Not Running
The most common cause is the backend server not running. Start it with:

**Using WSL (Recommended):**
```bash
cd backend
chmod +x fix-and-start.sh
./fix-and-start.sh
```

**Or manually:**
```bash
cd backend
# Ensure Node.js 20+ is active
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22  # or nvm use 20

# Fix .env line endings (Windows CRLF issue)
sed -i 's/\r$//' .env

# Rebuild native dependencies if needed
npm rebuild bcrypt

# Start server
npm run dev
```

#### Node.js Version Mismatch
If you see `SyntaxError` in `tsx` or `MODULE_NOT_FOUND` for `bcrypt`:
- **Problem**: Node.js version is too old (needs 20+)
- **Solution**: 
  ```bash
  nvm install 22  # or nvm install 20
  nvm use 22
  npm rebuild bcrypt
  ```

#### .env File Line Ending Issues
If you see `Invalid enum value` for `NODE_ENV`:
- **Problem**: Windows CRLF line endings in `.env` file
- **Solution**:
  ```bash
  sed -i 's/\r$//' backend/.env
  sed -i 's/\r//g' backend/.env
  ```

#### Wrong Port
- Verify backend is running on port 3000 (check `API_PORT` in `.env`)
- Check if port is in use: `netstat -tuln | grep :3000` (Linux) or `netstat -ano | findstr :3000` (Windows)

#### Firewall
- Check if firewall is blocking port 3000

### OAuth Route Returns 503
- **Missing credentials**: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`
- **Restart backend**: After setting env vars, restart the backend server

### Google OAuth Redirect Error
- **Mismatched redirect URI**: Ensure the redirect URI in Google Console exactly matches:
  - `http://127.0.0.1:3000/api/auth/google/callback` (or `http://localhost:3000/...`)
  - Must match `GOOGLE_CALLBACK_URL` in backend `.env` (or default)
- **Missing JavaScript origin**: Add frontend URL to Authorized JavaScript origins in Google Console

### CORS Errors
- **Wrong CORS_ORIGIN**: Ensure `CORS_ORIGIN` in backend `.env` matches your frontend URL
- Default is `http://127.0.0.1:8080` - update if using different URL

## Deployment Notes

For production deployment:

1. **Update Google Console:**
   - Add production domain to Authorized JavaScript origins
   - Add production callback URL to Authorized redirect URIs

2. **Update Environment Variables:**
   ```bash
   GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
   CORS_ORIGIN=https://your-domain.com
   ```

3. **Use HTTPS:**
   - Google OAuth requires HTTPS in production
   - Ensure your production server uses HTTPS
   - Update all URLs to use `https://`

## Files Modified

- `backend/src/routes/auth.ts`: Always register OAuth routes with helpful errors
- `backend/src/index.ts`: Explicit server binding and improved logging

