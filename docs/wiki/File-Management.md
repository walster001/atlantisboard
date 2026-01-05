# File Management

AtlantisBoard supports file uploads for various purposes, including card attachments, inline button icons, board backgrounds, and branding assets. All files are stored securely using Minio (S3-compatible object storage).

## Overview

File management in AtlantisBoard allows you to:

- Attach files to cards for documentation and resources
- Upload custom icons for inline buttons
- Set board background images
- Manage application branding assets (logos, fonts)
- Organize and access files securely

All file storage is handled by Minio, an S3-compatible object storage system that provides secure, scalable file storage.

## Storage System

### Minio Storage

AtlantisBoard uses Minio for file storage:

- **S3-Compatible**: Uses the S3 API standard
- **Secure**: Files are stored securely with access control
- **Scalable**: Handles files of various sizes efficiently
- **Organized**: Files are organized into buckets by type

### Storage Buckets

Files are organized into storage buckets:

- **card-attachments**: Card file attachments
- **branding**: Logos, board backgrounds, inline button icons
- **fonts**: Custom font files

Each bucket has specific access controls and usage patterns.

## Card Attachments

Card attachments allow you to attach files directly to cards for documentation, reference materials, or related resources.

### Uploading Attachments

To attach files to a card:

1. Open the card detail view
2. Navigate to the "Attachments" section
3. Click "Upload" or drag files into the attachment area
4. Select one or more files from your device
5. Files upload automatically and appear in the attachment list

You can upload multiple files at once. Files are uploaded to the `card-attachments` bucket.

### Attachment Features

**Viewing Attachments:**
- Click an attachment to view or open it
- Attachments open in a new tab or appropriate viewer
- File previews may be available for supported formats

**Downloading Attachments:**
- All attachments can be downloaded
- Download preserves the original filename
- Downloads are available to users with view permissions

**Deleting Attachments:**
- Attachments can be deleted by users with delete permissions
- Deletion is permanent and cannot be undone
- Deleted files are removed from Minio storage

**Attachment Information:**
- File name (original filename)
- File size
- Upload date and time
- Uploaded by (user information)

### Attachment Permissions

Attachment access is controlled by board roles:

- **View**: Viewers and above can view attachments
- **Download**: Viewers and above can download attachments
- **Upload**: Requires upload permission (typically Managers and Admins)
- **Delete**: Requires delete permission (typically Admins only)

Permission checks are enforced server-side for security.

### Supported File Types

Most file types are supported for attachments. Common types include:

- Documents: PDF, DOC, DOCX, TXT, etc.
- Images: JPG, PNG, GIF, WebP, etc.
- Spreadsheets: XLS, XLSX, CSV, etc.
- Archives: ZIP, RAR, etc.

File size limits may apply based on your installation's configuration. Contact your administrator for specific limits.

## Inline Button Icons

Inline buttons in card descriptions can have custom icons. Icons are stored in the `branding` bucket.

### Uploading Icons

To upload an icon for an inline button:

1. Create or edit an inline button in a card description
2. Select "Upload Icon" option
3. Choose an image file
4. The icon uploads to Minio storage
5. The icon appears in the button

Icons are stored in the `inline-icons` or `import-icons` path within the `branding` bucket.

### Icon Requirements

**File Format:**
- Must be an image file (JPG, PNG, GIF, WebP)
- Recommended: PNG with transparency for best results

**File Size:**
- Maximum size: 500KB
- Smaller files load faster and use less storage
- Recommended: Under 100KB for optimal performance

**Dimensions:**
- Icons are displayed at button size (typically 16-24px)
- Use square images when possible
- High-resolution images are automatically scaled down

Icons should be clear and recognizable at small sizes.

## Board Background Images

Board backgrounds can use uploaded images stored in Minio.

### Uploading Background Images

To set a board background image:

1. Open board settings
2. Navigate to Background settings
3. Select "Image" background type
4. Click "Upload Image"
5. Choose an image file
6. The image uploads and is set as the background

Background images are stored in the `board-backgrounds` path within the `branding` bucket.

### Background Image Requirements

**File Format:**
- Supported: JPEG, PNG, GIF, WebP
- Recommended: JPEG for photos, PNG for graphics

**File Size:**
- Maximum size: 5MB
- Larger files may take longer to load
- Optimize images before uploading for better performance

**Dimensions:**
- Images are scaled to fit the board view
- Use high-resolution images for best quality
- Recommended aspect ratio matches common screen resolutions

