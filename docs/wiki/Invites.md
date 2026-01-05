# Invites

Invite links allow you to easily add team members to boards without manually adding them one by one. AtlantisBoard supports two types of invite links: one-time links and recurring links.

## Overview

Invite links provide a convenient way to grant board access to team members. When someone uses an invite link, they are automatically added to the board with a specified role and gain access to the board and its workspace.

## Invite Link Types

### One-Time Links

One-time links can be used only once. After a user accepts the invite, the link becomes invalid and cannot be used again.

**Characteristics:**
- Single use only
- Automatically invalidated after use
- Ideal for adding specific individuals
- No expiration date (unless configured)
- Disappears from the system after use

### Recurring Links

Recurring links can be used multiple times by different users. They remain active until deleted or expired.

**Characteristics:**
- Can be used multiple times
- Remain active until manually deleted or expired
- Useful for team onboarding or public access
- Can have expiration dates
- Appear in the active links list for management

## Generating Invite Links

Only users with appropriate permissions can generate invite links. Typically, Board Admins and Managers have this capability.

### Creating a One-Time Link

To generate a one-time invite link:

1. Open the board where you want to add members
2. Click the "Invite" button (typically in the board header)
3. Select "One-Time Link" option
4. Click "Generate Link"
5. The invite link appears
6. Copy the link and share it with the intended user

One-time links are generated immediately and can be copied to clipboard or shared directly.

### Creating a Recurring Link

To generate a recurring invite link:

1. Open the board where you want to add members
2. Click the "Invite" button
3. Select "Recurring Link" option
4. Optionally set an expiration date
5. Click "Generate Link"
6. The invite link appears and is added to your active links list

Recurring links are saved and can be managed from the invite dialog.

## Managing Invite Links

### Viewing Active Recurring Links

Active recurring links are displayed in the invite dialog:

1. Open the invite dialog
2. View the list of active recurring links
3. See link creation date and expiration (if set)

The list shows all recurring links for the current board that haven't expired or been deleted.

### Copying Invite Links

To copy an invite link:

1. Generate or select an invite link
2. Click the "Copy" button next to the link
3. The link is copied to your clipboard
4. A confirmation message appears

You can also manually select and copy the link text. Copied links can be shared via email, chat, or other communication methods.

### Deleting Recurring Links

To delete a recurring invite link:

1. Open the invite dialog
2. Find the recurring link in the active links list
3. Click the delete/trash icon
4. Confirm the deletion
5. The link is immediately invalidated

Deleted links can no longer be used to join the board. One-time links cannot be manually deleted as they disappear automatically after use.

## Accepting Invites

### Using an Invite Link

To accept an invite:

1. Click or navigate to the invite link
2. If not logged in, you'll be prompted to sign in or create an account
3. After authentication, you'll be automatically added to the board
4. You'll be redirected to the board

The invite acceptance process is automatic once you're authenticated.

### Automatic Board Assignment

When you accept an invite:

- You're automatically added as a board member
- You're assigned the default role (typically Viewer, unless specified)
- You gain access to the board's workspace
- The board appears in your board list

Your role can be changed later by board administrators if needed.

### Workspace Access

Accepting a board invite also grants access to the workspace containing that board:

- You can see the workspace in your workspace list
- You have access to all boards in that workspace (based on your board memberships)
- Workspace membership is automatic when you join any board in the workspace

## Invite Link Permissions

### Who Can Generate Invites

Invite link generation requires specific permissions:

- **Board Admins**: Can generate both one-time and recurring links
- **Managers**: Can generate invite links (typically both types)
- **Viewers**: Cannot generate invite links
- **Custom Roles**: Depends on the "invite.create" permission

Only users with the appropriate permission can access the invite functionality.

### Who Can Delete Invites

Recurring link deletion requires:

- **Board Admins**: Can delete any recurring links
- **Managers**: May be able to delete links they created (depends on permissions)
- **Viewers**: Cannot delete invite links

Link deletion permissions may vary based on role configuration.

## Invite Link Security

### Link Tokens

Invite links contain secure, unique tokens that:

- Are cryptographically secure
- Cannot be guessed or reverse-engineered
- Are unique to each invite
- Are validated server-side

### Link Expiration

Recurring links can have expiration dates:

- Links expire at the specified date and time
- Expired links cannot be used to join boards
- Expiration is checked server-side
- Expired links can be removed from the active links list

One-time links don't expire but become invalid after use.

### Access Control

Invite links respect board access control:

- Links can only add users to the specific board
- Users must still authenticate before joining
- Existing board members cannot use links to change their access
- Server-side validation ensures security

## Real-Time Updates

Invite link changes sync in real-time:

- New recurring links appear immediately for all users with permission to view them
- Link deletions propagate in real-time
- Multiple users can manage links simultaneously
- Changes are visible without page refresh

## Best Practices

### Link Sharing

- Share one-time links privately with specific individuals
- Use recurring links for team onboarding or known groups
- Avoid sharing links publicly unless intended
- Include context when sharing links (which board, what role, etc.)

### Link Management

- Regularly review active recurring links
- Delete recurring links that are no longer needed
- Set expiration dates for time-sensitive invites
- Monitor link usage if supported by your installation

### Security Considerations

- Treat invite links like passwords - share securely
- Use one-time links for sensitive boards
- Set expiration dates for recurring links
- Regularly audit active invite links
- Delete unused recurring links promptly

### Team Onboarding

- Create recurring links for standard team onboarding
- Document the default role assigned via invites
- Provide links through secure channels
- Inform new members about their assigned role

## Troubleshooting

### Link Not Working

If an invite link doesn't work:

- Verify the link hasn't expired (for recurring links)
- Check if the link was a one-time link that's already been used
- Ensure you're logged in to the correct account
- Confirm the link wasn't deleted
- Check if you already have access to the board

### Cannot Generate Links

If you cannot generate invite links:

- Verify you have the "invite.create" permission
- Check that you have Manager or Admin role on the board
- Confirm board access and permissions
- Contact a board administrator if needed

### Link Expired

If a recurring link has expired:

- Generate a new invite link
- Share the new link with users who need access
- Consider setting a longer expiration for future links

## Related Topics

- **[Users and Roles](Users-and-Roles)**: Understand roles assigned via invites
- **[Boards and Columns](Boards-and-Columns)**: Learn about boards you're joining
- **[Workspaces](Workspaces)**: Understand workspace access from invites
- **[Real-Time Features](Real-Time-Features)**: See how invite changes sync in real-time

