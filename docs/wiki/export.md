---
layout: wiki
title: "Exporting Boards"
description: "Export boards to CSV, Trello JSON, Wekan JSON, or Atlantisboard JSON with configurable columns and embedded attachments."
parent: "Import & Export"
nav_order: 51
permalink: /wiki/export/
---

# Exporting Boards

Atlantisboard supports exporting your board data in multiple formats — whether you need a spreadsheet for reporting, a file for migrating to another tool, or a full backup with attachments.

![Export options](images/export-options.png)

---

## Export Formats

Four export formats are available, each gated by a role permission:

### CSV

**Permission:** `export.board.csv`

Exports card data in a standard comma-separated values file suitable for spreadsheets, data analysis, or integration with other tools.

**Configurable columns:**

| Column | Description |
|--------|-------------|
| Title | Card title |
| Description | Card description (plain text) |
| List | The list/column the card belongs to |
| Labels | Comma-separated label names |
| Assignees | Comma-separated assignee names |
| Due date | Card due date |
| Start date | Card start date |
| Completed | Whether the card is marked complete |
| Created | Card creation timestamp |
| Updated | Card last-modified timestamp |

You can select which columns to include before exporting, tailoring the output to your specific needs.

---

### Trello JSON

**Permission:** `export.board.trello`

Exports the board in a Trello-compatible JSON format. This file can be imported into Trello or any other tool that supports the Trello export format.

**Includes:**
- Board name and description
- Lists with positions
- Cards with titles, descriptions, positions, due dates
- Labels
- Checklists and checklist items
- Comments

---

### Wekan JSON

**Permission:** `export.board.wekan`

Exports the board in a Wekan-compatible JSON format, suitable for importing into Wekan instances.

**Includes:**
- Board structure and metadata
- Lists (mapped to Wekan's list format)
- Cards with all standard fields
- Labels
- Checklists
- Comments

---

### Atlantisboard JSON

**Permission:** `export.board.atlantisboard`

The native export format that preserves complete board data with maximum fidelity. This is the best choice for backups and transfers between Atlantisboard instances.

**Includes:**
- Complete board settings and metadata
- All lists, cards, labels, and checklists
- Comments and activity history
- Card attachments embedded as data URLs (up to **25 MB** total embedded attachment size)
- User references and role assignments

> **Note:** The 25 MB embedded attachment limit is a per-export cap. If your board's total attachment size exceeds this, larger attachments are excluded from the export with a reference note. For full backup including all attachments regardless of size, use the [Backup & Restore](admin-backup.md) system instead.

---

## Export Flow

### From the Home Page

1. Right-click a board tile (or click its three-dot menu) to open the board context menu.
2. Select **Export board**.
3. Choose the export format.
4. (For CSV) Optionally configure which columns to include.
5. The file downloads automatically.

### From the Import/Export Modal

1. Open the Import/Export modal from the home page.
2. Switch to the **Export** tab.
3. Select the board to export (if not already selected).
4. Choose the export format.
5. (For CSV) Configure columns.
6. Click **Export** to download.

---

## Download Behaviour

Export files are served with the `Content-Disposition: attachment` header, triggering a browser download. File naming follows the pattern:

- `board-name-export.csv`
- `board-name-export.json` (with format-specific content)

---

## Permissions Summary

| Format | Required Permission |
|--------|-------------------|
| CSV | `export.board.csv` |
| Trello JSON | `export.board.trello` |
| Wekan JSON | `export.board.wekan` |
| Atlantisboard JSON | `export.board.atlantisboard` |

If you don't see an export option, your current role may not include the corresponding permission. Contact your board or app administrator to request access.

---

## Use Cases

- **Reporting** — Export to CSV for use in spreadsheets, BI tools, or project reports.
- **Migration** — Export to Trello or Wekan format when moving to another platform.
- **Board backup** — Export to Atlantisboard JSON for a portable board backup with attachments.
- **Data archival** — Export completed boards before deletion for long-term storage.

---

## Related Pages

- [Importing Boards](import.md) — Import boards from the same formats.
- [Backup & Restore](admin-backup.md) — Full system backup including all attachments without size limits.
- [Permissions & Roles](admin-permissions.md) — Configure export permissions per role.
