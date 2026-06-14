import { startTransition } from 'react';
import { Box, Stack, Text, Title } from '@mantine/core';
import {
  REPORTING_SUBTABS,
  type ReportingSubtab,
} from '../../pages/AdminConfigurationPage/tabsConfig.js';
import { AdminReportingBoardActivityPanel } from './AdminReportingBoardActivity/AdminReportingBoardActivityPanel.js';
import { AdminReportingBoardListPanel } from './AdminReportingBoardList/AdminReportingBoardListPanel.js';
import { AdminReportingCardListPanel } from './AdminReportingCardList/AdminReportingCardListPanel.js';
import { AdminReportingMemberActivityPanel } from './AdminReportingMemberActivity/AdminReportingMemberActivityPanel.js';
import {
  useAdminReportingBoardNameFilter,
  type AdminReportingBoardNameFilterControls,
} from './AdminReportingActivityControls/useAdminReportingBoardNameFilter.js';
import {
  useAdminReportingDaysFilter,
  type AdminReportingDaysFilterControls,
} from './AdminReportingActivityControls/useAdminReportingDaysFilter.js';
import './AdminReportingBoardActivity/adminReportingBoardActivity.css';
import './AdminReportingActivityControls/adminReportingActivityControls.css';
import './AdminReportingBoardList/adminReportingBoardList.css';
import './AdminReportingCardList/adminReportingCardList.css';
import './AdminReportingMemberActivity/adminReportingMemberActivity.css';

function reportingSubtabLabel(subtab: ReportingSubtab): string {
  return REPORTING_SUBTABS.find((tab) => tab.value === subtab)?.label ?? subtab;
}

function ReportingPlaceholder({ label }: { readonly label: string }) {
  return (
    <Stack gap="xs">
      <Title order={3}>{label}</Title>
      <Text size="sm" c="dimmed">
        This section will be configured in a follow-up change.
      </Text>
    </Stack>
  );
}

function ReportingPanelContent({
  subtab,
  boardNameFilter,
  daysFilter,
}: {
  readonly subtab: ReportingSubtab;
  readonly boardNameFilter: AdminReportingBoardNameFilterControls;
  readonly daysFilter: AdminReportingDaysFilterControls;
}) {
  if (subtab === 'member-activity') {
    return (
      <AdminReportingMemberActivityPanel
        boardNameFilter={boardNameFilter}
        daysFilter={daysFilter}
      />
    );
  }
  if (subtab === 'board-activity') {
    return (
      <AdminReportingBoardActivityPanel
        boardNameFilter={boardNameFilter}
        daysFilter={daysFilter}
      />
    );
  }
  if (subtab === 'board-list') {
    return <AdminReportingBoardListPanel />;
  }
  if (subtab === 'card-list') {
    return <AdminReportingCardListPanel />;
  }
  return <ReportingPlaceholder label={reportingSubtabLabel(subtab)} />;
}

interface AdminReportingSectionProps {
  readonly subtab: ReportingSubtab;
  readonly onSubtabChange: (value: ReportingSubtab) => void;
}

export function AdminReportingSection({ subtab, onSubtabChange }: AdminReportingSectionProps) {
  const boardNameFilter = useAdminReportingBoardNameFilter();
  const daysFilter = useAdminReportingDaysFilter();
  const layoutClassName =
    subtab === 'member-activity'
      ? 'admin-configuration-page__layout admin-configuration-page__layout--reporting-member-activity'
      : subtab === 'board-activity'
        ? 'admin-configuration-page__layout admin-configuration-page__layout--reporting-board-activity'
        : subtab === 'board-list'
          ? 'admin-configuration-page__layout admin-configuration-page__layout--reporting-board-list'
          : subtab === 'card-list'
            ? 'admin-configuration-page__layout admin-configuration-page__layout--reporting-card-list'
            : 'admin-configuration-page__layout';

  return (
    <div className={layoutClassName}>
      <nav className="admin-configuration-page__sidebar" aria-label="Reporting sections">
        {REPORTING_SUBTABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className="admin-configuration-page__subtab"
            data-active={subtab === tab.value ? 'true' : 'false'}
            onClick={() => {
              startTransition(() => {
                onSubtabChange(tab.value);
              });
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <Box className="admin-configuration-page__content">
        <ReportingPanelContent
          subtab={subtab}
          boardNameFilter={boardNameFilter}
          daysFilter={daysFilter}
        />
      </Box>
    </div>
  );
}

export function AdminReportingMobileList(props: {
  readonly onSelect: (value: ReportingSubtab) => void;
}) {
  const { onSelect } = props;
  return (
    <Stack gap="xs" className="admin-reporting-section__mobile-list">
      {REPORTING_SUBTABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className="admin-configuration-page__mobile-row"
          onClick={() => {
            onSelect(tab.value);
          }}
        >
          {tab.label}
        </button>
      ))}
    </Stack>
  );
}

export function AdminReportingMobileContent(props: { readonly subtab: ReportingSubtab }) {
  const { subtab } = props;
  const boardNameFilter = useAdminReportingBoardNameFilter();
  const daysFilter = useAdminReportingDaysFilter();
  return (
    <Box className="admin-reporting-section--mobile">
      <ReportingPanelContent
        subtab={subtab}
        boardNameFilter={boardNameFilter}
        daysFilter={daysFilter}
      />
    </Box>
  );
}