Background images should be appropriate for workspace use and not distract from board content.

## Branding Assets

Application-level branding assets (logos, custom fonts) are stored in the `branding` and `fonts` buckets.

### Logos

Application logos are stored in the `branding` bucket:

- **Home Logo**: Logo displayed on the home page
- **Board Logo**: Logo displayed on board pages
- **Login Logo**: Logo displayed on the login page

Logo requirements:
- File format: Image files (JPG, PNG, GIF, WebP)
- Maximum size: 2MB per logo
- Recommended: PNG with transparency for logos

### Custom Fonts

Custom fonts are stored in the `fonts` bucket:

- Supported formats: TTF, OTF, WOFF, WOFF2
- Maximum size: 5MB per font file
- Fonts are applied globally when configured

Font management requires App Admin permissions.

## File Organization

Files are organized logically within Minio buckets:

### Card Attachments Structure

```
card-attachments/
  {cardId}/
    {timestamp}_{random}.{ext}
```

Each card's attachments are stored in a folder named with the card ID.

### Branding Structure

```
branding/
  {type}-logo-{timestamp}.{ext}          # Logos
  board-backgrounds/{boardId}-bg-{timestamp}.{ext}  # Board backgrounds
  inline-icons/{timestamp}.{ext}         # Inline button icons
  import-icons/{timestamp}.{ext}         # Imported icons
```

Branding files are organized by type and include timestamps for uniqueness.

## File Access and Security

### Access Control

File access is controlled by:

- **Board Permissions**: Card attachments respect board member permissions
- **Role-Based Access**: Users need appropriate roles to upload/delete files
- **Server-Side Validation**: All file operations are validated server-side
- **Secure Storage**: Files are stored securely in Minio with access controls

### Public vs Private Files

- **Card Attachments**: Private, accessible only to board members
- **Board Backgrounds**: Accessible to all board members
- **Branding Assets**: Public or restricted based on configuration
- **Inline Button Icons**: Accessible to users viewing cards

Access is controlled automatically based on file type and context.

### File URLs

Files are accessed via secure URLs:

- URLs may be signed for temporary access
- Public URLs may be used for branding assets
- Private files require authentication
- URLs are generated server-side for security

## Troubleshooting Upload Errors

### File Too Large

If you receive a "file too large" error:

- Check the file size limits for the file type
- Reduce file size (compress images, zip archives)
- Contact your administrator if you need larger limits
- Consider using external file hosting for very large files

### Invalid File Type

If a file type is rejected:

- Verify the file type is supported
- Check file extension matches the actual file type
- Try converting to a supported format
- Contact your administrator for unsupported file types

### Upload Failed

If uploads fail:

- Check your internet connection
- Verify you have upload permissions
- Try uploading a smaller file to test
- Check browser console for error messages
- Contact your administrator if issues persist

### File Not Appearing

If uploaded files don't appear:

- Refresh the page to check for the file
- Verify upload completed successfully
- Check permissions to view the file
- Verify you're looking in the correct location
- Contact your administrator if the file is missing

## Best Practices

### File Management

- **Organize Files**: Use descriptive filenames for easy identification
- **Optimize Sizes**: Compress images and documents before uploading
- **Regular Cleanup**: Remove unused attachments periodically
- **Version Control**: Upload new versions rather than deleting and re-uploading (if needed)

### Attachment Usage

- **Relevant Files Only**: Attach only files relevant to the card
- **Documentation**: Use attachments for reference materials
- **Size Consideration**: Keep attachments reasonably sized
- **File Types**: Use common file types for better compatibility

### Icon and Image Optimization

- **Compress Images**: Reduce file sizes without losing quality
- **Appropriate Formats**: Use PNG for graphics, JPEG for photos
- **Optimize Dimensions**: Use appropriate image sizes
- **Test Display**: Verify icons/images display correctly

### Storage Management

- **Monitor Usage**: Be aware of storage usage if limits apply
- **Clean Up**: Remove unused files regularly
- **Archive Old Files**: Consider archiving old attachments
- **External Storage**: For very large files, consider external hosting

## Related Topics

- **[Cards](Cards)**: Learn about card attachments
- **[Themes and Branding](Themes-and-Branding)**: Board backgrounds and branding
- **[Users and Roles](Users-and-Roles)**: File upload permissions
- **[Troubleshooting](Troubleshooting)**: Resolving file upload issues

