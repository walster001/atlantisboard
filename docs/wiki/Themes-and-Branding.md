# Themes and Branding

AtlantisBoard offers extensive customization options for board appearance and application branding. You can create custom board themes, customize board backgrounds, and configure application-level branding elements.

## Board Themes

Board themes are customizable color schemes that define the visual appearance of boards. Themes control colors for navigation bars, columns, cards, card windows, and other interface elements.

### Understanding Themes

Themes provide a unified color scheme for boards:

- **Consistent Appearance**: All board elements use theme colors
- **Quick Application**: Apply themes with a single click
- **Reusable**: Create themes once and apply to multiple boards
- **Customizable**: Full control over all color elements

### Applying Themes

To apply a theme to a board:

1. Open board settings
2. Navigate to the "Theme" or "Themes" tab
3. Browse available themes
4. Click on a theme to apply it
5. The theme is applied immediately

Applied themes affect the board's visual appearance immediately. You can change themes at any time.

### Creating Themes

Only App Admins can create new themes. To create a theme:

1. Access the Admin Panel (App Admin required)
2. Navigate to Themes settings
3. Click "Create Theme" or "New Theme"
4. Configure theme colors (see Theme Customization below)
5. Save the theme

Created themes are available for all boards and can be applied by Board Admins.

### Editing Themes

To edit an existing theme:

1. Access the Admin Panel (App Admin required)
2. Navigate to Themes settings
3. Select a theme
4. Click "Edit"
5. Modify theme colors
6. Save changes

Changes to themes affect all boards using that theme. Use theme duplication to create variations without affecting existing boards.

### Duplicating Themes

To create a theme based on an existing one:

1. Access the Admin Panel
2. Navigate to Themes settings
3. Select a theme
4. Click "Duplicate"
5. Modify the duplicated theme
6. Save with a new name

Duplication is useful for creating theme variations or starting from an existing theme design.

### Deleting Themes

To delete a theme:

1. Access the Admin Panel
2. Navigate to Themes settings
3. Select a theme
4. Click "Delete"
5. Confirm deletion

**Warning**: Deleting a theme may affect boards using that theme. Boards will fall back to default colors or require a new theme assignment.

### Theme Customization Options

Themes can customize the following elements:

- **Navbar Color**: Top navigation bar background color
- **Column Color**: Default column background color
- **Default Card Color**: Default card background color
- **Card Window Color**: Card detail modal background
- **Card Window Text Color**: Text color in card detail modal
- **Card Window Button Colors**: Button colors in card modals
- **Homepage Board Color**: Board color on the home page
- **Board Icon Color**: Icon color on boards
- **Scrollbar Colors**: Scrollbar appearance
- **Intelligent Contrast**: Automatic text color based on background

Each color can be customized independently for full design control.

## Board Backgrounds

Board backgrounds can be customized with colors or images to create unique visual styles.

### Background Colors

To set a board background color:

1. Open board settings
2. Navigate to Background settings
3. Select "Color" background type
4. Choose a color from the color picker
5. The background updates immediately

Background colors provide a solid color background for the board. They work well with theme colors for cohesive design.

### Background Images

To set a board background image:

1. Open board settings
2. Navigate to Background settings
3. Select "Image" background type
4. Click "Upload Image"
5. Choose an image file (JPEG, PNG, GIF, WebP, max 5MB)
6. The image uploads and is set as the background

Background images are displayed behind board content. They should be high-quality and appropriate for workspace use.

### Following Theme Background

Boards can automatically use a background color derived from the applied theme:

1. Open board settings
2. Navigate to Background settings
3. Select "Follow Theme" option
4. The background color matches the theme

This ensures background colors complement theme colors automatically.

### Background Image Requirements

- **File Format**: JPEG, PNG, GIF, or WebP
- **Maximum Size**: 5MB
- **Recommended**: High-resolution images for best quality
- **Aspect Ratio**: Match common screen resolutions for best display

Background images are stored in Minio storage. See [File Management](File-Management) for more information.

## Application Branding

Application-level branding allows App Admins to customize the appearance of the entire application, including logos, app name, tagline, and fonts.

### Custom Logos

Application logos can be customized for different areas:

- **Home Logo**: Logo displayed on the home page
- **Board Logo**: Logo displayed on board pages
- **Login Logo**: Logo displayed on the login page

To upload custom logos:

1. Access the Admin Panel (App Admin required)
2. Navigate to Branding settings
3. Find the logo section you want to customize
4. Click "Upload" or "Change Logo"
5. Select an image file (max 2MB)
6. The logo uploads and appears immediately

Logo requirements:
- File format: Image files (JPG, PNG, GIF, WebP)
- Maximum size: 2MB per logo
- Recommended: PNG with transparency for best results
- Dimensions: Appropriate for display area

