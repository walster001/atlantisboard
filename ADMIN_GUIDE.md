# Admin Guide

## Admin Panel Access

Access the admin panel through the main navigation menu. Only users with admin privileges can access these settings.

## Configuration Management

### Authentication Settings

#### Email/Password Authentication
- **Enable/Disable**: Toggle email/password login
- **Password Requirements**: Minimum 12 characters, mixed case, numbers, special characters
- **Account Lockout**: 3 failed attempts = permanent lockout (admin unlock required)

#### Google OAuth
1. **Enable Google OAuth**: Toggle the feature
2. **Client ID**: Enter your Google OAuth Client ID
3. **Client Secret**: Enter your Google OAuth Client Secret (encrypted)
4. **Save**: Changes take effect immediately

#### Google OAuth + External MySQL
1. **Enable Feature**: Toggle external MySQL verification
2. **Database Settings**:
   - Host: MySQL server hostname
   - Port: MySQL server port (default: 3306)
   - Database: Database name
   - Username: Database username
   - Password: Database password (encrypted)
3. **User Lookup**: Configure how users are identified (email or custom field)
4. **Role Mapping**: Map database roles to application roles

#### Default Authentication Method
- Set the default login method shown to users
- Options: Email, Google, Google + External MySQL

### Rate Limiting Configuration

Configure rate limits for different endpoint types:

#### Authentication Endpoints
- **Default**: 900 attempts per minute
- **Scope**: Per user and per IP
- **Lockout**: Permanent after threshold

#### File Upload Endpoints
- **Default**: 10 uploads per minute per user
- **Scope**: Per user and per IP
- **Configurable**: Adjust based on server capacity

#### General API Endpoints
- **Default**: 1000 requests per minute per user
- **Scope**: Per user and per IP
- **Configurable**: Adjust based on usage patterns

### Login Screen Branding

Customize the login screen appearance:
- **App Name**: Custom application name
- **Logo**: Upload logo image
- **Tagline**: Add custom tagline text

## User Management

### Unlocking Accounts

1. Navigate to Admin Panel → Users
2. Find the locked account
3. Click "Unlock Account"
4. Account is immediately unlocked
5. User can attempt login again

### Viewing User Activity

1. Navigate to Admin Panel → Activity Logs
2. Filter by user, board, or activity type
3. View detailed activity history
4. Export logs if needed

### Managing Placeholder Users

Placeholder users are created during imports when email doesn't match existing users:

1. **View Placeholders**: Admin Panel → Users → Placeholders
2. **Convert**: Convert placeholder to real user when they sign up
3. **Merge**: Merge placeholder with existing user account
4. **Delete**: Remove unused placeholder users

## Activity Logs

### Viewing Activity Logs

1. **Board-Level**: Navigate to board settings → Activity
2. **Card-Level**: Open card detail → Activity tab
3. **User-Level**: User profile → Activity feed

### Activity Log Retention

- **Default**: 30 days
- **Configurable**: Set per workspace/board
- **Cleanup**: Automatic weekly cleanup respecting retention periods
- **Manual Cleanup**: Admins can manually trigger cleanup

### Activity Types

Tracked activities include:
- Card created/updated/deleted
- List created/updated/deleted
- Member added/removed
- Permission changes
- Label management
- Checklist updates
- Comment additions
- Attachment uploads

## Notification Management

### Notification Settings

- **Retention**: Notifications auto-delete after 10 days
- **Cleanup**: Weekly automatic cleanup
- **Delivery**: Configure delivery methods (in-app, push)

### Monitoring Notifications

- View notification delivery statistics
- Monitor failed deliveries
- Check notification queue status

## Background Jobs

### Automated Tasks

The system runs several background jobs:

1. **Activity Log Cleanup** (Weekly)
   - Runs every Monday at 2 AM
   - Respects per-workspace retention periods
   - Logs cleanup operations

2. **Import Job Cleanup** (Daily)
   - Runs daily at 3 AM
   - Removes completed/failed imports after 2 days

3. **Notification Cleanup** (Weekly)
   - Runs every Monday at 4 AM
   - Removes read notifications after 10 days

4. **Orphaned Attachments Cleanup** (Daily)
   - Runs daily at 5 AM
   - Removes attachments from deleted cards

5. **Reminder Delivery** (Every 15 minutes)
   - Checks for due reminders
   - Sends notifications based on user preferences
   - Handles repeat reminders for overdue tasks

### Job Monitoring

- Check job status in admin panel
- View job execution logs
- Monitor job failures and retries

## Security Best Practices

### Password Security

- Enforce strong password requirements
- Use account lockout to prevent brute force
- Regularly review locked accounts

### Session Management

- Sessions stored in Redis
- Secure session cookies (httpOnly, secure, sameSite)
- Session expiration configured via JWT

### Audit Trail

All admin actions are logged:
- Configuration changes
- User management actions
- Permission changes
- System maintenance

### Security Headers

Configured via Helmet.js:
- Content Security Policy (CSP)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (HSTS)

## Template Management

### Creating Board Templates

1. Create a board with desired configuration
2. Add sample lists, labels, and cards
3. Go to Admin Panel → Templates
4. Click "Create Template"
5. Enter template name and description
6. Select content to include
7. Save template

### Managing Templates

- View all templates
- Edit template details
- Delete unused templates
- Share templates between workspaces

## Import/Export Management

### Monitoring Imports

1. View all import jobs in Admin Panel
2. Check import status and progress
3. View import errors and warnings
4. Retry failed imports if needed

### Export Management

- Monitor export requests
- Review export logs
- Manage export file storage

## Backup and Recovery

### Database Backups

- **MongoDB**: Regular backups recommended
- **Redis**: Session data (non-critical for recovery)
- **MinIO**: File attachments backup

### Backup Strategy

1. Daily MongoDB backups
2. Weekly full system backups
3. Test restore procedures regularly
4. Store backups securely

## Troubleshooting

### Common Issues

1. **Authentication Problems**
   - Check authentication method is enabled
   - Verify OAuth credentials (if using Google)
   - Check account lockout status

2. **Performance Issues**
   - Review rate limiting settings
   - Check database indexes
   - Monitor Redis cache usage
   - Review application logs

3. **Import Failures**
   - Check file format validity
   - Review import job logs
   - Verify user permissions
   - Check database space

4. **Notification Issues**
   - Verify notification preferences
   - Check background job status
   - Review notification delivery logs

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Review activity logs
   - Check for failed background jobs
   - Review security audit logs

2. **Monthly**:
   - Update dependencies (`bun update`)
   - Security audit (`bun audit`)
   - Review and rotate secrets
   - Performance review

3. **Quarterly**:
   - Full security assessment
   - Penetration testing (recommended)
   - Backup restoration testing
   - Capacity planning

### Monitoring

- Application logs: Check for errors and warnings
- Database performance: Monitor query times
- Redis usage: Check memory and connections
- MinIO storage: Monitor disk usage
- System resources: CPU, memory, disk

## Support and Resources

- Check application logs for detailed error information
- Review audit trail for user actions
- Monitor background job execution
- Review security logs for suspicious activity

For technical issues, refer to deployment documentation or contact system administrator.

