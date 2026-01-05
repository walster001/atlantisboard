# Real-Time Features

AtlantisBoard uses WebSocket-based real-time synchronization to enable seamless collaboration. Changes made by any user are instantly visible to all other users viewing the same board, workspace, or resource.

## Overview

Real-time synchronization ensures that all team members see updates as they happen, without requiring page refreshes or manual updates. This creates a collaborative experience where multiple users can work on boards simultaneously with full visibility of each other's changes.

## How Real-Time Updates Work

AtlantisBoard uses WebSocket connections to establish persistent communication between the client (your browser) and the server. When changes occur, the server broadcasts updates to all connected clients, enabling instant synchronization.

### WebSocket Connections

- **Persistent Connection**: Maintains an open connection for real-time updates
- **Automatic Reconnection**: Reconnects automatically if the connection is lost
- **Efficient Updates**: Only relevant changes are transmitted
- **Low Latency**: Updates appear within milliseconds

### Update Broadcasting

When a user makes a change:

1. The change is saved to the database
2. The server broadcasts the change via WebSocket
3. All connected clients receive the update
4. The UI updates automatically for all users

This happens for all supported operations automatically.

## Features Updated in Real-Time

### Boards

Board-level changes sync in real-time:

- **Board Creation**: New boards appear immediately in workspace lists
- **Board Updates**: Name, description, and settings changes update instantly
- **Board Deletion**: Removed boards disappear from lists immediately
- **Board Movement**: Boards moving between workspaces update in real-time

All users with access to a workspace see board changes as they happen.

### Columns

Column changes are synchronized instantly:

- **Column Creation**: New columns appear immediately on the board
- **Column Updates**: Title and property changes update in real-time
- **Column Deletion**: Deleted columns disappear instantly
- **Column Reordering**: Column position changes sync as you drag

All board members see column changes simultaneously, enabling coordinated workflow management.

### Cards

Card operations sync in real-time:

- **Card Creation**: New cards appear immediately in their columns
- **Card Updates**: Title, description, and property changes update instantly
- **Card Movement**: Cards moving between columns update in real-time
- **Card Deletion**: Deleted cards disappear immediately
- **Card Colors**: Color changes propagate instantly
- **Card Reordering**: Position changes within columns sync in real-time

Multiple users can edit different cards simultaneously without conflicts.

### Card Details

Detailed card information updates in real-time:

- **Attachments**: File uploads and deletions appear immediately
- **Subtasks**: Checklist items and completions sync instantly
- **Labels**: Label assignments and removals update in real-time
- **Due Dates**: Due date changes appear immediately
- **Assignees**: Member assignments update instantly (if enabled)

All card detail changes are visible to anyone viewing the card.

### Board Members

Member changes sync in real-time:

- **Member Addition**: New members appear in member lists immediately
- **Member Removal**: Removed members disappear instantly
- **Role Changes**: Permission updates propagate in real-time
- **Access Revocation**: Users see access changes immediately

Real-time member updates ensure all users are aware of team changes.

### User Roles and Permissions

Permission changes update in real-time:

- **Role Assignments**: Role changes take effect immediately
- **Permission Updates**: Custom role permission changes sync instantly
- **Access Changes**: Permission revocations apply in real-time
- **UI Updates**: Interface elements update based on new permissions

Users see their permission changes immediately, and affected UI elements update accordingly.

### Invite Links

Invite link changes sync in real-time:

- **Link Creation**: New recurring links appear in lists immediately
- **Link Deletion**: Deleted links disappear from lists instantly
- **Link Expiration**: Expired links update in real-time (if supported)

All users with permission to view invite links see changes as they happen.

## Conflict Resolution

When multiple users edit the same item simultaneously, AtlantisBoard uses timestamp-based conflict resolution to ensure data consistency.

### Last Update Wins

The system uses a "last update wins" approach:

- Each update includes a timestamp
- When conflicts occur, the most recent update takes precedence
- Older updates are discarded if they arrive after a newer update
- This ensures data consistency across all clients

### Timestamp Comparison

Updates include timestamps that are compared:

- Server timestamps are authoritative
- Client timestamps are normalized for comparison
- Updates are accepted or rejected based on timestamp order
- Conflicts are resolved automatically without user intervention

### Collaborative Editing

For collaborative editing scenarios:

- Users can edit different parts of cards simultaneously
- Title and description edits are independent
- Multiple users can work on the same board without interference
- Real-time updates prevent most conflicts before they occur

## Real-Time Indicators

While using AtlantisBoard, you may notice real-time updates through:

- **Instant Changes**: Updates appear without page refresh
- **Smooth Animations**: Changes animate smoothly into view
- **No Loading States**: Real-time updates don't show loading indicators
- **Immediate Feedback**: Your changes appear instantly, then sync to others

## Connection Status

Real-time features require an active WebSocket connection:

- **Automatic Connection**: Connections are established automatically when viewing boards
- **Reconnection**: Lost connections reconnect automatically
- **Fallback Behavior**: If real-time fails, the system may fall back to polling (if supported)

Most users won't need to manage connections manually - the system handles this automatically.

## Performance Considerations

Real-time updates are designed to be efficient:

- **Selective Updates**: Only relevant changes are transmitted
- **Batched Updates**: Multiple changes may be batched for efficiency
- **Optimized Payloads**: Update messages are minimal and efficient
- **Network Efficiency**: WebSocket connections are more efficient than polling

Real-time synchronization has minimal impact on performance and bandwidth usage.

## Limitations

While real-time updates cover most operations, some actions may not sync in real-time:

- **Initial Page Load**: First load requires a full data fetch
- **Offline Mode**: Real-time updates don't work when offline
- **Browser Limitations**: Some browsers may have WebSocket restrictions
- **Network Issues**: Poor network conditions may delay updates

In these cases, refreshing the page will ensure you have the latest data.

## Troubleshooting

### Updates Not Appearing

If real-time updates aren't appearing:

- Check your internet connection
- Verify WebSocket connections are allowed (check firewall/proxy settings)
- Try refreshing the page
- Check browser console for WebSocket errors
- Ensure you're viewing the same board/workspace as other users

### Delayed Updates

If updates are delayed:

- Check network latency
- Verify server connection status
- Check for browser or extension issues
- Ensure WebSocket connections are active

### Connection Issues

If you experience connection problems:

- Refresh the page to reconnect
- Check firewall/proxy settings for WebSocket support
- Verify network connectivity
- Contact your administrator if issues persist

## Best Practices

### Collaborative Workflows

- Communicate with team members when making major changes
- Be aware that others may be editing simultaneously
- Save work frequently (changes auto-save, but be mindful)
- Use comments or descriptions to document significant changes

### Monitoring Changes

- Watch for real-time updates to stay aware of team activity
- Use board views to monitor team progress
- Check member lists to see who's active
- Review audit logs for detailed change history

### Performance

- Real-time updates are efficient and shouldn't impact performance
- Multiple users can work simultaneously without issues
- Large teams can collaborate effectively with real-time sync

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Real-time column updates
- **[Cards](Cards)**: Real-time card synchronization
- **[Users and Roles](Users-and-Roles)**: Real-time permission updates
- **[Invites](Invites)**: Real-time invite link updates
- **[Audit Logs](Audit-Logs)**: Historical change tracking

