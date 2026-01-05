# Cards

Cards are the fundamental building blocks of your Kanban boards. They represent tasks, items, or work units that move through your workflow columns. Cards can contain rich information including descriptions, attachments, labels, due dates, and more.

## Creating Cards

### Basic Card Creation

To create a new card:

1. Click "Add Card" at the bottom of any column
2. Type the card title
3. Press Enter to create the card

The card appears immediately in the column. Click on the card to open its detail view and add more information.

### Card Titles

Card titles should be clear and descriptive. Best practices:

- Use concise, action-oriented titles
- Include key information in the title
- Avoid overly long titles (they may be truncated in the card view)
- Titles can be edited later by clicking on the card

## Card Detail View

Clicking on a card opens the card detail modal, which provides full editing capabilities. The detail view includes:

- **Title**: Editable card title
- **Description**: Rich text editor with markdown support
- **Due Date**: Calendar picker for due dates
- **Labels**: Visual labels with colors
- **Subtasks**: Checklist items that can be checked off
- **Attachments**: File attachments
- **Members**: Assigned team members (if enabled)

Close the detail view by clicking outside the modal, pressing Escape, or clicking the close button.

## Editing Cards

### Editing the Title

To edit a card title:

1. Open the card detail view
2. Click on the title at the top
3. The title becomes editable
4. Type your changes
5. Press Enter to save or Escape to cancel

Alternatively, you can edit the title directly from the board view by clicking on the card title (if enabled).

### Rich Text Description

Card descriptions support rich text editing with markdown syntax:

1. Open the card detail view
2. Click on the description area (or "Click to add a description..." if empty)
3. The rich text editor opens
4. Type your description with markdown formatting

#### Supported Markdown Features

- **Bold text**: `**bold**` or `__bold__`
- **Italic text**: `*italic*` or `_italic_`
- **Code blocks**: Triple backticks for code blocks
- **Inline code**: Single backticks for `inline code`
- **Links**: `[text](url)`
- **Lists**: Bullet points and numbered lists
- **Headings**: `# Heading 1`, `## Heading 2`, etc.
- **Inline buttons**: Special syntax for creating clickable buttons (see Inline Buttons section)

The editor provides a toolbar with formatting options. Descriptions are saved automatically as you type.

## Moving Cards

### Drag and Drop

The primary way to move cards between columns is drag and drop:

1. Click and hold on a card
2. Drag it to the target column
3. Release to drop the card

Cards can be reordered within columns by dragging them vertically. The new position is saved automatically and updates in real-time for all board members.

### Moving Restrictions

- Cards can only be moved if you have the "move cards" permission
- Viewers typically cannot move cards
- Cards maintain their position within columns unless explicitly reordered

## Card Colors

Cards can have custom background colors for visual organization and categorization.

### Setting Card Colors

To set a card's color:

1. Open the card menu (three dots on the card)
2. Select "Card Colour" or "Color"
3. Choose a color from the color picker
4. The card background updates immediately

You can also set colors from the card detail view if available.

### Apply Color to All Cards

You can apply a single card's color to all cards on the board:

1. Set the desired color on one card
2. In the card color menu, select "Apply to All Cards"
3. Confirm the action

This is useful for creating a unified color scheme. Use with caution as it affects all cards on the board.

### Clearing Card Colors

To remove a card's custom color:

1. Open the card menu
2. Select "Clear Colour" (if the card has a color)
3. The card returns to its default appearance

Cards without custom colors use the board's default card color or theme.

## Due Dates

Due dates help track deadlines and prioritize work.

### Setting Due Dates

To set a due date:

1. Open the card detail view
2. Find the "Due Date" section
3. Click "Set due date"
4. Select a date from the calendar picker
5. The due date is saved automatically

### Due Date Indicators

Cards with due dates display visual indicators:

- **Overdue**: Cards past their due date show in red/orange
- **Due Today**: Cards due today are highlighted
- **Upcoming**: Future due dates are shown normally

Due date indicators appear on cards in the board view and in the card detail view.

### Clearing Due Dates

To remove a due date:

1. Open the card detail view
2. Find the "Due Date" section
3. Click the X button next to the due date
4. The due date is removed

## Labels

Labels provide visual categorization for cards. Labels are created at the board level and can be assigned to multiple cards.

### Assigning Labels

To assign a label to a card:

1. Open the card detail view
2. Find the "Labels" section
3. Click "Add Label"
4. Select a label from the list
5. The label appears on the card

Labels can be assigned multiple labels to a single card. Assigned labels appear as colored badges on the card in both the board view and detail view.

### Removing Labels

To remove a label from a card:

1. Open the card detail view
2. Find the "Labels" section
3. Click the X on the label badge you want to remove
4. The label is removed from the card

Labels are not deleted from the board, only removed from the individual card.

See the [Boards and Columns](Boards-and-Columns) guide for information on creating and managing board-level labels.

## Assigning Members to Cards

Cards can have assigned members to indicate ownership or responsibility.

### Assigning Members

To assign a member to a card:

1. Open the card detail view
2. Find the "Members" section (if available)
3. Click to add members
4. Select team members from the board member list
5. Assigned members appear on the card

Assigned members are visible on cards in the board view as avatars or initials.

### Removing Members

To remove an assigned member:

1. Open the card detail view
2. Find the "Members" section
3. Click the X on the member's avatar
4. The member is removed from the card

## Attachments

Cards can have file attachments for documents, images, and other files.

### Uploading Attachments

