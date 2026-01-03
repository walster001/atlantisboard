# Boards and Columns

Boards are the core workspace areas where your projects live, organized into columns that represent workflow stages. This guide covers creating boards, managing columns, and customizing their appearance.

## Creating Boards

Boards are created within workspaces and serve as containers for columns and cards.

### Creating a New Board

1. From the Home page, select a workspace
2. Click "New Board" button
3. Enter a board name (required)
4. Optionally add a description
5. Choose an initial background color
6. Click "Create"

The new board opens automatically, showing an empty board ready for columns and cards.

### Board Settings

Access board settings via the settings icon in the board header. Board settings include:

- **Board Information**: Name and description
- **Members**: Add and manage board members, assign roles
- **Themes**: Apply and customize board color themes
- **Background**: Set background colors or images
- **Labels**: Create and manage board-level labels
- **Card Settings**: Configure default card behavior
- **Audit Log**: View board activity history (admin only)

Only users with appropriate permissions can access board settings. Board Admins have full access, while Managers may have limited access.

## Columns

Columns represent stages in your workflow. Common examples include "To Do", "In Progress", "Review", and "Done". Columns are arranged horizontally and can be reordered.

### Adding Columns

To add a new column:

1. Click the "Add Column" button at the right side of the board
2. Type the column name
3. Press Enter or click outside the input field

The new column appears at the end of the board. You can add as many columns as needed for your workflow.

### Renaming Columns

To rename a column:

1. Click on the column header
2. The column name becomes editable
3. Type the new name
4. Press Enter to save or Escape to cancel

Only users with edit permissions can rename columns.

### Reordering Columns

Columns can be reordered by dragging:

1. Click and hold the column header
2. Drag it left or right to the desired position
3. Release to drop the column in its new position

The column positions update in real-time for all board members. Columns maintain their new order automatically.

### Deleting Columns

To delete a column:

1. Click the column header menu (three dots or settings icon)
2. Select "Delete Column"
3. Confirm the deletion

**Warning**: Deleting a column also deletes all cards within it. Make sure to move or delete cards first if you want to preserve them.

Only users with appropriate permissions can delete columns.

## Column Customization

### Column Colors

Each column can have its own background color for visual organization:

1. Click the column header menu
2. Select "Column Color" or "Color"
3. Choose a color from the color picker
4. The column background updates immediately

Column colors help visually distinguish workflow stages. You can:
- Use preset colors from the color picker
- Enter custom hex color codes
- Set columns to transparent (no background color)

### Applying Column Color to All Columns

You can apply a single column's color to all columns on the board:

1. Set the desired color on one column
2. In the column color menu, select "Apply to All Columns"
3. Confirm the action

This is useful for creating a unified color scheme across the board.

### Column Color Inheritance

Column colors work in conjunction with board themes:

- **Per-Column Colors**: Override theme colors when set
- **Theme Colors**: Applied when no column-specific color is set
- **Transparent**: Columns can be set to transparent to show only the board background

This layering allows for flexible visual customization.

## Column Permissions

Column-level actions are controlled by board roles and permissions:

- **Creating Columns**: Requires column creation permission
- **Editing Column Titles**: Requires column edit permission
- **Reordering Columns**: Requires column reorder permission
- **Deleting Columns**: Requires column delete permission
- **Changing Column Colors**: Requires column color edit permission

Board Admins have all column permissions. Managers and Viewers have limited or no column editing capabilities, depending on their assigned permissions.

## Board Organization Tips

### Column Naming

- Use clear, descriptive names that indicate the column's purpose
- Keep names concise but informative
- Consider your team's workflow terminology
- Use consistent naming patterns across boards

### Column Count

- Start with 3-5 columns for simplicity
- Add columns as workflows become more complex
- Avoid having too many columns (more than 7-8 can become hard to navigate)
- Consider using labels and card organization as alternatives to additional columns

### Workflow Design

- Arrange columns in order of workflow progression (left to right)
- Group related stages together
- Use column colors to indicate workflow state (e.g., green for "Done")
- Consider your team's actual process when designing the column structure

## Mobile View

On mobile devices, columns are displayed in a carousel format:

- Swipe left/right to navigate between columns
- Tap column dots at the bottom to jump to a column
- Columns can be reordered by dragging the dots
- All column features are accessible in mobile view

## Real-Time Updates

Column changes sync in real-time:

- New columns appear instantly for all board members
- Column reordering updates immediately
- Color changes are visible to all users
- Column deletions propagate in real-time

All users viewing the board see changes as they happen, enabling seamless collaboration.

## Related Topics

- **[Cards](Cards)**: Learn about creating and managing cards within columns
- **[Themes and Branding](Themes-and-Branding)**: Customize board appearance with themes
- **[Users and Roles](Users-and-Roles)**: Understand column editing permissions
- **[Real-Time Features](Real-Time-Features)**: Learn about real-time synchronization

