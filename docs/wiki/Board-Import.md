# Board Import

AtlantisBoard supports importing boards from other Kanban platforms, allowing you to migrate existing projects and workflows. Currently supported sources include Trello and Wekan.

## Overview

Board import enables you to:

- **Migrate Projects**: Move boards from other platforms to AtlantisBoard
- **Preserve Structure**: Maintain board structure, columns, and cards
- **Transfer Content**: Import cards, labels, descriptions, and attachments
- **Continue Work**: Resume work with minimal disruption

Import functionality helps teams transition to AtlantisBoard while preserving their existing work and organization.

## Supported Sources

### Trello

Trello board import supports:

- **Boards**: Board names and descriptions
- **Lists (Columns)**: All lists are imported as columns
- **Cards**: All cards with titles and descriptions
- **Labels**: Card labels with colors
- **Checklists**: Checklists are imported as card subtasks
- **Card Positions**: Maintains card order within lists
- **Due Dates**: Card due dates are preserved
- **Attachments**: File attachments (with limitations)

Trello exports are JSON files that can be imported into AtlantisBoard.

### Wekan

Wekan board import supports:

- **Boards**: Board structure and metadata
- **Lists (Columns)**: All lists imported as columns
- **Cards**: Cards with full content
- **Labels**: Labels with colors and names
- **Checklists**: Subtasks and checklist items
- **Attachments**: File attachments
- **Inline Buttons**: Wekan inline buttons with icons (special handling)

Wekan exports are JSON files that can be imported into AtlantisBoard.

## Import Process

### Preparing for Import

Before importing:

1. **Export from Source**: Export your board from Trello or Wekan
   - Trello: Board menu → More → Print and Export → Export JSON
   - Wekan: Export functionality (varies by Wekan version)
2. **Save Export File**: Save the JSON export file to your computer
3. **Review Content**: Check that the export includes all desired content
4. **Choose Workspace**: Decide which workspace the board should belong to

### Starting Import

To import a board:

1. Navigate to the Home page
2. Select the workspace where you want to import the board
3. Click "Import Board" or access the import option
4. Select the source platform (Trello or Wekan)
5. Choose the export file from your computer
6. Review import options and settings
7. Click "Import" to begin

The import process begins and shows progress as it processes the data.

### Import Progress

During import, you'll see progress indicators:

- **File Processing**: Reading and parsing the export file
- **Board Creation**: Creating the board structure
- **Columns**: Importing lists as columns
- **Cards**: Importing cards and content
- **Labels**: Importing labels
- **Subtasks**: Importing checklists as subtasks
- **Attachments**: Processing file attachments
- **Finalization**: Completing the import

Progress updates help you track the import status.

### Import Completion

When import completes:

- **Success Notification**: Confirmation that import succeeded
- **Board Created**: New board appears in your workspace
- **Summary**: Import summary with statistics
- **Board Opens**: Imported board may open automatically

Review the imported board to verify everything imported correctly.

## Import Features

### Column Import

Lists from Trello/Wekan are imported as columns:

- **Column Names**: List names become column names
- **Column Order**: List order is preserved
- **Card Positions**: Cards maintain their positions within columns

Columns are created to match the source board structure.

### Card Import

Cards are imported with their content:

- **Card Titles**: All card titles are preserved
- **Descriptions**: Card descriptions and content are imported
- **Positions**: Card order within columns is maintained
- **Due Dates**: Due dates are imported when available
- **Labels**: Card labels are attached to imported cards

Cards maintain their structure and content from the source.

### Label Import

Labels are imported and applied:

- **Label Names**: Label names are preserved
- **Label Colors**: Colors are mapped to AtlantisBoard colors
- **Label Assignments**: Labels are attached to cards as they were in the source

Labels help maintain organization and categorization.

### Subtask Import

Checklists are imported as card subtasks:

- **Checklist Items**: All checklist items become subtasks
- **Completion Status**: Completed items are marked as complete
- **Item Order**: Checklist order is preserved
- **Checklist Names**: May be preserved as subtask organization

Subtasks maintain the checklist structure from the source board.

### Attachment Import

File attachments are handled during import:

- **Attachment References**: Attachment URLs and metadata are imported
- **File Migration**: Files may need to be re-uploaded (see limitations)
- **Attachment Links**: Original attachment links may be preserved

