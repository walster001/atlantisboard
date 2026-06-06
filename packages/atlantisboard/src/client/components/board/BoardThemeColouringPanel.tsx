import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconCopyPlus, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import type { BoardThemeDefinition, BoardThemeSettings } from '../../../shared/boardTheme.js';
import { applySmartContrastToThemePalette } from '../../utils/boardThemeStyle.js';
import {
  isBoardDefaultThemeId,
  themeCardMiniBoardCanvasBackground,
} from './boardThemeTabHelpers.js';

export interface BoardThemeColouringPanelProps {
  canChangeTheme: boolean;
  canManageCustomThemes: boolean;
  draft: BoardThemeSettings;
  systemThemes: readonly BoardThemeDefinition[];
  themeCards: readonly BoardThemeDefinition[];
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSelectTheme: (themeId: string) => void;
  onAddTheme: () => void;
  onEditTheme: (themeId: string) => void;
  onDuplicateTheme: (theme: BoardThemeDefinition) => void;
  onDeleteTheme: (theme: BoardThemeDefinition) => void;
  onSaveChanges: () => void;
  /** Board settings mobile sheet: stack header + full-width save control. */
  mobileLayout?: boolean;
}

export function BoardThemeColouringPanel({
  canChangeTheme,
  canManageCustomThemes,
  draft,
  systemThemes,
  themeCards,
  saving,
  hasUnsavedChanges,
  onSelectTheme,
  onAddTheme,
  onEditTheme,
  onDuplicateTheme,
  onDeleteTheme,
  onSaveChanges,
  mobileLayout = false,
}: BoardThemeColouringPanelProps) {
  const themeActionSize = mobileLayout ? 44 : ('sm' as const);
  const saveButton = (
    <Button
      onClick={onSaveChanges}
      loading={saving}
      disabled={!canChangeTheme || !hasUnsavedChanges || saving}
      fullWidth={mobileLayout}
      size={mobileLayout ? 'sm' : 'md'}
      {...(mobileLayout ? { className: 'board-theme-colouring-panel__save' } : {})}
    >
      Save Changes
    </Button>
  );

  return (
    <Stack gap="md">
      {mobileLayout ? (
        <Stack gap="sm">
          <Box>
            <Text fw={700} size="xl">
              Board Themes
            </Text>
            <Text c="dimmed">Select a theme to apply to this board.</Text>
          </Box>
          {saveButton}
        </Stack>
      ) : (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="xl">
              Board Themes
            </Text>
            <Text c="dimmed">Select a theme to apply to this board.</Text>
          </Box>
          {saveButton}
        </Group>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 2, lg: 3 }} spacing="md">
        {themeCards.map((theme) => {
          const selected = theme.id === draft.selectedThemeId;
          const isDefault = isBoardDefaultThemeId(theme.id, systemThemes);
          const previewPalette = applySmartContrastToThemePalette(theme.palette, draft.smartContrast);
          return (
            <Card
              key={theme.id}
              className={`board-theme-card${selected ? ' board-theme-card--selected' : ''}${
                isDefault ? '' : ' board-theme-card--custom'
              }`}
              withBorder
              onClick={() => {
                if (!canChangeTheme) {
                  return;
                }
                onSelectTheme(theme.id);
              }}
            >
              <Box className="board-theme-card__preview-shell">
                {!canManageCustomThemes || isDefault ? null : (
                  <Box
                    className="board-theme-card__floating-actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Group gap={6} wrap="nowrap">
                      <ActionIcon
                        type="button"
                        variant="default"
                        size={themeActionSize}
                        radius="xl"
                        aria-label="Edit theme"
                        className="board-theme-card__float-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTheme(theme.id);
                        }}
                      >
                        <IconPencil size={mobileLayout ? 20 : 16} stroke={1.5} />
                      </ActionIcon>
                      <ActionIcon
                        type="button"
                        variant="default"
                        size={themeActionSize}
                        radius="xl"
                        color="red"
                        aria-label="Delete theme"
                        className="board-theme-card__float-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteTheme(theme);
                        }}
                      >
                        <IconTrash size={mobileLayout ? 20 : 16} stroke={1.5} />
                      </ActionIcon>
                    </Group>
                    <ActionIcon
                      type="button"
                      variant="default"
                      size={themeActionSize}
                      radius="xl"
                      aria-label="Duplicate theme"
                      className="board-theme-card__float-icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDuplicateTheme(theme);
                      }}
                    >
                      <IconCopyPlus size={mobileLayout ? 20 : 16} stroke={1.5} />
                    </ActionIcon>
                  </Box>
                )}
                <Box
                  className="board-theme-card__preview"
                  style={{
                    backgroundColor: themeCardMiniBoardCanvasBackground(previewPalette.canvasBg),
                  }}
                >
                  <Box
                    className="board-theme-card__preview-nav"
                    style={{ backgroundColor: previewPalette.navbarBg }}
                  >
                    <Box
                      className="board-theme-card__preview-logo"
                      style={{ backgroundColor: previewPalette.navbarBorder }}
                    />
                    <Box
                      className="board-theme-card__preview-title"
                      style={{ backgroundColor: previewPalette.navbarBorder, opacity: 0.92 }}
                    />
                  </Box>
                  <Box className="board-theme-card__preview-body">
                    <Box className="board-theme-card__preview-columns">
                      <Box
                        className="board-theme-card__preview-col"
                        style={{ backgroundColor: previewPalette.listBg }}
                      >
                        <Box
                          className="board-theme-card__preview-mini-card"
                          style={{ backgroundColor: previewPalette.listControlHoverBg }}
                        />
                        <Box
                          className="board-theme-card__preview-mini-card"
                          style={{ backgroundColor: previewPalette.listControlHoverBg }}
                        />
                        <Box
                          className="board-theme-card__preview-mini-card"
                          style={{ backgroundColor: previewPalette.listControlHoverBg }}
                        />
                      </Box>
                      <Box
                        className="board-theme-card__preview-col"
                        style={{ backgroundColor: previewPalette.listBg }}
                      >
                        <Box
                          className="board-theme-card__preview-mini-card"
                          style={{ backgroundColor: previewPalette.listControlHoverBg }}
                        />
                        <Box
                          className="board-theme-card__preview-mini-card"
                          style={{ backgroundColor: previewPalette.listControlHoverBg }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
              <Text fw={600} mt="xs">
                {theme.name}
              </Text>
              <Text size="sm" c="dimmed">
                {isDefault ? 'Default' : 'Custom'}
              </Text>
            </Card>
          );
        })}
        {canManageCustomThemes ? (
          <Card key="__add_theme__" className="board-theme-card board-theme-card--add" withBorder padding={0}>
            <UnstyledButton type="button" className="board-theme-card__add-button" onClick={onAddTheme}>
              <IconPlus size={36} stroke={1.25} />
              <Text fw={600} size="sm">
                Add theme
              </Text>
            </UnstyledButton>
          </Card>
        ) : null}
      </SimpleGrid>
    </Stack>
  );
}
