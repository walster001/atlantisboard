---
layout: wiki
title: "Sharing & Managing Themes"
description: "Understand theme ownership, permissions, applying themes to boards, and duplicating system themes."
parent: "Themes"
nav_order: 49
permalink: /wiki/theme-sharing/
---

# Sharing & Managing Themes

This page explains how theme ownership works, which permissions control theme actions, and how to manage your theme collection effectively.

---

## Theme Scope

Custom themes in Atlantisboard are **user-scoped** — each user maintains their own collection of custom themes. This means:

- Themes you create are visible only to you in the theme catalog.
- Other users cannot see, edit, or delete your custom themes.
- When you apply one of your custom themes to a board, the theme's colour values are applied to that board for everyone — but the theme itself remains yours to manage.

System themes are shared by all users and always available in every theme catalog.

---

## Required Permissions

Theme actions are controlled by two permission flags within the role-based permission system:

### `boards.themes.customtheme`

Grants the ability to:

- Create new custom themes.
- Edit existing custom themes you own.
- Delete custom themes you own.
- Duplicate system themes into your personal collection.

Without this permission, you can only view and select from existing system themes.

### `boards.themes.changetheme`

Grants the ability to:

- Apply any theme (system or custom) to boards you manage.
- Switch between themes on a board.
- Revert a board to the default theme.

Without this permission, you can view the current theme but cannot change it.

---

## Applying a Theme to a Board

1. Open the board and navigate to **Board Settings → Theme & Background → Theme & Colouring**.
2. Browse the theme catalog showing available system themes and your custom themes.
3. Click on a theme card or select **Apply** to set it as the active theme.

The board's visual appearance updates immediately for all users viewing that board.

---

## Removing a Theme

To revert a board to the default appearance:

1. Open the theme catalog in Board Settings.
2. Select the **Ocean Blue** theme (the default).

Alternatively, if a custom theme is currently active and you want to remove it:

- Switch to any other theme.
- The previous theme remains in your collection for future use — it is not deleted.

---

## Duplicating System Themes

System themes cannot be edited directly, but you can create a personal copy for customisation:

1. In the theme catalog, locate the system theme you want to modify.
2. Click **Duplicate** on the theme card.
3. A copy appears in your custom themes collection with the name "Copy of [Theme Name]".
4. Open the copy in the [Custom Theme Editor](/wiki/theme-editor/) to rename it and adjust colours.

This workflow lets you use a system theme as a starting point while preserving the original for reference or revert.

---

## Managing Your Theme Collection

### Viewing Your Themes

All your custom themes appear in the theme catalog alongside system themes. They are visually distinct from system themes and include **Edit** and **Delete** options.

### Editing

Click **Edit** on any custom theme to open the [Custom Theme Editor](/wiki/theme-editor/). Changes are saved instantly and reflected on any boards currently using that theme.

### Deleting

Click **Delete** to permanently remove a custom theme. If the theme is currently applied to any boards, those boards revert to Ocean Blue (the default). A confirmation modal prevents accidental deletion.

---

## Theme Lifecycle Summary

| Action | Permission Required | Effect |
|--------|-------------------|--------|
| View theme catalog | (any board member) | See available themes |
| Apply theme to a board | `boards.themes.changetheme` | Board adopts the selected palette |
| Create custom theme | `boards.themes.customtheme` | New theme added to your collection |
| Edit custom theme | `boards.themes.customtheme` | Theme updated; boards using it refresh |
| Delete custom theme | `boards.themes.customtheme` | Theme removed; affected boards revert to default |
| Duplicate system theme | `boards.themes.customtheme` | Editable copy created in your collection |

---

## Related Pages

- [Themes Overview](/wiki/themes/) — Understanding the theming system and all 8 default themes.
- [Custom Theme Editor](/wiki/theme-editor/) — Full guide to creating and editing custom themes.
- [Theme & Colouring (Board Settings)](/wiki/board-settings-theme/) — Applying themes within a board's settings.
- [Permissions & Roles](/wiki/admin-permissions/) — Configure which roles have theme-related permissions.
