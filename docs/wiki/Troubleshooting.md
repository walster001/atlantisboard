# Troubleshooting

This guide helps you resolve common issues you may encounter while using AtlantisBoard. If you don't find a solution here, contact your administrator or check the project repository for additional support resources.

## Common Issues

### Drag and Drop Not Working

**Symptoms:**
- Cannot drag cards between columns
- Cannot reorder cards or columns
- Drag operations don't respond

**Solutions:**

1. **Check Permissions**
   - Verify you have "move cards" or "reorder columns" permission
   - Viewers typically cannot move cards
   - Check your board role in board settings

2. **Browser Compatibility**
   - Ensure you're using a modern, supported browser
   - Try a different browser to test
   - Update your browser to the latest version

3. **Browser Extensions**
   - Disable browser extensions that might interfere (ad blockers, privacy tools)
   - Try using an incognito/private window
   - Test with extensions disabled

4. **Page Refresh**
   - Refresh the page to reset the interface
   - Clear browser cache if issues persist
   - Log out and log back in

5. **Connection Issues**
   - Check your internet connection
   - Verify WebSocket connections are working
   - Check browser console for errors

### Missing Real-Time Updates

**Symptoms:**
- Changes from other users don't appear
- Need to refresh to see updates
- Real-time sync not working

**Solutions:**

1. **Check Connection**
   - Verify your internet connection is active
   - Check browser console for WebSocket errors
   - Refresh the page to reconnect

2. **Firewall/Proxy Settings**
   - Ensure WebSocket connections are allowed
   - Check corporate firewall settings
   - Verify proxy configuration allows WebSockets

3. **Browser Settings**
   - Check browser privacy/security settings
   - Ensure WebSocket connections aren't blocked
   - Try a different browser or network

4. **Server Status**
   - Verify server is running and accessible
   - Check for server maintenance notifications
   - Contact administrator if server issues are suspected

5. **Multiple Tabs**
   - Close duplicate tabs of the same board
   - Use a single tab per board for best results
   - Multiple tabs may cause update conflicts

### File Upload Failures

**Symptoms:**
- Files fail to upload
- "Upload failed" error messages
- Files don't appear after upload

**Solutions:**

1. **File Size**
   - Check file size limits (varies by file type)
   - Compress large files before uploading
   - Card attachments: Check size limits
   - Icons: Maximum 500KB
   - Background images: Maximum 5MB

2. **File Type**
   - Verify file type is supported
   - Check file extension matches file type
   - Convert to supported format if needed

3. **Permissions**
   - Verify you have upload permission
   - Check your board role (Viewers typically cannot upload)
   - Ensure you're a member of the board

4. **Network Issues**
   - Check internet connection stability
   - Try uploading smaller files to test
   - Check browser console for network errors
   - Wait and retry if network is unstable

5. **Storage Configuration**
   - Contact administrator if storage isn't configured
   - Verify Minio storage is available
   - Check storage service status

### Permission Access Errors

**Symptoms:**
- "Permission denied" errors
- Cannot access features you expect to have
- Settings or actions are unavailable

**Solutions:**

1. **Check Your Role**
   - Verify your board role in board settings
   - Check if your role has the required permissions
   - Contact board administrator if permissions seem incorrect

2. **Role Changes**
   - Your role may have been changed by an administrator
   - Check for notifications about permission changes
   - Refresh the page to see updated permissions

3. **App Admin vs Board Admin**
   - App Admin is different from Board Admin
   - Board Admins don't have app-level permissions
   - Only App Admins can access admin panel

4. **Custom Roles**
   - Check if you have a custom role with limited permissions
   - Review your role's permission set if possible
   - Contact administrator to adjust permissions

5. **Board Access**
   - Verify you're a member of the board
   - Check if you've been removed from the board
   - Ensure you have access to the workspace

### Real-Time Connection Issues

**Symptoms:**
- WebSocket connection errors
- Intermittent real-time updates
- Connection status warnings

**Solutions:**

1. **Network Connectivity**
   - Check internet connection
   - Test connection to other services
   - Verify network stability

