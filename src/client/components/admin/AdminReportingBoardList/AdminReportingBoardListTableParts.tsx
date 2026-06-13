import { forwardRef, memo, type ComponentPropsWithoutRef } from 'react';
import { Button } from '@mantine/core';
import {
  ADMIN_BOARD_LIST_ACTION_COL_PX,
  ADMIN_BOARD_LIST_DATE_COL_PX,
  ADMIN_BOARD_LIST_MEMBERS_COL_PX,
  ADMIN_BOARD_LIST_NAME_COL_PX,
  ADMIN_BOARD_LIST_OWNER_COL_PX,
  ADMIN_BOARD_LIST_POSITION_COL_PX,
  ADMIN_BOARD_LIST_ROW_PX,
  ADMIN_BOARD_LIST_VISIBILITY_COL_PX,
  ADMIN_BOARD_LIST_WORKSPACE_COL_PX,
  formatBoardOwner,
  formatBoardVisibility,
  formatBoardWorkspace,
  formatReportingDateTime,
  type AdminBoardListRow,
} from './adminReportingBoardListUtils.js';

export const AdminBoardListDataTable = forwardRef<
  HTMLTableElement,
  ComponentPropsWithoutRef<'table'>
>(({ style, className, children, ...props }, ref) => (
  <table
    ref={ref}
    {...props}
    className={['admin-reporting-board-list__data-table', className].filter(Boolean).join(' ')}
    style={{
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      ...style,
    }}
  >
    <colgroup>
      <col style={{ width: ADMIN_BOARD_LIST_NAME_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_WORKSPACE_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_OWNER_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_MEMBERS_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_VISIBILITY_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_POSITION_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_DATE_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_DATE_COL_PX }} />
      <col style={{ width: ADMIN_BOARD_LIST_ACTION_COL_PX }} />
    </colgroup>
    {children}
  </table>
));
AdminBoardListDataTable.displayName = 'AdminBoardListDataTable';

export const AdminBoardListTableRow = forwardRef<
  HTMLTableRowElement,
  ComponentPropsWithoutRef<'tr'>
>(({ style, ...rest }, ref) => (
  <tr
    {...rest}
    ref={ref}
    style={{
      ...style,
      height: ADMIN_BOARD_LIST_ROW_PX,
      boxSizing: 'border-box',
    }}
  />
));
AdminBoardListTableRow.displayName = 'AdminBoardListTableRow';

export const adminBoardListTableVirtuosoComponents = {
  Table: AdminBoardListDataTable,
  TableRow: AdminBoardListTableRow,
};

export const AdminBoardListTableHeader = memo(function AdminBoardListTableHeader() {
  return (
    <tr>
      <th className="admin-reporting-board-list__th">Board name</th>
      <th className="admin-reporting-board-list__th">Workspace</th>
      <th className="admin-reporting-board-list__th">Owner</th>
      <th className="admin-reporting-board-list__th">Members</th>
      <th className="admin-reporting-board-list__th">Visibility</th>
      <th className="admin-reporting-board-list__th">Position</th>
      <th className="admin-reporting-board-list__th">Created</th>
      <th className="admin-reporting-board-list__th">Updated</th>
      <th className="admin-reporting-board-list__th admin-reporting-board-list__th--actions">Actions</th>
    </tr>
  );
});

export const AdminBoardListTableCells = memo(function AdminBoardListTableCells(props: {
  readonly rowIndex: number;
  readonly board: AdminBoardListRow;
  readonly deletingBoardId: string | null;
  readonly onDeleteClick: (board: AdminBoardListRow) => void;
}) {
  const { rowIndex, board, deletingBoardId, onDeleteClick } = props;
  const striped = rowIndex % 2 === 1;
  const tdClass = (extra?: string): string =>
    [
      'admin-reporting-board-list__td',
      striped ? 'admin-reporting-board-list__td--striped' : '',
      extra,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <>
      <td className={tdClass()} title={board.name}>
        {board.name}
      </td>
      <td className={tdClass()} title={formatBoardWorkspace(board)}>
        {formatBoardWorkspace(board)}
      </td>
      <td className={tdClass()} title={formatBoardOwner(board)}>
        {formatBoardOwner(board)}
      </td>
      <td className={tdClass('admin-reporting-board-list__td--numeric')}>{board.memberCount}</td>
      <td className={tdClass()}>{formatBoardVisibility(board.visibility)}</td>
      <td className={tdClass('admin-reporting-board-list__td--numeric')}>{board.position}</td>
      <td className={tdClass()}>{formatReportingDateTime(board.createdAt)}</td>
      <td className={tdClass()}>{formatReportingDateTime(board.updatedAt)}</td>
      <td className={tdClass('admin-reporting-board-list__td--actions')}>
        <Button
          size="xs"
          color="red"
          variant="light"
          loading={deletingBoardId === board._id}
          disabled={deletingBoardId != null && deletingBoardId !== board._id}
          onClick={() => {
            onDeleteClick(board);
          }}
        >
          Delete
        </Button>
      </td>
    </>
  );
});
