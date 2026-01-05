# Users and Roles

AtlantisBoard uses a comprehensive role-based permission system that controls what actions users can perform. Understanding roles and permissions is essential for effective team collaboration and security.

## Understanding Roles

Roles define permission levels that determine what actions users can perform on boards and in the application. There are two types of roles:

1. **Built-in Roles**: Predefined roles with standard permission sets
2. **Custom Roles**: User-created roles with granular, configurable permissions

Roles are assigned at the board level, meaning a user can have different roles on different boards. Additionally, App Admin status is a global application-level role.

## Built-in Roles

### App Admin

**App Admin** is a special global role that provides full access to all features and settings across the entire application.

**Key Characteristics:**
- Global role (not board-specific)
- Full access to all boards and workspaces
- Access to application-level admin panel
- User management capabilities
- Application branding and settings management
- Cannot be assigned through board member roles
- Must be set at the application level

**App Admin Capabilities:**
- View and manage all users in the system
- Add or remove App Admin status from users
- Access admin panel for application settings
- Manage application branding, fonts, and login customization
- Full access to all boards (bypasses board-level permissions)

**Important Distinction:** App Admin is separate from Board Admin. A Board Admin has full control over a specific board, but App Admin has global access. App Admins automatically have all permissions on all boards.

### Board Admin

**Board Admin** is a board-level role with full administrative control over a specific board.

**Capabilities:**
- Full control over board settings and configuration
- Manage board members (add, remove, change roles)
- Create, edit, and delete columns
- Create, edit, and delete cards
- Manage board themes and backgrounds
- Create and manage board labels
- Create and manage invite links
- Access audit logs
- All board-level permissions

Board Admins have the highest level of control within their assigned boards but do not have application-level admin access.

### Manager

**Manager** is a board-level role with limited administrative capabilities, focused on member management.

**Capabilities:**
- View board and board settings
- Access members tab in board settings
- Add and remove board members (limited to viewers only)
- Create and delete invite links
- View attachments and download them
- View subtasks/checklists
- Cannot edit board content (cards, columns, labels)
- Cannot change member roles (except adding/removing viewers)

Managers are useful for team leads who need to manage team membership but don't need full board administrative control.

### Viewer

**Viewer** is a read-only board-level role with minimal permissions.

**Capabilities:**
- View board content (cards, columns, labels)
- View board members
- View and download attachments
- View subtasks/checklists
- Cannot create, edit, or delete any content
- Cannot manage members
- Cannot access board settings (except viewing members)

Viewers are ideal for stakeholders, clients, or team members who need visibility but shouldn't modify content.

## Custom Roles

Custom roles allow you to create role definitions with granular permissions tailored to your team's specific needs.

### Creating Custom Roles

To create a custom role:

1. Access the Admin Panel (App Admin required)
2. Navigate to Permissions settings
3. Click "Create Role" or "New Role"
4. Enter a role name and description
5. Select permissions for the role
6. Save the role

Custom roles can be assigned to board members just like built-in roles. They provide fine-grained control over what actions users can perform.

### Permission Categories

Custom roles organize permissions into logical categories:

- **Boards**: Board-level actions (view, edit, delete, move, settings)
- **Columns**: Column management (create, edit, delete, reorder, colors)
- **Cards**: Card operations (create, edit, delete, move, colors, due dates)
- **Labels**: Label management (create, edit, delete, assign, unassign)
- **Attachments**: File operations (view, upload, download, delete)
- **Subtasks**: Checklist operations (view, create, toggle, delete)
- **Members**: Member management (view, add, remove, change roles)
- **Invites**: Invite link management (create, delete)
- **Settings**: Board settings access (members, themes, labels, audit logs)

Each category contains multiple granular permissions that can be individually enabled or disabled.

### Permission Granularity

Custom roles support very specific permissions, such as:

- Allowing users to create cards but not delete them
- Permitting label viewing but not label creation
- Enabling attachment downloads but not uploads
- Allowing column reordering but not column deletion

This granularity enables precise access control for complex team structures.

### Editing Custom Roles

To modify a custom role:

1. Access the Admin Panel
2. Navigate to Permissions settings
3. Select the custom role
4. Modify permissions as needed
5. Save changes

Changes to custom roles apply to all board members assigned that role. Real-time updates notify affected users of permission changes.

### Deleting Custom Roles

