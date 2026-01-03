# Audit Logs

Audit logs provide a comprehensive record of board member and permission changes. They track who was added or removed from boards, role changes, and provide accountability and compliance tracking.

## Overview

Audit logs automatically record important board membership and permission activities. They provide a historical record that can be used for:

- **Compliance**: Meeting regulatory and organizational compliance requirements
- **Accountability**: Tracking who made changes and when
- **Security**: Monitoring access changes and potential security issues
- **Auditing**: Reviewing board access and permission history

## Tracked Actions

Audit logs track the following board member activities:

### Member Added

When a user is added to a board:

- **Action Type**: "added"
- **Target User**: The user who was added
- **Actor**: The user who added them (or System if automatic)
- **Timestamp**: When the addition occurred
- **Role**: The role assigned to the new member

Member additions are logged whether they're added manually or via invite links.

### Member Removed

When a user is removed from a board:

- **Action Type**: "removed"
- **Target User**: The user who was removed
- **Actor**: The user who removed them (or System if automatic)
- **Timestamp**: When the removal occurred

Member removals are logged to track access revocation.

### Role Changed

When a board member's role is changed:

- **Action Type**: "role_changed"
- **Target User**: The user whose role changed
- **Actor**: The user who changed the role
- **Old Role**: The previous role
- **New Role**: The new role
- **Timestamp**: When the change occurred

Role changes are logged to track permission modifications.

## Accessing Audit Logs

Audit logs are accessible from board settings:

1. Open the board
2. Click the settings icon
3. Navigate to the "Audit Log" tab
4. View the audit log entries

**Permission Required**: Only users with audit log viewing permission can access audit logs. Typically, this is Board Admins only.

## Audit Log Entries

Each audit log entry includes:

- **Action Type**: The type of action (added, removed, role_changed)
- **Target User**: The user affected by the action
  - Full name (if available)
  - Email address
  - Avatar (if available)
- **Actor**: The user who performed the action
  - Full name (if available)
  - Email address
  - Avatar (if available)
  - "System" for system-generated actions
- **Old Role**: Previous role (for role changes)
- **New Role**: New role (for role changes)
- **Timestamp**: When the action occurred
- **Formatted Time**: Human-readable time (e.g., "2 hours ago", "Yesterday")

Entries are displayed in reverse chronological order (most recent first).

## Audit Log Retention

Audit logs can be configured with retention settings:

### Retention Options

- **30 Days**: Logs are retained for 30 days
- **60 Days**: Logs are retained for 60 days
- **90 Days**: Logs are retained for 90 days
- **Never Expire**: Logs are retained indefinitely

Retention settings are configured at the board level by Board Admins.

### Setting Retention

To configure audit log retention:

1. Open board settings
2. Navigate to the Audit Log tab
3. Find the retention settings
4. Select a retention period
5. Save changes

Retention settings apply to future log entries. Existing entries are not affected immediately but will be cleaned up according to the retention policy.

## Viewing Audit Logs

### Log Display

Audit logs are displayed in a list format:

- **Chronological Order**: Most recent entries first
- **Pagination**: Logs are paginated for performance
- **Filtering**: May support filtering by action type or user (if available)
- **Search**: May support searching for specific users or actions (if available)

### Entry Details

Each entry shows:

- **Icon**: Visual indicator of action type
  - Plus icon for additions (green)
  - Minus icon for removals (red)
  - Arrow icon for role changes (blue)
- **Action Description**: Human-readable description of the action
- **User Information**: Target and actor user details
- **Role Information**: Old and new roles (for role changes)
- **Timestamp**: When the action occurred

### Navigation

Audit logs support pagination:

- **Next Page**: View older entries
- **Previous Page**: View newer entries
- **Page Numbers**: Jump to specific pages
- **Entry Count**: Total number of log entries

Pagination helps manage large audit logs efficiently.

## Audit Log Permissions

Access to audit logs is restricted:

- **Viewing Logs**: Requires "board.settings.audit" permission (typically Board Admins)
- **Configuring Retention**: Requires board administration permissions
- **Viewing Details**: All logged information is visible to users with access

Audit logs are read-only - they cannot be edited or deleted by users (except through retention policies).

## Use Cases

### Compliance

Audit logs help meet compliance requirements:

- **Access Tracking**: Document who has access to boards
- **Change History**: Maintain records of access changes
- **Accountability**: Identify who made changes
- **Retention**: Meet data retention requirements

### Security Monitoring

Audit logs support security monitoring:

- **Unusual Activity**: Identify unexpected access changes
- **Access Reviews**: Regular reviews of board access
- **Incident Investigation**: Investigate security incidents
- **Access Audits**: Periodic access audits

### Team Management

Audit logs assist with team management:

- **Onboarding Tracking**: Track when team members are added
- **Offboarding Verification**: Verify removal of departed team members
- **Role Changes**: Monitor permission changes
- **Access History**: Review access patterns

## Best Practices

### Regular Reviews

- **Periodic Reviews**: Regularly review audit logs for unusual activity
- **Access Audits**: Conduct periodic access audits
- **Compliance Checks**: Verify compliance with retention policies
- **Security Monitoring**: Monitor for security-relevant changes

### Retention Policies

- **Appropriate Retention**: Set retention based on organizational needs
- **Compliance Requirements**: Consider regulatory requirements
- **Storage Considerations**: Balance retention with storage needs
- **Regular Cleanup**: Ensure retention policies are working correctly

### Access Control

- **Limit Access**: Restrict audit log access to authorized users
- **Review Permissions**: Regularly review who can access audit logs
- **Secure Storage**: Ensure audit logs are stored securely
- **Backup Considerations**: Consider backup and recovery needs

## Limitations

Audit logs have some limitations:

- **Scope**: Only track board member and permission changes (not card edits, etc.)
- **Retention**: Entries may be deleted based on retention policies
- **Performance**: Large logs may require pagination
- **Read-Only**: Logs cannot be edited or manually modified

For detailed activity tracking beyond membership changes, consider other logging or monitoring solutions.

## Related Topics

- **[Users and Roles](Users-and-Roles)**: Understanding role changes in audit logs
- **[Boards and Columns](Boards-and-Columns)**: Board settings and audit log access
- **[Best Practices](Best-Practices)**: Recommendations for audit log usage

