---
layout: wiki
title: "Custom Theme Editor"
description: "Create and edit custom themes — configure all 20 colour slots with a live preview, grouped by interface section."
parent: "Themes"
nav_order: 48
permalink: /wiki/theme-editor/
---

# Custom Theme Editor

The Custom Theme Editor gives you full control over your board's visual palette. Configure every colour slot across four interface sections, preview your changes in real-time, and save themes for use across your boards.

![Custom theme editor](/assets/wiki/theme-editor.png)

---

## Accessing the Theme Editor

You can open the Custom Theme Editor in several ways:

- **Board Settings → Theme & Background → Theme & Colouring** → click **"Add custom theme"** to start from scratch.
- **Board Settings → Theme & Background → Theme & Colouring** → click **Edit** on an existing custom theme card.
- **Board Settings → Theme & Background → Theme & Colouring** → click **Duplicate** on any theme to create an editable copy.

---

## Theme Name

At the top of the editor, enter a descriptive **theme name** (e.g. "Company Brand", "Night Mode", "Minimal Grey"). This name appears on the theme card in the catalog and helps you identify themes at a glance.

---

## Colour Editing by Section

The editor organises all colour slots into four logical groups matching the board interface areas they affect. Each slot provides a colour input with a visual swatch and supports any valid CSS colour value.

![Theme colour pickers by section](/assets/wiki/theme-editor-colours.png)

### Navbar

| Field | Description |
|-------|-------------|
| **Navbar background** | The main background colour of the board navigation bar at the top of the page. |
| **Navbar border/icon colour** | The colour applied to navbar borders, separator lines, and icon elements. |

### Lists / Columns

| Field | Description |
|-------|-------------|
| **List background** | The background colour of each list column container. |
| **List header text** | The colour of list title/header text. |
| **List muted text (shade 1)** | A lighter secondary text colour for metadata and supplementary information. |
| **List muted text (shade 2)** | An even lighter tertiary text colour for less prominent details. |
| **List control hover background** | The background colour that appears when hovering over list action buttons and controls. |
| **List shadow** | The shadow colour rendered beneath list columns to create depth. |
| **Add-list button background** | The background colour of the "Add list" button at the end of the board. |
| **Add-list button hover** | The hover state colour for the "Add list" button. |

### Card Detail Window

| Field | Description |
|-------|-------------|
| **Card detail background** | The main background of the card detail modal that opens when clicking a card. |
| **Title text** | The colour of the card title in the detail view. |
| **Body text** | The colour of card body text, description content, and general labels. |
| **Button background** | The default background colour of action buttons within the card modal. |
| **Button text** | The text colour on card modal buttons. |
| **Button hover background** | The background colour of buttons when hovered. |
| **Button hover text** | The text colour of buttons when hovered. |

### Scrollbars

| Field | Description |
|-------|-------------|
| **Scrollbar thumb colour** | The colour of custom scrollbar handles used throughout the board interface. |

---

## Intelligent Contrast Toggle

The **Intelligent Contrast** toggle is available within the editor. When enabled:

- Text colours are automatically adjusted to ensure a **WCAG 4.5:1 contrast ratio** against their respective backgrounds.
- You can focus on choosing background colours and accents, and the system handles text legibility.
- This is especially useful when experimenting with dark or vibrant backgrounds that might otherwise clash with your text colour choices.

When disabled, all colours are applied exactly as specified — giving you full manual control over every pairing.

---

## Live Preview Panel

The right side of the editor features a **live preview panel** that updates as you adjust colours. The preview renders a miniature board mockup showing:

- A **navbar** with the configured background and icon colours.
- **List columns** with headers, cards, and controls using the list palette.
- A **card detail mockup** showing the modal background, title, body text, and buttons.
- **Scrollbar** styling applied to scrollable areas.

This allows you to evaluate your palette in context without applying it to a real board first.

![Theme live preview panel](/assets/wiki/theme-editor-preview.png)

---

## Saving a Custom Theme

Once you're satisfied with your palette:

1. Ensure you've entered a theme name.
2. Click **Save Theme**.

The theme is saved to your personal theme collection and immediately appears in the theme catalog on any board you manage.

---

## Editing an Existing Theme

1. Open the theme catalog in Board Settings → Theme & Colouring.
2. Click **Edit** on your custom theme card.
3. Modify any colour slots or the theme name.
4. Click **Save** to apply your changes.

Changes to a theme are reflected on all boards currently using that theme — the update is immediate.

---

## Deleting a Custom Theme

1. Open the theme catalog.
2. Click **Delete** on the custom theme card.
3. Confirm the deletion in the modal.

If the deleted theme was applied to any boards, those boards revert to the default theme (Ocean Blue).

> **Note:** System themes cannot be deleted. Only custom themes you've created can be removed.

---

## Tips for Effective Themes

- **Start from a duplicate** — Duplicating a system theme gives you a proven starting point. Adjust a few colours at a time rather than changing everything at once.
- **Test with real content** — The live preview is helpful, but also apply your theme to a board with real cards and labels to see how it looks with actual data.
- **Consider accessibility** — Keep Intelligent Contrast enabled unless you have a specific reason to override it. Your colleagues may have different displays and lighting conditions.
- **Use consistent families** — Colours within the same hue family (e.g. various shades of blue) create cohesive, professional-looking themes.

---

## Related Pages

- [Themes Overview](/wiki/themes/) — Understanding the theming system and default themes.
- [Theme & Colouring (Board Settings)](/wiki/board-settings-theme/) — Applying themes to boards.
- [Theme Sharing & Management](/wiki/theme-sharing/) — Permissions and theme lifecycle.