Custom roles can be deleted if they're not currently assigned to any board members:

1. Access the Admin Panel
2. Navigate to Permissions settings
3. Select the custom role
4. Delete the role
5. Confirm deletion

If a custom role is assigned to any board members, you must first change those members to a different role before deleting the custom role.

## Board-Level vs App-Level Permissions

Understanding the distinction between board-level and app-level permissions is crucial:

### Board-Level Permissions

Board-level permissions apply to specific boards:

- Assigned through board membership
- Different roles can be assigned on different boards
- Examples: Board Admin, Manager, Viewer, Custom Roles
- Control actions within individual boards

### App-Level Permissions

App-level permissions apply globally across the application:

- Only available to App Admins
- Control application-wide settings and features
- Examples: User management, application branding, global settings
- Cannot be granted through board roles

**Important:** Board Admins do NOT have app-level permissions. Only users with the App Admin flag have access to application-level features.

## App Admin Management

App Admin status is managed separately from board roles.

### Viewing App Admins

To see current App Admins:

1. Access the Admin Panel (App Admin required)
2. Navigate to Permissions settings
3. Select "App Admin" role
4. View the list of current App Admins

The App Admin list shows all users with global administrative access.

### Adding App Admins

To grant App Admin status:

1. Access the Admin Panel
2. Navigate to Permissions settings
3. Select "App Admin" role
4. Click "Add App Admin"
5. Search for and select a user
6. Confirm the addition

The user immediately receives App Admin status and full access to all features.

### Removing App Admins

To remove App Admin status:

1. Access the Admin Panel
2. Navigate to Permissions settings
3. Select "App Admin" role
4. Find the user in the App Admin list
5. Click remove/delete
6. Confirm the removal

The user retains their board-level roles but loses application-level admin access.

**Security Note:** Ensure at least one App Admin remains in the system to maintain administrative access.

## Assigning Roles to Board Members

Roles are assigned when adding members to boards:

1. Open board settings
2. Navigate to Members tab
3. Add a new member or edit an existing member
4. Select a role from the dropdown
5. Save changes

Available roles include:
- Board Admin
- Manager
- Viewer
- Any custom roles that have been created

Role assignments take effect immediately and update in real-time for all board members.

### Changing Member Roles

To change a board member's role:

1. Open board settings
2. Navigate to Members tab
3. Find the member
4. Change their role using the role selector
5. Save changes

Role changes are logged in the audit log and notified to affected users in real-time.

## Real-Time Role Updates

Role and permission changes sync in real-time:

- Permission changes propagate immediately
- Users see updated capabilities without page refresh
- Access restrictions apply instantly
- Role changes are visible to all board members

If a user's permissions are reduced, they may lose access to certain features or be redirected if they were actively using restricted features.

## Permission Inheritance

Understanding how permissions work together:

- **App Admin**: Overrides all board-level permissions (has everything)
- **Board Admin**: Has all board-level permissions (but not app-level)
- **Custom Roles**: Have only the permissions explicitly granted
- **Built-in Roles**: Have predefined permission sets

Permissions are additive within their scope (board-level or app-level), but App Admin status grants everything regardless of board roles.

## Best Practices for Role Management

### Role Assignment

- Assign the minimum permissions necessary for users to perform their work
- Use Viewer role for stakeholders who only need visibility
- Use Manager role for team leads who manage membership
- Reserve Board Admin for board owners and primary administrators
- Use Custom Roles for specialized access needs

### Custom Role Design

- Create roles with descriptive names that indicate their purpose
- Document custom roles with descriptions
- Start with minimal permissions and add as needed
- Test custom roles before deploying to production teams
- Review and audit custom roles periodically

### App Admin Management

- Limit App Admin status to trusted administrators
- Maintain at least two App Admins for redundancy
- Document App Admin assignments
- Regularly review App Admin list
- Remove App Admin status when users change roles or leave

### Security Considerations

- Regularly audit role assignments
- Remove access promptly when team members leave
- Use Viewer role for external stakeholders
- Implement principle of least privilege
- Monitor audit logs for permission changes

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Learn about board-level permissions
- **[Invites](Invites)**: Invite team members with specific roles
- **[Audit Logs](Audit-Logs)**: Track role and permission changes
- **[Real-Time Features](Real-Time-Features)**: Understand real-time permission updates

