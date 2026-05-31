import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import {
  MEMBER_ACTION_COL_PX,
  MEMBER_ROLE_COL_PX,
  MEMBER_TABLE_ROW_PX,
} from './memberTableConstants.js';

export function createMemberTableVirtuosoComponents(options?: {
  readonly tableClassName?: string;
  readonly roleColPx?: number;
  readonly actionColPx?: number;
  readonly rowPx?: number;
}) {
  const tableClassName = options?.tableClassName ?? 'board-member-management__data-table';
  const roleColPx = options?.roleColPx ?? MEMBER_ROLE_COL_PX;
  const actionColPx = options?.actionColPx ?? MEMBER_ACTION_COL_PX;
  const rowPx = options?.rowPx ?? MEMBER_TABLE_ROW_PX;

  const DataTable = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
    ({ style, className, children, ...props }, ref) => (
      <table
        ref={ref}
        {...props}
        className={[tableClassName, className].filter(Boolean).join(' ')}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          ...style,
        }}
      >
        <colgroup>
          <col />
          <col style={{ width: roleColPx }} />
          <col style={{ width: actionColPx }} />
        </colgroup>
        {children}
      </table>
    ),
  );
  DataTable.displayName = 'MemberDataTable';

  const TableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
    ({ style, ...rest }, ref) => (
      <tr
        {...rest}
        ref={ref}
        style={{
          ...style,
          height: rowPx,
          boxSizing: 'border-box',
        }}
      />
    ),
  );
  TableRow.displayName = 'MemberTableRow';

  return {
    Table: DataTable,
    TableRow,
  } as const;
}

/** Default board/workspace member table Virtuoso components. */
export const defaultMemberTableVirtuosoComponents = createMemberTableVirtuosoComponents();
