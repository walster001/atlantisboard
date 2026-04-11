# Boards home page

This page explains how the **boards home page** works for everyday users and for people configuring **roles and permissions**. The format is plain Markdown so it can be copied into a **GitHub wiki** later (GitHub wikis use Markdown pages).

---

## What the home page is

The home page is your **dashboard of workspaces and boards**. Each **workspace** appears as a section (a row) with a title and a **grid of board tiles** underneath. You open a board by clicking its tile (when you are not in the middle of a drag).

The list of workspaces you see is based on **membership**: workspaces you belong to, boards you own or are a member of, and similar rules. Not every board in the product appears here—only what your account is allowed to see on the home list.

---

## How workspace order works (your personal layout)

**Workspace order on the home page is personal to you.** The app stores your preferred order in your user preferences (field: `homeWorkspaceOrder`). That order is merged with the real list of workspaces you can access: any workspace you have access to but that is not yet in your saved order is still shown, typically after the ones you have ordered.

- If you have **not** customized order, workspaces are usually shown with **newer workspaces first** (by creation time).
- After you drag workspace rows into an order you like, that order is **remembered for your account** the next time you sign in or refresh.

### Who can reorder workspace rows?

You can **drag entire workspace sections** up or down **only if** you have the **`workspaces.update`** permission on that workspace (or you are in a situation the app treats as equivalent, such as being the workspace owner). In the UI this shows up as a **grip handle** (⋮⋮) next to the workspace name.

- **No grip** next to the title: you can still use the workspace, but you cannot reorder that row on your home page.
- **Grip visible**: drag the workspace row by that handle to change order; the new order is saved for **you**, not for everyone else’s home page.

Other workspace actions (rename, description, settings menu, delete) are gated separately where applicable; the drag handle specifically reflects **`workspaces.update`**.

---

## How board tiles and dragging work

### Dragging a board

- You drag a board from the **board tile itself** (the whole card), not from a separate “handle” on the card.
- While dragging, you may see a **floating preview** following the pointer and, when moving over another workspace’s grid, a **highlight** on that grid to show where a cross-workspace drop is possible.

### Same workspace: reorder only

If you drop the board **in the same workspace** it came from, you are **reordering** boards in that row. The app saves **new position numbers** for the boards in that workspace so the order matches what you dropped.

To reorder within a workspace, you must be allowed to reorder **every** board currently shown in that workspace row for that operation (see permissions below). If you are not allowed, you may see an error message and the layout will revert.

### Another workspace: move between rows

If you drop the board **into a different workspace’s** grid, you are **moving** the board to that workspace. The app:

1. Updates the board’s **workspace** on the server.
2. Adjusts **positions** in both the source and target workspace rows so lists stay consistent.

You need permission to **organize** both the source and target workspace rows (not only the board itself). If something fails, the UI rolls back and you may see an error.

### Clicks vs drags

Small movements are ignored as noise so a normal **click** still opens the board. If a drag was recognized, navigation on mouse-up may be suppressed briefly so you do not accidentally open a board after a drag.

---

## Permissions (what controls what)

The app loads **effective permissions** from the server for the boards and workspaces visible on the page. That includes **built-in roles** (viewer, manager, admin) and **custom permission sets** your organization may define. Permissions can refresh when the server signals that something changed (for example `permissions.updated` over the real-time connection).

Below is a **user-friendly** summary. Technical names in backticks match what developers and admins see in role configuration.

### Board tiles: when can you drag a board on the home page?

You can drag a board from the home grid if **any** of these apply:

- You are the **board owner**, or
- You have **`boards.reorder_in_home`** on that board, or
- You have **`boards.update`** on that board.

If none of these apply, the tile is not draggable on the home page (you may still open the board if you can view it).

### Same-workspace reorder: stricter rule

To **reorder all boards** in a workspace row together (so the whole row can be saved in a new order), **every** board in that row must be draggable under the rules above (owner, or `boards.reorder_in_home`, or `boards.update`). This avoids saving an order that would leave some boards in a state you are not allowed to change.

### Moving a board to another workspace

Moving a board **out of** one workspace and **into** another requires:

- Permission to **edit or organize** the board (similar ideas as above: owner, or board-level permissions such as **`boards.update`**, or being a board **admin/manager** in the classic sense on that board), **and**
- Permission to **organize both workspace rows** involved. That includes:
  - Workspace **owner**, or
  - **`workspaces.update`** on that workspace (from the workspace permission API), or
  - Workspace membership as **admin** or **manager** (built-in workspace roles that include home-row organization), in line with the server.

Workspaces marked **board-scoped home only** (a special mode) **block** moving boards between workspace rows for home organization; those workspaces are tailored for a narrower home experience.

### Workspace row drag (order of sections)

As described earlier, reordering **which workspace appears above which** uses the grip and requires **`workspaces.update`** (or equivalent, such as owning the workspace) for the row you are dragging.

### Board card menu

The **⋯** menu on a board tile (when shown) is tied to **`boards.update`** on that board, separate from drag permission.

---

## Saving and staying in sync

- **Workspace order** (your list of workspace ids) is saved to your **user preferences** when you finish a workspace-row drag.
- **Board order and workspace moves** are saved with **API calls** the moment you release the pointer after a valid drop. Other users (and your other devices) can see updates through the normal **real-time** mechanisms the app uses for boards and home-row position sync.

If you refresh the page after a successful move, the server is the source of truth: you should see the same workspace and order you left off with.

---

## Quick reference table

| What you want to do | Typical requirement (simplified) |
|---------------------|----------------------------------|
| Open a board | Can view that board (usual app rules) |
| Drag a board tile on home | Owner, or `boards.reorder_in_home`, or `boards.update` on that board |
| Reorder every board in one workspace row | Above permission **on every** board in that row |
| Move a board to another workspace | Can edit/organize the board **and** can organize **both** workspaces’ home rows |
| Drag workspace sections (grip) | `workspaces.update` (or owner); order saved in **your** preferences |

---

## For wiki editors

- Rename this file or split it into wiki pages as you like; internal links in GitHub wikis use `[[Page-Name]]` or standard Markdown links once pages exist.
- Permission **keys** (`workspaces.update`, `boards.reorder_in_home`, etc.) are stable identifiers for admins; rename in prose if your wiki audience is non-technical, but keep the keys in a glossary if you need support alignment.
