import { Alert, Box, Button, Flex, Group, Loader, NavLink, Stack } from '@mantine/core';
import { IconPalette, IconPhoto } from '@tabler/icons-react';
import type { BoardThemeSettings } from '../../../shared/boardTheme.js';
import { useBoardThemeBackgroundTab, type ThemeNav } from '../../hooks/board/useBoardThemeBackgroundTab.js';
import { BoardThemeBackgroundPanel } from './BoardThemeBackgroundPanel.js';
import { BoardThemeColouringPanel } from './BoardThemeColouringPanel.js';
import { BoardThemeEditorModal } from './BoardThemeEditorModal.js';
import './boardThemeBackgroundTab.css';

interface BoardThemeBackgroundTabProps {
  boardId: string;
  canChangeTheme: boolean;
  canManageCustomThemes: boolean;
  onThemeLivePatch?: (patch: { themeSettings: BoardThemeSettings; background?: string }) => void;
  initialNav?: ThemeNav;
  mobileLayout?: boolean;
}

export function BoardThemeBackgroundTab({
  boardId,
  canChangeTheme,
  canManageCustomThemes,
  onThemeLivePatch,
  initialNav,
  mobileLayout = false,
}: BoardThemeBackgroundTabProps) {
  const {
    loading,
    saving,
    uploadingImage,
    error,
    draft,
    setDraft,
    nav,
    setNav,
    savedSettings,
    systemThemes,
    themeEditorOpen,
    themeEditorVariant,
    themeEditorInitial,
    themeEditorSaving,
    themeEditorError,
    hasUnsavedChanges,
    themeCards,
    previewBackground,
    previewIsImage,
    hasBackgroundImage,
    handleSelectTheme,
    openThemeEditorAdd,
    openThemeEditorEdit,
    handleThemeEditorSave,
    handleThemeEditorClose,
    handleDuplicateCustomTheme,
    handleDeleteCustomTheme,
    handleBackgroundModeChange,
    handleBackgroundImageFile,
    handleDeleteBackgroundImage,
    handleSave,
  } = useBoardThemeBackgroundTab({
    boardId,
    canChangeTheme,
    canManageCustomThemes,
    ...(onThemeLivePatch !== undefined ? { onThemeLivePatch } : {}),
    ...(initialNav !== undefined ? { initialNav } : {}),
  });

  if (loading) {
    return (
      <Box py="xl" ta="center">
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box className={mobileLayout ? 'board-theme-tab board-theme-tab--mobile-embedded' : 'board-theme-tab'}>
      <Flex
        align="stretch"
        wrap="nowrap"
        gap="md"
        direction={mobileLayout ? 'column' : 'row'}
        className="board-theme-tab__layout"
      >
        {!mobileLayout ? (
          <Stack gap={4} className="board-theme-tab__sidenav board-theme-tab__sidenav--sticky">
            <NavLink
              label="Theme / Colouring"
              leftSection={<IconPalette size={18} stroke={1.5} />}
              active={nav === 'theme'}
              onClick={() => setNav('theme')}
              variant="subtle"
            />
            <NavLink
              label="Background"
              leftSection={<IconPhoto size={18} stroke={1.5} />}
              active={nav === 'background'}
              onClick={() => setNav('background')}
              variant="subtle"
            />
          </Stack>
        ) : null}

        <Box
          className={
            mobileLayout
              ? 'board-theme-tab__main board-theme-tab__main--scrollable board-theme-tab__main--mobile-full'
              : 'board-theme-tab__main board-theme-tab__main--scrollable'
          }
        >
          {error != null ? <Alert color="red">{error}</Alert> : null}

          {nav === 'theme' ? (
            <BoardThemeColouringPanel
              canChangeTheme={canChangeTheme}
              canManageCustomThemes={canManageCustomThemes}
              draft={draft}
              systemThemes={systemThemes}
              themeCards={themeCards}
              saving={saving}
              hasUnsavedChanges={hasUnsavedChanges}
              onSelectTheme={handleSelectTheme}
              onAddTheme={openThemeEditorAdd}
              onEditTheme={openThemeEditorEdit}
              onDuplicateTheme={handleDuplicateCustomTheme}
              onDeleteTheme={handleDeleteCustomTheme}
              onSaveChanges={() => void handleSave()}
              mobileLayout={mobileLayout}
            />
          ) : (
            <BoardThemeBackgroundPanel
              canChangeTheme={canChangeTheme}
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              uploadingImage={uploadingImage}
              previewBackground={previewBackground}
              previewIsImage={previewIsImage}
              hasBackgroundImage={hasBackgroundImage}
              onBackgroundModeChange={handleBackgroundModeChange}
              onBackgroundImageFile={handleBackgroundImageFile}
              onDeleteBackgroundImage={handleDeleteBackgroundImage}
            />
          )}

          {nav === 'background' ? (
            <Group justify="flex-end" mt="md">
              <Button
                variant="default"
                disabled={!canChangeTheme || !hasUnsavedChanges || saving || themeEditorSaving}
                onClick={() => setDraft(savedSettings)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!canChangeTheme || !hasUnsavedChanges || themeEditorSaving}
              >
                Save Changes
              </Button>
            </Group>
          ) : null}
        </Box>
      </Flex>

      <BoardThemeEditorModal
        opened={themeEditorOpen}
        variant={themeEditorVariant}
        initialSettings={themeEditorInitial}
        isSaving={themeEditorSaving}
        error={themeEditorError}
        onClose={handleThemeEditorClose}
        onSave={handleThemeEditorSave}
      />
    </Box>
  );
}