2. **Firewall Configuration**
   - Ensure WebSocket (WS/WSS) connections are allowed
   - Check corporate firewall rules
   - Verify proxy settings

3. **Browser Compatibility**
   - Use a modern, supported browser
   - Update browser to latest version
   - Check browser WebSocket support

4. **Browser Extensions**
   - Disable extensions that might block WebSockets
   - Try incognito/private mode
   - Test with extensions disabled

5. **Server Configuration**
   - Contact administrator about server configuration
   - Verify WebSocket server is running
   - Check server logs for connection issues

### Login Issues

**Symptoms:**
- Cannot log in
- Login fails silently
- OAuth errors

**Solutions:**

1. **Credentials**
   - Verify email and password are correct
   - Check for typos in email address
   - Try password reset if available

2. **OAuth Issues**
   - Check OAuth provider (Google) is accessible
   - Verify OAuth is configured correctly
   - Try different browser or incognito mode

3. **Account Status**
   - Verify your account is active
   - Check if account is locked or disabled
   - Contact administrator if account issues persist

4. **Browser Issues**
   - Clear browser cache and cookies
   - Try different browser
   - Check browser console for errors

5. **Session Issues**
   - Clear browser session data
   - Log out and log back in
   - Check for session timeout

### Performance Issues

**Symptoms:**
- Slow page loading
- Laggy interface
- Timeouts

**Solutions:**

1. **Browser Performance**
   - Close unnecessary browser tabs
   - Clear browser cache
   - Disable resource-intensive extensions
   - Update browser to latest version

2. **Network Speed**
   - Check internet connection speed
   - Test on different network
   - Verify network isn't throttled

3. **Board Size**
   - Large boards with many cards may be slower
   - Consider organizing into multiple boards
   - Archive or remove old cards

4. **Server Load**
   - Contact administrator about server performance
   - Check for server maintenance
   - Verify server resources

5. **Browser Resources**
   - Check browser memory usage
   - Restart browser if memory is high
   - Close other applications if needed

## Browser Compatibility

### Supported Browsers

AtlantisBoard works best with modern browsers:

- **Chrome**: Latest version recommended
- **Firefox**: Latest version recommended
- **Edge**: Latest version recommended
- **Safari**: Latest version (macOS/iOS)

### Browser Requirements

- **JavaScript**: Must be enabled
- **WebSockets**: Required for real-time features
- **Local Storage**: Required for session management
- **Modern Standards**: HTML5 and CSS3 support

### Unsupported Browsers

Older browsers may not work properly:

- Internet Explorer (all versions)
- Very old browser versions
- Browsers without WebSocket support

## Getting Help

### Self-Service

1. **Documentation**: Review relevant documentation sections
2. **Error Messages**: Read error messages carefully
3. **Browser Console**: Check browser console for errors
4. **Retry**: Try the action again after a moment

### Contact Administrator

Contact your administrator for:

- **Permission Issues**: Role or permission problems
- **Server Problems**: Server errors or outages
- **Configuration Issues**: System configuration problems
- **Account Problems**: Account access or status issues

### Reporting Issues

When reporting issues, provide:

- **Description**: Clear description of the problem
- **Steps to Reproduce**: How to recreate the issue
- **Error Messages**: Exact error messages
- **Browser/Version**: Browser and version information
- **Screenshots**: Screenshots if helpful

## Prevention

### Best Practices

- **Keep Browser Updated**: Use latest browser version
- **Stable Connection**: Use stable internet connection
- **Appropriate Permissions**: Understand your role and permissions
- **Regular Backups**: Important data should have backups
- **Clear Communication**: Communicate with team about changes

### Regular Maintenance

- **Clear Cache**: Periodically clear browser cache
- **Review Permissions**: Regularly review board access
- **Update Software**: Keep browser and system updated
- **Monitor Performance**: Watch for performance degradation

## Related Topics

- **[Getting Started](Getting-Started)**: Basic setup and navigation
- **[Users and Roles](Users-and-Roles)**: Understanding permissions
- **[Real-Time Features](Real-Time-Features)**: Real-time sync troubleshooting
- **[File Management](File-Management)**: File upload issues