Attachment handling depends on the source platform and file availability.

### Inline Button Import (Wekan)

Wekan inline buttons receive special handling:

- **Button Detection**: Inline buttons are detected in card descriptions
- **Icon Migration**: Button icons are identified for migration
- **Icon Upload**: Icons can be uploaded to Minio storage
- **Button Preservation**: Buttons are preserved in card descriptions

Wekan inline buttons require icon migration to work properly in AtlantisBoard.

## Import Limitations

### File Attachments

File attachments have limitations:

- **External URLs**: Attachments may reference external URLs that need to be re-uploaded
- **File Availability**: Files must be accessible for successful import
- **Storage Migration**: Files may need to be uploaded to Minio storage
- **Size Limits**: File size limits apply to re-uploaded files

Some attachments may need manual re-upload after import.

### Custom Fields

Custom fields may not be fully supported:

- **Trello Custom Fields**: May not import directly
- **Wekan Custom Fields**: Support varies
- **Data Loss**: Some custom field data may not import

Review imported boards to identify any missing custom field data.

### Member Assignments

Member assignments may not import directly:

- **User Mapping**: Users from source platforms don't automatically map
- **Manual Assignment**: Members may need to be assigned manually
- **Invite Links**: Use invite links to add team members after import

Team members need to be added to imported boards separately.

### Comments

Comments may not be fully imported:

- **Comment Support**: Comment import varies by source
- **Data Preservation**: Comments may be lost during import
- **Alternative**: Consider documenting important comments in card descriptions

Review imported boards for missing comments.

## Inline Button Icon Migration (Wekan)

Wekan imports may include inline buttons with icons that need migration:

### Icon Migration Process

1. **Detection**: Import detects inline buttons with external icon URLs
2. **Icon Dialog**: After import, an icon migration dialog may appear
3. **Icon Upload**: Upload replacement icons for detected buttons
4. **Icon Mapping**: Map original icon URLs to new uploaded icons
5. **Button Update**: Buttons are updated with new icon URLs

Icon migration ensures inline buttons work properly in AtlantisBoard.

### Icon Requirements

When migrating icons:

- **Image Files**: Icons must be image files (JPG, PNG, GIF, WebP)
- **File Size**: Maximum 500KB per icon
- **Clarity**: Icons should be clear at small sizes
- **Format**: PNG with transparency recommended

Icons are stored in Minio storage after migration.

## Import Best Practices

### Pre-Import Preparation

- **Export Quality**: Ensure export files are complete and valid
- **Content Review**: Review source boards before importing
- **Clean Up**: Remove unnecessary content from source boards
- **Backup**: Keep backup copies of export files

### During Import

- **Patience**: Large boards may take time to import
- **Monitor Progress**: Watch progress indicators
- **Don't Interrupt**: Avoid interrupting the import process
- **Network Stability**: Ensure stable network connection

### Post-Import

- **Review Content**: Check that all content imported correctly
- **Verify Structure**: Verify board structure matches source
- **Check Attachments**: Verify attachments imported or re-upload
- **Add Members**: Add team members to imported boards
- **Test Functionality**: Test board functionality and features

## Troubleshooting

### Import Fails

If import fails:

- **Check File Format**: Ensure export file is valid JSON
- **File Size**: Very large exports may have issues
- **Error Messages**: Read error messages for guidance
- **Try Again**: Some errors may be transient
- **Contact Support**: Contact administrator if issues persist

### Missing Content

If content is missing after import:

- **Check Source**: Verify source export includes the content
- **Review Limitations**: Check if content type is supported
- **Manual Addition**: Add missing content manually if needed
- **Re-import**: Try re-importing if content should be supported

### Attachment Issues

If attachments don't work:

- **URL Availability**: Check if original URLs are accessible
- **Re-upload**: Re-upload attachments manually if needed
- **File Migration**: Migrate files to Minio storage
- **Link Updates**: Update card descriptions with new file links

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Understanding imported board structure
- **[Cards](Cards)**: Working with imported cards
- **[File Management](File-Management)**: Handling imported attachments
- **[Inline Buttons](Cards#inline-buttons)**: Inline button icon migration

