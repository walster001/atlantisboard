import { useMemo } from 'react';
import { Box, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { TableVirtuoso } from 'react-virtuoso';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import { MEMBER_TABLE_ROW_PX, MEMBER_VIRTUOSO_OVERSCAN, MEMBER_VIRTUOSO_VIEWPORT_PAD } from '../members/shared/memberTableConstants.js';
import { BoardMemberEnterToSearchField } from '../board/BoardMemberEnterToSearchField.js';
import { useAppAdminMemberManagement, type AppAdminUserRow } from '../../hooks/admin/useAppAdminMemberManagement.js';
import {
  AppAdminUserTableCells,
  createAppAdminTableComponents,
  DirectoryUserTableCells,
  TABLE_ROW_PX_MOBILE,
} from './AppAdminMemberTableParts.js';
import { cannotRemoveOwnBootstrapAccess } from './appAdminMemberTypes.js';
import '../board/boardMemberManagement.css';

export type { AppAdminUserRow };

interface AppAdminMemberManagementProps {
  readonly appAdmins: readonly AppAdminUserRow[];
  readonly onAppAdminsChange: () => Promise<void>;
  readonly currentUserId: string | undefined;
  readonly bootstrapAppAdminId: string | null;
}

export function AppAdminMemberManagement({
  appAdmins,
  onAppAdminsChange,
  currentUserId,
  bootstrapAppAdminId,
}: AppAdminMemberManagementProps) {
  const {
    directoryQuery,
    setDirectoryQuery,
    directoryUsers,
    directoryLoading,
    directoryLoadingMore,
    memberFilterQuery,
    setMemberFilterQuery,
    filteredAdmins,
    handleDirectoryEndReached,
    handleAdd,
    handleRemove,
  } = useAppAdminMemberManagement(appAdmins, onAppAdminsChange);

  const isMobileStackedLayout = useResponsiveTier() === 'mobile';
  const tableRowPx = isMobileStackedLayout ? TABLE_ROW_PX_MOBILE : MEMBER_TABLE_ROW_PX;

  const directoryTableComponents = useMemo(
    () =>
      createAppAdminTableComponents({
        compactLayout: isMobileStackedLayout,
        includeRoleColumn: false,
      }),
    [isMobileStackedLayout],
  );

  const adminsTableComponents = useMemo(
    () =>
      createAppAdminTableComponents({
        compactLayout: isMobileStackedLayout,
        includeRoleColumn: !isMobileStackedLayout,
      }),
    [isMobileStackedLayout],
  );

  return (
    <Box
      className={[
        'board-member-management__root',
        isMobileStackedLayout ? 'board-member-management__root--app-admin-mobile' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={
          isMobileStackedLayout
            ? 'board-member-management__grid board-member-management__grid--mobile-stacked board-member-management__grid--app-admin-mobile'
            : 'board-member-management__grid'
        }
      >
        <Paper
          withBorder={!isMobileStackedLayout}
          radius={isMobileStackedLayout ? 0 : 'md'}
          p={isMobileStackedLayout ? 0 : 'md'}
          className="board-member-management__panel-paper"
          h="100%"
        >
          <Stack gap={isMobileStackedLayout ? 'xs' : 'md'} style={{ flexShrink: 0 }}>
            <Text fw={700} size={isMobileStackedLayout ? 'sm' : 'md'}>
              All Users
            </Text>
            <BoardMemberEnterToSearchField
              ariaLabel="Search registered users"
              placeholder="Search users to add..."
              onCommit={setDirectoryQuery}
            />
            {!isMobileStackedLayout ? (
              <Text size="sm" c="dimmed">
                Non–App Admins only. Search filters the directory; press Enter to apply.
              </Text>
            ) : null}
          </Stack>
          <Box
            className="board-member-management__table-scroll"
            style={{
              maxHeight: '100%',
              overflow: 'hidden',
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {directoryLoading ? (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            ) : directoryUsers.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {directoryQuery.trim() !== ''
                  ? 'No users match your search.'
                  : 'Every registered user is already an App Admin, or no users exist yet.'}
              </Text>
            ) : (
              <TableVirtuoso
                className="board-member-management__virtuoso-root"
                style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                data={directoryUsers}
                components={directoryTableComponents}
                computeItemKey={(_index, user) => user._id}
                fixedItemHeight={tableRowPx}
                increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
                overscan={MEMBER_VIRTUOSO_OVERSCAN}
                endReached={handleDirectoryEndReached}
                itemContent={(_index, user) => (
                  <DirectoryUserTableCells
                    user={user}
                    compactLayout={isMobileStackedLayout}
                    onAdd={(row) => {
                      void handleAdd(row);
                    }}
                  />
                )}
              />
            )}
            {directoryLoadingMore ? (
              <Group justify="center" py="xs">
                <Loader size="xs" />
              </Group>
            ) : null}
          </Box>
        </Paper>

        <Paper
          withBorder={!isMobileStackedLayout}
          radius={isMobileStackedLayout ? 0 : 'md'}
          p={isMobileStackedLayout ? 0 : 'md'}
          className="board-member-management__panel-paper"
          h="100%"
        >
          <Stack gap={isMobileStackedLayout ? 'xs' : 'md'} style={{ flexShrink: 0 }}>
            <Text fw={700} size={isMobileStackedLayout ? 'sm' : 'md'}>
              App Admins ({appAdmins.length})
            </Text>
            <BoardMemberEnterToSearchField
              ariaLabel="Search App Admins"
              placeholder="Search admins..."
              onCommit={setMemberFilterQuery}
            />
          </Stack>
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              marginTop: isMobileStackedLayout ? undefined : 'var(--mantine-spacing-md)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {filteredAdmins.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {memberFilterQuery.trim() !== ''
                  ? 'No App Admins match your search.'
                  : 'No App Admins found.'}
              </Text>
            ) : (
              <Box
                className="board-member-management__table-scroll"
                style={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  maxHeight: '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TableVirtuoso
                  className="board-member-management__virtuoso-root"
                  style={{ height: '100%', minHeight: 0, width: '100%', flex: 1 }}
                  data={filteredAdmins}
                  components={adminsTableComponents}
                  computeItemKey={(_index, u) => u._id}
                  fixedItemHeight={tableRowPx}
                  increaseViewportBy={MEMBER_VIRTUOSO_VIEWPORT_PAD}
                  overscan={MEMBER_VIRTUOSO_OVERSCAN}
                  itemContent={(_index, user) => {
                    const blockSelfBootstrap = cannotRemoveOwnBootstrapAccess(
                      user._id,
                      currentUserId,
                      bootstrapAppAdminId,
                    );
                    const canRemove = appAdmins.length > 1 && !blockSelfBootstrap;
                    return (
                      <AppAdminUserTableCells
                        user={user}
                        compactLayout={isMobileStackedLayout}
                        canRemove={canRemove}
                        blockSelfBootstrap={blockSelfBootstrap}
                        onRemove={(row) => {
                          void handleRemove(row);
                        }}
                      />
                    );
                  }}
                />
              </Box>
            )}
          </Box>
        </Paper>
      </div>
    </Box>
  );
}