To attach files to a card:

1. Open the card detail view
2. Find the "Attachments" section
3. Click "Upload" or drag files into the attachment area
4. Select one or more files
5. Files upload automatically and appear in the attachment list

### Attachment Features

- **View**: Click an attachment to view or download it
- **Download**: Downloads are available for all attachments (with appropriate permissions)
- **Delete**: Remove attachments (requires delete permission)
- **File Information**: View file name, size, upload date, and uploader

### Attachment Permissions

Attachment access is controlled by board roles:

- **View**: Viewers and above can view attachments
- **Download**: Viewers and above can download attachments
- **Upload**: Requires upload permission (typically Managers and Admins)
- **Delete**: Requires delete permission (typically Admins only)

### Supported File Types

Most file types are supported for attachments. File size limits may apply based on your installation's configuration.

## Subtasks and Checklists

Subtasks (also called checklists) allow you to break down cards into smaller, trackable items.

### Creating Subtasks

To create subtasks:

1. Open the card detail view
2. Find the "Checklist" or "Subtasks" section
3. Click "Add Item" or "Add Subtask"
4. Type the subtask name
5. Press Enter to add it

Subtasks appear as a checklist with checkboxes that can be toggled.

### Completing Subtasks

To mark a subtask as complete:

1. Click the checkbox next to the subtask
2. The subtask is checked off and marked as complete
3. Completed subtasks may be visually distinguished (strikethrough, different color)

Click the checkbox again to uncheck and mark as incomplete.

### Organizing Subtasks

Subtasks can be:

- **Reordered**: Drag subtasks to change their order
- **Renamed**: Click on the subtask text to edit
- **Deleted**: Remove subtasks you no longer need

### Subtask Progress

Some views may show progress indicators for cards with subtasks, such as "3 of 5 completed".

## Inline Buttons

Inline buttons are special interactive elements that can be embedded in card descriptions. They appear as styled buttons with icons and text, and can link to external URLs.

### Creating Inline Buttons

Inline buttons are created using special syntax in card descriptions:

1. Open the card detail view
2. Edit the description
3. Use the inline button editor (if available) or special markdown syntax
4. Configure the button:
   - Button text
   - Link URL
   - Icon (optional, uploaded image)
   - Colors (background and text)
   - Border radius

Inline buttons appear as clickable elements within the card description.

### Custom Icons

Inline buttons can have custom icons:

1. When creating/editing an inline button, select "Upload Icon"
2. Choose an image file (max 500KB, image formats)
3. The icon uploads to Minio storage
4. The icon appears next to the button text

Icons are stored separately from the card and can be reused. Icons should be small, clear images that work well at button size.

### Button Behavior

When users click an inline button:

- The button's URL opens in a new tab/window
- URLs are automatically prefixed with "https://" if no protocol is specified
- Buttons maintain security (open with `noopener` and `noreferrer`)

### Use Cases

Inline buttons are useful for:

- Quick links to related documents or resources
- Accessing external tools or systems
- Linking to related tickets or issues
- Providing action buttons (e.g., "View Report", "Open Dashboard")

## Card Permissions

Card actions are controlled by board roles and permissions:

- **Creating Cards**: Requires card creation permission
- **Editing Cards**: Requires card edit permission
- **Deleting Cards**: Requires card delete permission
- **Moving Cards**: Requires card move permission
- **Changing Colors**: Requires card color edit permission
- **Editing Due Dates**: Requires due date edit permission
- **Managing Attachments**: Requires attachment permissions (view, upload, delete)
- **Managing Subtasks**: Requires subtask permissions (view, create, toggle, delete)

Board Admins have all card permissions. Managers and Viewers have limited permissions based on their assigned roles.

## Card Detail Modal Features

The card detail modal provides a comprehensive editing interface:

- **Full-Screen Editing**: Large modal for comfortable editing
- **Auto-Save**: Changes save automatically as you type
- **Real-Time Updates**: See changes from other users in real-time
- **Keyboard Shortcuts**: Escape to close, Enter to save (context-dependent)
- **Mobile Optimized**: Swipeable interface on mobile devices

## Real-Time Updates

Card changes sync in real-time:

- Card movements appear instantly for all board members
- Edits to titles, descriptions, and details update immediately
- Label assignments and removals sync in real-time
- Attachment uploads appear as they complete
- Subtask completions update for all viewers

All users viewing the board see changes as they happen, enabling seamless collaboration.

## Card Organization Tips

### Effective Card Titles

- Use clear, action-oriented language
- Include key identifiers (ticket numbers, project codes)
- Keep titles concise but informative
- Use consistent naming conventions

### Description Best Practices

- Include sufficient context for team members
- Use formatting to improve readability
- Add links to related resources
- Use inline buttons for quick actions
- Keep descriptions updated as work progresses

### Label Strategy

- Create a consistent label system
- Use color coding for quick visual identification
- Limit the number of labels per card (3-5 is usually sufficient)
- Use labels for filtering and organization

### Due Date Management

- Set due dates for time-sensitive work
- Review and update due dates regularly
- Use due dates for prioritization
- Consider time zones for distributed teams

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Learn about board structure and column management
- **[Labels](Boards-and-Columns#labels)**: Creating and managing board-level labels
- **[File Management](File-Management)**: Details about file attachments and storage
- **[Real-Time Features](Real-Time-Features)**: Understanding real-time synchronization
- **[Users and Roles](Users-and-Roles)**: Card editing permissions

