import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';
import { memo } from 'react';

interface AdminReportingBoardNameFilterProps {
  readonly boardFilterId: string | null;
  readonly boardFilterLabel: string | null;
  readonly boardOptions: readonly { readonly value: string; readonly label: string }[];
  readonly loadingOptions: boolean;
  readonly onBoardFilterSelect: (boardId: string) => void;
  readonly onClearBoardFilter: () => void;
}

export const AdminReportingBoardNameFilter = memo(function AdminReportingBoardNameFilter({
  boardFilterId,
  boardFilterLabel,
  boardOptions,
  loadingOptions,
  onBoardFilterSelect,
  onClearBoardFilter,
}: AdminReportingBoardNameFilterProps) {
  return (
    <Group
      gap="xs"
      align="center"
      wrap="nowrap"
      className="admin-reporting-board-name-filter"
      style={{ minWidth: 0 }}
    >
      <Text fw={600} size="sm" className="admin-reporting-board-name-filter__label" style={{ flexShrink: 0 }}>
        Board name
      </Text>
      {boardFilterId != null && boardFilterLabel != null ? (
        <Badge
          variant="light"
          size="sm"
          color="blue"
          className="admin-reporting-board-name-filter__badge"
          rightSection={
            <ActionIcon
              size="xs"
              variant="transparent"
              color="blue"
              className="admin-reporting-board-name-filter__clear"
              aria-label="Clear board filter"
              onClick={onClearBoardFilter}
            >
              <IconX size={12} stroke={2} className="admin-reporting-board-name-filter__clear-icon" />
            </ActionIcon>
          }
        >
          {boardFilterLabel}
        </Badge>
      ) : null}
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant={boardFilterId != null ? 'light' : 'subtle'}
            color={boardFilterId != null ? 'blue' : 'gray'}
            className="admin-reporting-board-name-filter__filter"
            aria-label="Filter activity by board"
            disabled={loadingOptions}
          >
            <IconFilter size={18} stroke={1.75} className="admin-reporting-board-name-filter__filter-icon" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {boardOptions.length === 0 ? (
            <Menu.Item disabled>No boards available</Menu.Item>
          ) : (
            boardOptions.map((option) => (
              <Menu.Item
                key={option.value}
                onClick={() => {
                  onBoardFilterSelect(option.value);
                }}
              >
                {option.label}
              </Menu.Item>
            ))
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
});
