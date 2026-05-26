---
layout: wiki
title: "Keyboard Shortcuts & Tips"
description: "Keyboard interactions, mobile gestures, accessibility features, and navigation tips for efficient use."
nav_order: 53
permalink: /wiki/keyboard-shortcuts/
---

# Keyboard Shortcuts & Tips

Atlantisboard is designed to be efficient with keyboard, mouse, and touch interactions. This page covers standard keyboard patterns, mobile gestures, accessibility support, and general navigation tips.

---

## Standard Keyboard Interactions

Atlantisboard follows standard web application keyboard conventions:

### Navigation

| Key | Action |
|-----|--------|
| **Tab** | Move focus to the next interactive element. |
| **Shift + Tab** | Move focus to the previous interactive element. |
| **Enter** | Activate the focused button, link, or control. |
| **Escape** | Close the current modal, dropdown, or overlay. Return to the previous context. |
| **Arrow keys** | Navigate within dropdowns, menus, and selectable lists. |

### Text Editing

| Key | Action |
|-----|--------|
| **Enter** | Submit a form field or confirm an inline edit (context-dependent). |
| **Escape** | Cancel an inline edit and revert to the original value. |
| **Ctrl/Cmd + A** | Select all text in the focused input. |
| **Ctrl/Cmd + Z** | Undo the last text change (within text editors). |
| **Ctrl/Cmd + Shift + Z** | Redo (within text editors). |

### Card Description (Rich Text Editor)

The card description uses a Tiptap-based rich text editor with these formatting shortcuts:

| Key | Action |
|-----|--------|
| **Ctrl/Cmd + B** | Bold |
| **Ctrl/Cmd + I** | Italic |
| **Ctrl/Cmd + U** | Underline |
| **Ctrl/Cmd + E** | Inline code |
| **Ctrl/Cmd + K** | Insert/edit link |
| **Ctrl/Cmd + Shift + X** | Strikethrough |

### Modals and Overlays

| Key | Action |
|-----|--------|
| **Escape** | Close the topmost modal or overlay. |
| **Tab** | Cycle focus within the modal (focus trap — focus stays within the open modal). |

---

## Mobile Gesture Tips

On touch devices, Atlantisboard supports gesture-based interactions optimised for smaller screens:

### Long-Press Drag

Initiate drag-and-drop operations by **long-pressing** an item:

| Target | Gesture | Result |
|--------|---------|--------|
| **Card** | Long-press, then drag | Move the card within or between lists. |
| **List header** | Long-press, then drag | Reorder the list left or right on the board. |
| **Workspace row** | Long-press, then drag | Reorder workspaces on the home page. |
| **Board tile** | Long-press, then drag | Move a board between workspaces. |

The long-press arming gesture prevents accidental drags during normal scrolling.

### Swipe-Down Close

On the card detail modal, **swipe down** from the top of the modal to close it. This provides a natural, one-handed dismissal gesture that mirrors native mobile app behaviour.

### Scroll Behaviour

- **Horizontal swipe** on the board scrolls between lists.
- **Vertical swipe** within a list scrolls through cards.
- The two gestures are disambiguated by direction — diagonal swipes are interpreted based on the dominant axis.

---

## Accessibility

Atlantisboard is built with accessibility in mind, following web accessibility best practices:

### ARIA Labels

All interactive elements carry appropriate ARIA attributes:

- Buttons, links, and controls have descriptive `aria-label` values.
- Dynamic content updates announce changes to screen readers via `aria-live` regions.
- Modal dialogs use `role="dialog"` with proper `aria-labelledby` and `aria-describedby` attributes.
- Form inputs are associated with their labels via `id`/`for` attributes or `aria-labelledby`.

### Screen Reader Support

- Page structure uses semantic HTML (`<nav>`, `<main>`, `<header>`, `<section>`) for clear landmark navigation.
- Lists and cards render with proper list semantics for screen readers.
- Status changes (online/offline, save confirmations, errors) are announced via live regions.
- The [Intelligent Contrast](/wiki/board-settings-theme/) feature ensures WCAG 4.5:1 contrast ratios for text.

### Focus Management

- Modals trap focus — tabbing cycles within the modal until it's closed.
- When a modal closes, focus returns to the element that triggered it.
- Dropdown menus support arrow key navigation and close on Escape.
- Newly created elements (cards, lists) receive focus automatically.

### Motion Preferences

- Animations respect the `prefers-reduced-motion` system preference.
- Users who have reduced motion enabled see simplified or no transitions.

---

## Navigation Tips

### Getting Around Quickly

- **Back to home** — Click the back arrow in the board navbar, or use the browser's back button.
- **Between boards** — Return to the home page and select another board tile.
- **Board settings** — Click the gear icon in the board navbar.
- **User menu** — Click your avatar in the top-right corner for profile settings, theme preference, and logout.

### Browser Shortcuts That Help

| Key | Action |
|-----|--------|
| **Ctrl/Cmd + L** | Focus the browser address bar (useful for switching instances). |
| **Alt + Left Arrow** | Browser back (return to previous page). |
| **Ctrl/Cmd + R** | Reload the page (forces re-sync with server). |
| **F11** | Toggle fullscreen (maximises board real estate). |

### Search and Filter

- Use the board [filter bar](/wiki/filtering-search/) to narrow visible cards by label, member, or due date.
- Search by card title or description content to locate specific items.
- In admin panels and member lists, use the search fields to quickly find users.

---

## Related Pages

- [Board Overview](/wiki/board-overview/) — Navigating the board interface.
- [Drag & Drop](/wiki/drag-and-drop/) — Detailed drag-and-drop behaviour and permissions.
- [Card Detail](/wiki/card-detail/) — All interactions within the card detail modal.
- [Filtering & Search](/wiki/filtering-search/) — Finding cards with the filter bar.
