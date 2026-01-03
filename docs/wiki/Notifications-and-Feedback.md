# Notifications and Feedback

AtlantisBoard provides feedback through toast notifications and real-time updates. These notifications inform you of actions, errors, and system events as you use the application.

## Overview

The notification system keeps you informed about:

- **Action Results**: Success or failure of operations
- **Real-Time Updates**: Changes made by other users
- **Errors**: Problems that need attention
- **System Events**: Important system notifications

All notifications appear as toast notifications in the corner of your screen and disappear automatically after a few seconds.

## Toast Notifications

Toast notifications are temporary messages that appear in the corner of the screen to provide feedback about actions and events.

### Notification Types

Toast notifications come in different types:

- **Success**: Green notifications for successful operations
- **Error**: Red notifications for errors and failures
- **Info**: Blue notifications for informational messages
- **Warning**: Yellow/orange notifications for warnings

Notification colors help you quickly understand the message type.

### Notification Behavior

Toast notifications:

- **Auto-Dismiss**: Disappear automatically after a few seconds
- **Manual Dismiss**: Can be closed manually by clicking the X button
- **Non-Blocking**: Don't prevent you from continuing work
- **Stacked**: Multiple notifications stack vertically
- **Temporary**: Don't persist between page refreshes

Notifications are designed to be informative but unobtrusive.

## Common Notifications

### Success Notifications

Success notifications confirm that actions completed successfully:

- **"Files uploaded successfully"**: File uploads completed
- **"Card created"**: New card was created
- **"Theme applied"**: Theme was applied to board
- **"Changes saved"**: Settings or edits were saved
- **"Member added"**: User was added to board
- **"Link copied"**: Text was copied to clipboard

Success notifications provide confirmation that your actions worked as expected.

### Error Notifications

Error notifications indicate problems that need attention:

- **"Upload failed"**: File upload encountered an error
- **"Permission denied"**: You don't have permission for an action
- **"Invalid file type"**: Uploaded file type is not supported
- **"File too large"**: Uploaded file exceeds size limits
- **"Network error"**: Connection problem occurred
- **"Validation error"**: Input validation failed

Error notifications include error messages to help you understand and fix the problem.

### Information Notifications

Information notifications provide helpful context:

- **"Role updated"**: A team member's role changed
- **"Access changed"**: Your permissions were modified
- **"Theme removed"**: A theme was removed from a board
- **"Link deleted"**: An invite link was deleted

Information notifications keep you informed about system events.

### Real-Time Update Notifications

Real-time notifications inform you of changes made by others:

- **"Role updated: [Name] role changed from [old] to [new]"**: Team member role change
- **"Access granted: You have been promoted to [role]"**: Your permissions increased
- **"Access removed: You have been removed from this board"**: Your access was revoked
- **"Member added: [Name] joined the board"**: New team member added

Real-time notifications help you stay aware of team activity.

## Real-Time Feedback

In addition to notifications, real-time updates provide visual feedback:

### Visual Updates

Changes appear immediately without notifications:

- **Card Movements**: Cards move in real-time as others drag them
- **Column Changes**: Column updates appear instantly
- **Content Edits**: Edits appear as they're made
- **Member Lists**: Member lists update automatically

Visual updates provide immediate feedback about collaborative activity.

### Status Indicators

Some actions show status indicators:

- **Loading States**: Spinners or loading text during operations
- **Progress Indicators**: Progress bars for long operations
- **Button States**: Buttons may show loading or disabled states
- **Connection Status**: Real-time connection status (if visible)

Status indicators provide feedback during operations.

## Error Handling

### Error Messages

Error notifications include descriptive messages:

- **Specific Errors**: Explain what went wrong
- **Actionable Guidance**: Suggest how to fix the problem
- **User-Friendly Language**: Avoid technical jargon when possible
- **Context**: Include relevant details about the error

Error messages are designed to be helpful and actionable.

### Common Error Scenarios

**Permission Errors:**
- "You don't have permission to perform this action"
- "Access denied"
- Occurs when you try to perform actions you're not authorized for

**Validation Errors:**
- "Please enter a valid email address"
- "File size exceeds limit"
- "Invalid file type"
- Occur when input doesn't meet requirements

**Network Errors:**
- "Network error: Please check your connection"
- "Failed to connect to server"
- Occur during connection problems

**File Upload Errors:**
- "Upload failed: [reason]"
- "File too large: Maximum size is [size]"
- "Invalid file type: Only [types] are allowed"
- Occur during file upload problems

## User-Friendly Feedback

AtlantisBoard prioritizes user-friendly feedback:

### Clear Messages

- **Plain Language**: Avoid technical jargon
- **Actionable**: Tell users what they can do
- **Specific**: Provide relevant details
- **Concise**: Keep messages brief but informative

### Helpful Context

- **What Happened**: Explain what occurred
- **Why It Happened**: Provide context when helpful
- **What to Do**: Suggest next steps when applicable
- **Where to Go**: Direct users to relevant settings or features

### Consistent Experience

- **Uniform Style**: Consistent notification appearance
- **Predictable Behavior**: Notifications behave consistently
- **Appropriate Timing**: Notifications appear at appropriate times
- **Non-Intrusive**: Don't interrupt workflow unnecessarily

## Notification Best Practices

### For Users

- **Read Notifications**: Pay attention to error messages
- **Act on Errors**: Address errors promptly
- **Learn from Feedback**: Understand what actions are allowed
- **Check Permissions**: Understand your role and permissions

### For Administrators

- **Monitor Errors**: Watch for recurring error patterns
- **User Guidance**: Help users understand error messages
- **Permission Management**: Ensure appropriate permissions are set
- **System Health**: Monitor system notifications for issues

## Troubleshooting

### Notifications Not Appearing

If notifications don't appear:

- Check browser console for errors
- Verify JavaScript is enabled
- Check browser notification settings
- Try refreshing the page
- Check for browser extensions blocking notifications

### Too Many Notifications

If you receive too many notifications:

- Some notifications are necessary for feedback
- Real-time updates may generate multiple notifications
- Consider your notification preferences if available
- Contact your administrator if notifications are excessive

### Error Messages Unclear

If error messages are unclear:

- Read the full error message for details
- Check related documentation
- Contact your administrator for clarification
- Review your permissions and role

## Related Topics

- **[Real-Time Features](Real-Time-Features)**: Understanding real-time updates
- **[Users and Roles](Users-and-Roles)**: Permission-related notifications
- **[Troubleshooting](Troubleshooting)**: Resolving notification issues
- **[Cards](Cards)**: Card operation notifications

