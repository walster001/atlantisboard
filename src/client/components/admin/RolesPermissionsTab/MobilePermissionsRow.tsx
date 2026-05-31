import type { ReactElement, ReactNode } from 'react';

export function MobilePermissionsRow(props: {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly rightSection?: ReactNode;
}): ReactElement {
  const { onClick, children, rightSection } = props;
  return (
    <button type="button" className="roles-permissions-tab__mobile-row" onClick={onClick}>
      <span className="roles-permissions-tab__mobile-row-label">{children}</span>
      {rightSection != null ? (
        <span className="roles-permissions-tab__mobile-row-trailing">{rightSection}</span>
      ) : null}
    </button>
  );
}
