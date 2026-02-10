# Admin Panel Guide

The OchoCast admin panel allows administrators to customize the application's appearance in real time without directly modifying the source code. This guide details each feature and its visual impact.

## Accessing the Panel

**Access URL**: `/admin`

:::warning Required permissions
Only users with **administrator privileges** can access this panel. Non-admin users will be redirected to a 404 page.
:::

## Overview

The admin panel is organized into several sections:

1. **General information** – Application name
2. **Theme colors** – Main color palette
3. **Color preview** – Preview of generated gradients
4. **Branding images** – Custom logos and icons
5. **Content management** – Video archiving and administration ([Go to](#content-management))

![Admin panel overview](/img/admin-panel-overview2.png)  
*Full view of the admin panel with all sections*

The **Content management** section (see link above) covers video archiving operations, as well as admin-only features: viewing archived videos, restoring them, and permanently deleting them.

![Switch from the admin panel to admin video management](/img/admin-top-panel.png)

This documentation is organized into two clearly separated parts: **theme configuration** (sections 1–4) and **content management** (video archiving and administration). Use these shortcuts to navigate quickly: [Theme configuration](#theme-configuration) · [Content management](#content-management)

---

## Quick start

1. Log in as an administrator.
2. Open the `/admin` URL.
3. In **General information**, update `appName` if needed, then click **Save configuration**.
4. Adjust the colors in **Theme colors**.
5. Upload images in **Branding images**, then save.

---

<a id="theme-configuration"></a>

## 1. General information

![General information section](/img/admin-general-info.png)  
*Section used to change the application name*

### Application name

**Field**: `Application Name` / `Nom de l'application`

**Description**: This field defines the name displayed throughout the application.

**Visible effect**:
- Appears in the page title (browser tab)
- Displayed in the navigation bar
- Used in emails and notifications

**Example**:
```yaml
appName: "OchoCast"
```

**Where to see it**:
- Top left of the navigation bar
- In the browser tab
- On the login page

![Logo in the navbar](/img/admin-effect-logo-before.png)  
*Example of a logo displayed in the navigation bar*

---

## 2. Theme colors

![Theme colors section](/img/admin-colors.png)  
*The 5 color fields with their pickers*

The color system uses a hexadecimal format with transparency (8 characters: `#RRGGBBAA`).

### 2.1 Primary color

**Field**: `primary`

**Description**: The primary color of the application, used for interactive elements and key accents.

**Visible effect**:
- Primary buttons (login, save, confirm)
- Clickable links
- Active navigation elements
- Progress bars
- Important icons

**Format**: `#1dac78ff` (default green)

**Usage examples**:
- “Save configuration” button in the admin panel
- “Sign in” button on the authentication page
- Links in the navigation bar

**Before/after changing colors**:

![Colors before](/img/admin-effect-colors-before.png)  
*Application with default colors*

![Colors after](/img/admin-effect-colors-after.png)  
*Application with new customized colors*

**How to change**:
1. Click the color selector (colored square)
2. Choose a color in the picker
3. OR type a hex code directly in the text field

![Color picker](/img/admin-color-picker.png)  
*Color picker open to select a color*

### 2.2 Secondary color

**Field**: `secondary`

**Description**: Color used for secondary text and borders.

**Visible effect**:
- Description text
- Card borders
- Separators
- Form text

**Format**: `#344054ff` (default dark gray)

**Usage examples**:
- Description text under headings
- Form field borders
- Divider lines between sections

### 2.3 Background color

**Field**: `background`

**Description**: Main background color of the application.

**Visible effect**:
- Background of all pages
- Section backgrounds
- Spacing between cards

**Format**: `#f9fafbff` (default very light gray)

**Usage examples**:
- Home page background
- Admin panel background
- Video lists background

### 2.4 Accent color

**Field**: `accent`

**Description**: Color used to draw attention to specific elements.

**Visible effect**:
- Notification badges
- Highlights
- Informational alerts
- Highlighted elements

**Format**: `#2ecc71ff` (default light green)

**Usage examples**:
- “New” badge on recent videos
- Success notifications
- Featured elements

### 2.5 Error color

**Field**: `error`

**Description**: Color used for error messages and critical alerts.

**Visible effect**:
- Error messages
- Invalid field borders
- Delete buttons
- Critical alerts

**Format**: `#dc2626ff` (default red)

**Usage examples**:
- “Error while saving” message
- Red border around an invalid field
- “Delete” button for dangerous actions

---

## 3. Color preview

![Gradient previews](/img/admin-color-preview.png)  
*Automatically generated color palettes (variants 50–900)*

This section automatically displays the **generated variants** from the base colors.

### 3.1 Gradient system

For each base color, the system generates **10 variants** (50, 100, 200, 300, 400, 500, 600, 700, 800, 900):

- **50–400**: Light variants (mixed with white)
- **500**: Exact base color
- **600–900**: Dark variants (mixed with black)

### 3.2 Primary color preview

**Section**: `Primary Color Preview`

**Display**:
- Full palette of the 10 primary color variants
- Hex code for each variant
- Real-time visual preview

**Generated CSS variables**:
```css
--theme-color-50
--theme-color-100
--theme-color-200
--theme-color-300
--theme-color-400
--theme-color-500  /* Base color */
--theme-color-600
--theme-color-700
--theme-color-800
--theme-color-900
```

### 3.3 Background color preview

**Section**: `Background Color Preview`

**Display**:
- Full palette of the 10 background color variants
- Hex code for each variant
- Real-time visual preview

**Generated CSS variables**:
```css
--bg-color-50
--bg-color-100
--bg-color-200
--bg-color-300
--bg-color-400
--bg-color-500  /* Base color */
--bg-color-600
--bg-color-700
--bg-color-800
--bg-color-900
```

---

## 4. Branding images

![Branding images section](/img/admin-images.png)  
*List of customizable images with previews*

This section lets you customize all images used in the application.

### 4.1 Main logo

**Field**: `logo`

**Description**: Main application logo displayed in the navigation bar.

**Accepted formats**: SVG, PNG, JPG

**Recommended dimensions**:
- Width: 150–200px
- Height: 40–60px
- Format: SVG (best quality)

**Visible effect**:
- Displayed in the top-left of the navigation bar
- Visible on all pages
- Used as the favicon

![Main logo](/img/logo_main.png)  
*Logo displayed in the navigation bar*

**How to change**:
1. Click “Choose file” under the current preview
2. Select your new logo
3. The preview updates immediately
4. Click “Save configuration” to apply

### 4.2 Default thumbnail image

**Field**: `default_miniature_image`

**Description**: Image used as the default thumbnail for videos without a custom thumbnail.

**Accepted formats**: PNG, JPG, WEBP

**Recommended dimensions**:
- Width: 1280px
- Height: 720px
- Ratio: 16:9

**Visible effect**:
- Displayed on video cards without a thumbnail
- Used in video lists
- Visible on the home page

**Usage examples**:
- Newly uploaded video without a thumbnail
- Video currently being processed
- Placeholder for live events

### 4.3 Add icon

**Field**: `add`

**Description**: Icon used for add buttons.

**Accepted formats**: SVG (recommended), PNG

**Recommended dimensions**: 24×24px or 32×32px

**Visible effect**:
- “Add a video” button
- “Create an event” button
- Add actions in forms

### 4.4 Plus icon

**Field**: `plus`

**Description**: Plus icon used throughout the UI.

**Accepted formats**: SVG (recommended), PNG

**Recommended dimensions**: 24×24px

**Visible effect**:
- Expand buttons
- Quick add actions
- Dropdown menus

![Plus icon](/img/logo_plus.png)  
*Add icon used in the interface*

### 4.5 Search icon

**Field**: `search`

**Description**: Magnifying-glass icon for search features.

**Accepted formats**: SVG (recommended), PNG

**Recommended dimensions**: 20×20px or 24×24px

**Visible effect**:
- Search bar in the header
- Search fields in lists
- Search filters

![Search icon](/img/logo_search.png)  
*Search icon in the navigation bar*

### 4.6 Close icon

**Field**: `cross`

**Description**: Close (X) icon to close modals and remove elements.

**Accepted formats**: SVG (recommended), PNG

**Recommended dimensions**: 20×20px or 24×24px

**Visible effect**:
- Close button on modals
- Removing elements
- Canceling actions

![Close icon](/img/logo_cross.png)  
*Close icon used in modals*

### 4.7 User placeholder image

**Field**: `user_placeholder`

**Description**: Default image for user profiles without a photo.

**Accepted formats**: PNG, JPG, SVG

**Recommended dimensions**:
- Width: 200px
- Height: 200px
- Format: Square

**Visible effect**:
- Default avatar in profiles
- Profile image in comments
- User icon in navigation

---

## 5. Saving the configuration

### Save button

**Label**: `Sauvegarder la configuration` / `Save Configuration`

**Button states**:

1. **Active (green)**: Changes have been detected  
   - Button is clickable  
   - Color: theme primary color

![Active button](/img/admin-save-button-active.png)  
*Active save button (changes detected)*

2. **Disabled (gray)**: No changes  
   - Button is not clickable  
   - Nothing to save

![Disabled button](/img/admin-save-button-disabled.png)  
*Disabled save button (no changes)*

3. **In progress (gray)**: Saving in progress  
   - Label: “Sauvegarde en cours...” / “Saving in progress...”  
   - Button is not clickable

### Save process

1. **Validation**: check color formats
2. **Conversion**: transform into a YAML file
3. **Upload**: send to the server with images
4. **Confirmation**: success or error message
5. **Reload**: page automatically reloads after 200ms

### Feedback messages

**Success**:
```
✓ Configuration updated successfully
```
- Green toast at the top of the screen
- Automatic page reload

**Color error**:
```
✗ Invalid color for [field_name]
```
- Red toast at the top of the screen
- Save is canceled

**Server error**:
```
✗ Error while updating configuration
```
- Red toast at the top of the screen
- Changes are not applied

---

## 6. Recommended workflow

### Step 1: Planning
1. Define your color palette (use tools like Coolors)
2. Prepare your images with the right dimensions
3. Test contrast for accessibility

### Step 2: Editing colors
1. Go to the admin panel (`/admin`)
2. Change the primary color first
3. Check the gradient previews
4. Adjust other colors accordingly
5. Make sure contrast is sufficient

### Step 3: Editing images
1. Upload the main logo
2. Check the preview
3. Upload other images if needed
4. Ensure dimensions are correct

### Step 4: Save and verify
1. Click “Save configuration”
2. Wait for the confirmation message
3. The page reloads automatically
4. Verify that all changes are applied
5. Test navigation in the application

---

## 7. Tips and best practices

### Colors

**Do**:
- Use colors with good contrast (minimum ratio 4.5:1)
- Test colors on different screens
- Keep consistency with your brand guidelines
- Use the full hex format (8 characters)

**Avoid**:
- Colors that are too light for text
- Too many different colors (stay consistent)
- Flashy colors that strain the eyes
- Forgetting transparency in the hex code

### Images

**Do**:
- Use SVG for logos and icons (best quality)
- Optimize image size (< 500 KB)
- Follow recommended dimensions
- Use transparent backgrounds for logos

**Avoid**:
- Heavy images (> 2 MB)
- Poor quality or pixelation
- Unsupported formats
- Incorrect dimensions

### Accessibility

- **Contrast**: ensure text is readable on all backgrounds
- **Color blindness**: test colors with color-blindness simulators
- **Size**: make sure icons are large enough (minimum 24×24px)

---

## 8. Troubleshooting

### Save button is disabled

**Cause**: No changes detected

**Solution**: Change at least one field to enable the button

### “Invalid color” message

**Cause**: Incorrect color format

**Solution**:
- Use the `#RRGGBBAA` format (8 characters)
- Valid example: `#1dac78ff`
- Invalid example: `#1dac78` (missing transparency)

### Images do not display

**Cause**: Unsupported format or size

**Solution**:
- Check the format (PNG, JPG, SVG)
- Reduce size if > 2 MB
- Verify dimensions

### Changes are not applied

**Cause**: Browser cache

**Solution**:
1. Clear browser cache (Ctrl + Shift + R)
2. Or wait for the automatic reload after saving

### Error while saving

**Cause**: Server connection issue

**Solution**:
1. Check your internet connection
2. Verify the backend server is running
3. Check server logs
4. Contact the system administrator

---

<a id="content-management"></a>

## Content management {#content-management}

On the right side of the admin panel (see the second screen), a new **Content management** tab lets you manage the service’s videos: listing, archiving, restoring, and permanently deleting.

![Overview of the content management page](/img/admin-video-gestion.png)

### Access and permissions

- **Administrators**: can see all videos, including archived ones; they can **restore** a video (republish it) or **permanently delete** a video and its metadata.
- **Standard users**: can **archive** their own videos from their user space; an archived video is no longer publicly visible and is not listed for the author in public views. Non-admin users do not see archived videos globally.

### Page layout

The page includes:

- Filters at the top: `All`, `Active`, `Archived` to switch between states.
- A table listing videos with the columns: **Title**, **Creator**, **Creation date**, **Views**, **Status**, **Actions**.

### Available actions

- **Archive** (user): hides the video from the public catalog and sets its status to “archived”.
- **Restore** (admin): republishes the video (visible in public lists) with its metadata.
- **Permanently delete** (admin): removes the video and its metadata from the platform — irreversible action.

### Expected behavior

- When a video is archived by its author, it disappears from public lists and is not visible by default. Only administrators can later restore or permanently delete it.
- Restoring brings back the visibility and metadata as they were before archiving, provided the media files are still present in storage.

### Best practices

- Verify that a backup exists before any **permanent deletion**.
- Log critical operations (restore, delete) for auditing.
- Notify the author before permanent deletion when possible.
