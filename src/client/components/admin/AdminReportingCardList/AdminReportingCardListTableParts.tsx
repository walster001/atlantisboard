import {
  forwardRef,
  memo,
  type ComponentPropsWithoutRef,
} from 'react';
import { Tooltip } from '@mantine/core';
import {
  ADMIN_CARD_LIST_ASSIGNEES_COL_PX,
  ADMIN_CARD_LIST_BOARD_COL_PX,
  ADMIN_CARD_LIST_DATES_COL_PX,
  ADMIN_CARD_LIST_LABELS_COL_PX,
  ADMIN_CARD_LIST_LIST_COL_PX,
  ADMIN_CARD_LIST_ROW_PX,
  ADMIN_CARD_LIST_TIMESTAMP_COL_PX,
  ADMIN_CARD_LIST_TITLE_COL_PX,
  formatAssigneeSummary,
  formatCardDueDates,
  formatLabelCount,
  formatReportingDateTime,
  type AdminReportingCardListRow,
} from './adminReportingCardListUtils.js';

export const AdminReportingCardListDataTable = forwardRef<
  HTMLTableElement,
  ComponentPropsWithoutRef<'table'>
>(({ style, className, children, ...props }, ref) => (
  <table
    ref={ref}
    {...props}
    className={['admin-reporting-card-list__data-table', className].filter(Boolean).join(' ')}
    style={{
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      ...style,
    }}
  >
    <colgroup>
      <col style={{ width: ADMIN_CARD_LIST_BOARD_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_LIST_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_TITLE_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_DATES_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_ASSIGNEES_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_LABELS_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_TIMESTAMP_COL_PX }} />
      <col style={{ width: ADMIN_CARD_LIST_TIMESTAMP_COL_PX }} />
    </colgroup>
    {children}
  </table>
));
AdminReportingCardListDataTable.displayName = 'AdminReportingCardListDataTable';

export const AdminReportingCardListTableRow = forwardRef<
  HTMLTableRowElement,
  ComponentPropsWithoutRef<'tr'>
>(({ style, ...rest }, ref) => (
  <tr
    {...rest}
    ref={ref}
    style={{
      ...style,
      height: ADMIN_CARD_LIST_ROW_PX,
      boxSizing: 'border-box',
    }}
  />
));
AdminReportingCardListTableRow.displayName = 'AdminReportingCardListTableRow';

export const adminReportingCardListTableVirtuosoComponents = {
  Table: AdminReportingCardListDataTable,
  TableRow: AdminReportingCardListTableRow,
};

export const AdminReportingCardListTableCells = memo(function AdminReportingCardListTableCells(props: {
  readonly rowIndex: number;
  readonly row: AdminReportingCardListRow;
}) {
  const { rowIndex, row } = props;
  const striped = rowIndex % 2 === 1;
  const tdClass = (extra?: string): string =>
    ['admin-reporting-card-list__td', striped ? 'admin-reporting-card-list__td--striped' : '', extra]
      .filter(Boolean)
      .join(' ');

  const assigneeSummary = formatAssigneeSummary(row);
  const assigneeCell =
    row.assigneeCount > 0 ? (
      <Tooltip label={`${row.assigneeCount} assignee(s)`} withArrow>
        <span>{assigneeSummary}</span>
      </Tooltip>
    ) : (
      assigneeSummary
    );

  return (
    <>
      <td className={tdClass()} title={row.boardName}>
        {row.boardName}
      </td>
      <td className={tdClass()} title={row.listName}>
        {row.listName}
      </td>
      <td className={tdClass()} title={row.title}>
        {row.title}
      </td>
      <td className={tdClass()} title={formatCardDueDates(row)}>
        {formatCardDueDates(row)}
      </td>
      <td className={tdClass('admin-reporting-card-list__td--numeric')}>{assigneeCell}</td>
      <td className={tdClass('admin-reporting-card-list__td--numeric')}>{formatLabelCount(row)}</td>
      <td className={tdClass()}>{formatReportingDateTime(row.createdAt)}</td>
      <td className={tdClass()}>{formatReportingDateTime(row.updatedAt)}</td>
    </>
  );
});

export function AdminReportingCardListTableHeader() {
  return (
    <tr>
      <th className="admin-reporting-card-list__th">Board</th>
      <th className="admin-reporting-card-list__th">List name</th>
      <th className="admin-reporting-card-list__th">Card title</th>
      <th className="admin-reporting-card-list__th">Due dates</th>
      <th className="admin-reporting-card-list__th">Assignees</th>
      <th className="admin-reporting-card-list__th">Labels</th>
      <th className="admin-reporting-card-list__th">Created</th>
      <th className="admin-reporting-card-list__th">Updated</th>
    </tr>
  );
}
