import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { hasBoardExportFormatPermission } from '../../../shared/export/boardExportPermissions.js';
import { useBoardPermissions } from '../../hooks/useBoardPermissions.js';
import { useResponsiveTier } from '../../hooks/useResponsiveTier.js';
import {
  KB_IOS_MODAL_HEADER_SAFE_CLASS,
  modalStylesFullscreenSafeBody,
} from '../../constants/iosModalSafeArea.js';
import { BoardColourPickerPanel } from '../board/BoardColourPickerPanel.js';
import { useImportWizard } from './useImportWizard.js';
import { ImportTab } from './ImportTab.js';
import { ExportTab } from './ExportTab.js';

interface ImportExportModalProps {
  boardId?: string;
  workspaceId?: string;
  onClose: () => void;
  onImportComplete?: () => void | Promise<void>;
}

type TabType = 'import' | 'replace-buttons' | 'user-management' | 'export';

export function ImportExportModal({
  boardId,
  workspaceId,
  onClose,
  onImportComplete,
}: ImportExportModalProps) {
  const [modalTab, setModalTab] = useState<TabType>('import');
  const wizard = useImportWizard({ boardId, workspaceId, onClose, onImportComplete });

  const responsiveTier = useResponsiveTier();
  const isMobile = responsiveTier === 'mobile';
  const { permissions: boardPermissions, loaded: boardPermissionsLoaded } = useBoardPermissions(boardId);
  const canExportAtlantisboardJson = hasBoardExportFormatPermission(boardPermissions, 'atlantisboard');
  const canExportCsv = hasBoardExportFormatPermission(boardPermissions, 'csv');
  const showExportTab = boardId != null && boardPermissionsLoaded && (canExportAtlantisboardJson || canExportCsv);

  useEffect(() => {
    if (modalTab === 'export' && !showExportTab) {
      setModalTab('import');
    }
  }, [modalTab, showExportTab]);

  const modalTitle =
    modalTab === 'export' ? (
      <Text fw={700} size="lg">
        Export
      </Text>
    ) : (
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={44} variant="light" color="gray" radius="md">
          <IconUpload size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={4}>
          <Text fw={700} size="lg">
            Import Boards
          </Text>
          <Text size="sm" c="dimmed" maw={360}>
            Import boards from external kanban applications.
          </Text>
        </Stack>
      </Group>
    );

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={modalTitle}
      size="lg"
      radius="md"
      padding="lg"
      fullScreen={isMobile}
      centered={!isMobile}
      {...(isMobile ? { closeButtonProps: { size: 'lg' as const } } : {})}
      classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
      styles={{
        ...modalStylesFullscreenSafeBody(isMobile),
        ...(isMobile
          ? {
              content: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
              body: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' },
            }
          : {}),
      }}
      overlayProps={{ backgroundOpacity: 0.45 }}
    >
      <Tabs
        value={modalTab}
        onChange={(value) => {
          const next = (value || 'import') as TabType;
          setModalTab(next);
          if (next === 'import' || next === 'replace-buttons' || next === 'user-management') {
            wizard.setActiveTab(next);
          }
        }}
        keepMounted={false}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          ...(isMobile ? {} : { maxHeight: '76vh' }),
        }}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="import">Import</Tabs.Tab>
          {wizard.needsReplaceButtons ? <Tabs.Tab value="replace-buttons">Replace Buttons</Tabs.Tab> : null}
          {wizard.showUserManagementTab && wizard.file != null ? (
            <Tabs.Tab value="user-management">User Management</Tabs.Tab>
          ) : null}
          {showExportTab ? <Tabs.Tab value="export">Export</Tabs.Tab> : null}
        </Tabs.List>

        {wizard.error && modalTab !== 'export' ? (
          <Alert color="red" mb="md" radius="md">
            {wizard.error}
          </Alert>
        ) : null}

        <Tabs.Panel
          value="import"
          style={{ display: modalTab === 'import' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}
        >
          <ImportTab wizard={wizard} onClose={onClose} />
        </Tabs.Panel>

        {wizard.needsReplaceButtons ? (
          <Tabs.Panel
            value="replace-buttons"
            style={{ display: modalTab === 'replace-buttons' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}
          >
            <ImportTab wizard={{ ...wizard, activeTab: 'replace-buttons' }} onClose={onClose} />
          </Tabs.Panel>
        ) : null}

        {wizard.showUserManagementTab && wizard.file != null ? (
          <Tabs.Panel
            value="user-management"
            style={{ display: modalTab === 'user-management' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}
          >
            <ImportTab wizard={{ ...wizard, activeTab: 'user-management' }} onClose={onClose} />
          </Tabs.Panel>
        ) : null}

        {showExportTab && boardId != null ? (
          <Tabs.Panel
            value="export"
            style={{ display: modalTab === 'export' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}
          >
            <ExportTab boardId={boardId} onClose={onClose} />
          </Tabs.Panel>
        ) : null}
      </Tabs>

      <Modal
        opened={wizard.defaultCardColourModalOpen}
        onClose={() => wizard.setDefaultCardColourModalOpen(false)}
        title="Default colour for uncoloured cards"
        centered={!isMobile}
        size="lg"
        fullScreen={isMobile}
        classNames={{ header: KB_IOS_MODAL_HEADER_SAFE_CLASS }}
        styles={modalStylesFullscreenSafeBody(isMobile)}
        radius="md"
        zIndex={520}
        overlayProps={{ backgroundOpacity: 0.45 }}
        padding="lg"
      >
        <Stack gap="md">
          <BoardColourPickerPanel
            value={wizard.pickerDraftHex}
            onChange={(hex) => {
              wizard.setPickerDraftHex(hex);
              wizard.setPickerDraftUseTheme(false);
            }}
            onClearColor={() => wizard.setPickerDraftUseTheme(true)}
            noColorSelected={wizard.pickerDraftUseTheme}
          />
          <Group justify="flex-end" gap="sm" mt="md">
            <Button variant="default" radius="md" onClick={() => wizard.setDefaultCardColourModalOpen(false)}>
              Cancel
            </Button>
            <Button
              radius="md"
              onClick={() => {
                wizard.setImportDefaultHex(wizard.pickerDraftHex);
                wizard.setImportDefaultUseTheme(wizard.pickerDraftUseTheme);
                wizard.setDefaultCardColourModalOpen(false);
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}