### App Name Customization

The application name can be customized:

1. Access the Admin Panel
2. Navigate to Branding settings
3. Enable "Custom App Name"
4. Enter the custom app name
5. Configure name appearance (size, color, font)
6. Save changes

Custom app names replace the default "AtlantisBoard" name throughout the application.

### Tagline Customization

A custom tagline can be displayed:

1. Access the Admin Panel
2. Navigate to Branding settings
3. Enable "Custom Tagline"
4. Enter the tagline text
5. Configure tagline appearance (size, color, font)
6. Save changes

Taglines typically appear on the login page or home page, depending on configuration.

### Custom Fonts

Custom fonts can be uploaded and used throughout the application:

1. Access the Admin Panel
2. Navigate to Fonts settings
3. Click "Upload Font"
4. Select a font file (TTF, OTF, WOFF, WOFF2, max 5MB)
5. The font is uploaded and available for use

Font requirements:
- Formats: TTF, OTF, WOFF, WOFF2
- Maximum size: 5MB per font
- Fonts are applied globally when configured

Custom fonts can be used for app names, taglines, and other text elements.

### Login Page Customization

The login page can be customized:

- **Background**: Color or image background
- **Login Box Background**: Background color for the login form
- **Google Button Colors**: Custom colors for OAuth buttons
- **Logo**: Custom login logo

Login customization is available in Branding settings for App Admins.

## Theme Color Details

### Navbar Color

The navbar (top navigation bar) color is the primary theme color:

- Affects the top navigation bar background
- Used as the primary brand color for the board
- Should provide good contrast for text and icons
- Background color is automatically darkened slightly for board background

### Column Colors

Column colors can be:

- **Theme-Defined**: Use the theme's default column color
- **Per-Column Override**: Individual columns can have custom colors
- **Transparent**: Columns can be set to transparent

Column colors provide visual organization and workflow indication.

### Card Colors

Card colors include:

- **Default Card Color**: Default background for cards without custom colors
- **Per-Card Override**: Individual cards can have custom colors
- **Card Window Colors**: Colors for card detail modals

Card colors help with categorization and visual organization.

### Card Window Colors

Card detail modals have extensive color customization:

- **Background Color**: Modal background
- **Text Color**: Default text color
- **Button Colors**: Button backgrounds and text
- **Button Hover Colors**: Hover state colors
- **Intelligent Contrast**: Automatic text color based on background

Card window colors ensure readability and visual consistency.

### Intelligent Contrast

Intelligent contrast automatically selects text colors based on background:

- **Light Backgrounds**: Dark text is used
- **Dark Backgrounds**: Light text is used
- **Optimal Readability**: Ensures text is always readable
- **Automatic**: Works without manual configuration

Intelligent contrast improves accessibility and ensures text is always readable.

## Best Practices

### Theme Design

- **Consistent Colors**: Use a cohesive color palette
- **Contrast**: Ensure sufficient contrast for readability
- **Accessibility**: Consider color-blind users and accessibility
- **Professional**: Use professional, workspace-appropriate colors
- **Test**: Preview themes before applying widely

### Background Selection

- **Subtle Images**: Use subtle backgrounds that don't distract
- **Appropriate Content**: Ensure backgrounds are workplace-appropriate
- **File Size**: Optimize images for fast loading
- **Resolution**: Use high-resolution images for quality
- **Color Coordination**: Match backgrounds with theme colors

### Branding Consistency

- **Logo Quality**: Use high-quality, professional logos
- **Consistent Branding**: Maintain brand consistency across logos
- **Appropriate Sizing**: Size logos appropriately for display areas
- **File Optimization**: Compress logos without losing quality
- **Brand Guidelines**: Follow organizational brand guidelines

### Performance Considerations

- **Image Optimization**: Compress images before uploading
- **File Sizes**: Keep file sizes reasonable for fast loading
- **Caching**: Branding assets are cached for performance
- **CDN Usage**: Assets may be served via CDN for speed

## Permissions

### Theme Management

- **Creating Themes**: App Admin only
- **Editing Themes**: App Admin only
- **Applying Themes**: Board Admin (requires board.theme.assign permission)
- **Deleting Themes**: App Admin only

### Background Customization

- **Setting Backgrounds**: Board Admin (requires board.background.edit permission)
- **Uploading Images**: Board Admin (requires appropriate permissions)

### Branding Management

- **All Branding Features**: App Admin only
- **Logo Upload**: App Admin only
- **App Name/Tagline**: App Admin only
- **Custom Fonts**: App Admin only

## Related Topics

- **[Boards and Columns](Boards-and-Columns)**: Learn about board customization
- **[File Management](File-Management)**: Background images and logo storage
- **[Users and Roles](Users-and-Roles)**: Theme and branding permissions

