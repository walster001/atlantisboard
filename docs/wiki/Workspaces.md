# Workspaces

Workspaces are top-level containers that organize related boards and teams. They provide a way to group boards by project, department, or any organizational structure that makes sense for your team.

## Understanding Workspaces

A workspace serves as:
- **Organization Unit**: Groups related boards together
- **Access Control**: Members added to a workspace automatically get access to all boards in that workspace
- **Collaboration Hub**: Central location for team members working on related projects

When you create a workspace, you become its owner. As the owner, you have full control over the workspace and all boards within it.

## Creating a Workspace

To create a new workspace:

1. From the Home page, click "New Workspace"
2. Enter a workspace name (required)
3. Optionally add a description to help identify the workspace's purpose
4. Click "Create"

The workspace will appear in your workspace list on the Home page. You can create multiple workspaces to organize different projects or teams.

## Workspace Members

Workspace membership provides automatic access to all boards within that workspace. When you add a user to a workspace:

- They appear in the workspace member list
- They automatically get access to view all boards in the workspace
- They can be assigned specific roles on individual boards
- They receive real-time updates for all workspace activities

### Adding Workspace Members

Workspace owners can add members by:

1. Navigating to the workspace (from the Home page)
2. Accessing workspace settings (if available)
3. Adding users by email address or username

Note: Workspace member management may vary based on your installation's configuration. Board-level membership is the primary method for controlling access and permissions.

## Creating Boards in Workspaces

All boards must belong to a workspace. To create a board:

1. Select a workspace from the Home page
2. Click "New Board" within that workspace
3. Provide board details (name, description, initial settings)
4. Click "Create"

The new board will appear in the workspace's board list. You can create multiple boards within a single workspace to organize different aspects of a project.

## Workspace Organization

Workspaces help maintain organization by:

- **Separating Projects**: Keep different projects or teams isolated
- **Grouping Related Boards**: Collect all boards for a specific initiative in one place
- **Managing Access**: Control who can see and access groups of boards
- **Scaling Teams**: Easily add new boards to a workspace as projects grow

### Best Practices

- Use descriptive workspace names that clearly indicate the project or team
- Add workspace descriptions to document the workspace's purpose
- Organize boards logically within workspaces
- Consider creating separate workspaces for different departments or major projects

## Real-Time Updates

Workspace members receive real-time updates for:

- New boards created in the workspace
- Board updates and changes
- Workspace membership changes
- Any activity within workspace boards (if they have board access)

All updates appear instantly without requiring page refresh, thanks to WebSocket connections.

## Workspace vs Board Permissions

It's important to understand the relationship between workspace and board permissions:

- **Workspace Membership**: Provides visibility and basic access to workspace boards
- **Board Membership**: Determines specific roles and permissions on individual boards
- **Board Roles**: Control what actions users can perform (Admin, Manager, Viewer, or custom roles)

A user can be in a workspace but have different roles on different boards within that workspace. Board-level permissions are where fine-grained control is applied.

## Managing Workspaces

Workspace owners can:

- Create and delete boards within the workspace
- Add or remove workspace members (if workspace-level membership is enabled)
- View all boards and activities in the workspace
- Manage workspace settings and configuration

Workspace management features may vary based on your installation. Most permission management happens at the board level.

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Learn about creating and managing boards
- **[Users and Roles](Users-and-Roles)**: Understand board-level permissions and roles
- **[Invites](Invites)**: Invite team members to boards
- **[Best Practices](Best-Practices)**: Recommendations for organizing workspaces and boards

