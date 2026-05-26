---
layout: wiki
title: "Drag & Drop"
description: "How drag-and-drop works — custom pointer event system, dragging cards and lists, mobile long-press, auto-scroll zones, and visual indicators."
parent: "Boards"
nav_order: 36
permalink: /wiki/drag-and-drop/
---

# Drag & Drop

Drag-and-drop is central to the Atlantisboard experience. It powers card reordering, moving cards between lists, rearranging list columns, and even reorganising workspaces and boards on the home page.

![Dragging a card between lists](/assets/wiki/drag-and-drop.png)

---

## How It Works

Atlantisboard uses a custom delegated pointer-based drag-and-drop implementation built on **@atlaskit/pragmatic-drag-and-drop**. Rather than relying on the browser's native HTML5 drag-and-drop API (which has limited mobile support and inconsistent behaviour), the system listens to low-level pointer events to provide a smooth, consistent experience across desktop and touch devices.

---

## Dragging Cards

### Reorder Within a List

Grab a card and drag it up or down within the same list to change its position. A visual drop indicator shows where the card will land when you release.

### Move Between Lists

Drag a card horizontally out of its current list and into another list. The target list highlights to show it is ready to receive the card, and a drop indicator appears at the insertion point.

### Permissions

- **Reorder cards** within a list requires the `cards.reorder` permission.
- **Move cards** between lists requires the `cards.move` permission.

If you lack these permissions, drag handles are not displayed and drag gestures are not initiated.

---

## Dragging Lists

Drag a list column by its header to reorder it among the other columns on the board. Lists can be moved left or right, and other columns shift to make room.

List reordering requires the `lists.reorder` permission.

---

## Touch Device Support

On mobile and tablet devices, drag-and-drop uses a **long-press** gesture to initiate:

1. **Press and hold** a card or list header for a short moment (the configurable arming gesture).
2. The item lifts visually, indicating that a drag is active.
3. **Move your finger** to reposition the item.
4. **Release** to drop the item in its new position.

This long-press approach prevents accidental drags when scrolling through cards or lists.

---

## Visual Feedback

The drag system provides clear visual cues throughout the interaction:

| Indicator | Description |
|-----------|-------------|
| **Drag preview** | A semi-transparent copy of the dragged item follows your cursor or finger. |
| **Drop indicator line** | A highlighted line or gap appears at the target position where the item will be dropped. |
| **Placeholder shadow** | The original position of the dragged item shows a faded placeholder so you can see where it came from. |
| **List highlight** | When dragging a card over a different list, the target list's background subtly highlights. |

---

## Scroll-Zone Auto-Scroll

When dragging an item near the edge of the board canvas, the view automatically scrolls in that direction:

- **Left and right edges** — horizontal auto-scroll for navigating between off-screen lists.
- **Top and bottom edges** — vertical auto-scroll within a list when reordering cards in a long list.

The scroll speed increases the closer you drag to the edge, giving you fine-grained control over positioning.

---

## Home Page Drag-and-Drop

Drag-and-drop also works on the [home page](/wiki/home-page/):

- **Workspace rows** — drag workspace headers to reorder them. Your preferred order is saved per user.
- **Board tiles** — drag board tiles to reorder within a workspace or move them to a different workspace section.

---

## Related Pages

- [Board Overview](/wiki/board-overview/) — the board canvas where lists and cards live.
- [Lists & Columns](/wiki/lists/) — creating and managing lists.
- [Cards](/wiki/cards/) — card previews and interactions.
- [The Home Page](/wiki/home-page/) — home page workspace and board tile drag-and-drop.
