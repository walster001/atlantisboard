import { useMemo, useState, type FormEvent } from 'react';
import {
  Modal,
  TextInput,
  Textarea,
  Button,
  Alert,
  Stack,
  Group,
  Text,
  Select,
} from '@mantine/core';
import { BOARD_DESCRIPTION_MAX_LENGTH, BOARD_NAME_MAX_LENGTH } from '../../constants/boardFieldLimits.js';
import { api } from '../../utils/api.js';
import {
  BOARD_DEFAULT_THEME_ID,
  createDefaultBoardThemeSettings,
  findBoardThemeById,
  resolveBoardBackgroundFromThemeSettings,
  type BoardThemeDefinition,
} from '../../../shared/boardTheme.js';
import { useBoardThemes } from '../../hooks/useBoardThemes.js';

interface CreateBoardModalProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateBoardModal({ workspaceId, onClose, onSuccess }: CreateBoardModalProps) {
  const { catalog, allThemes, systemThemes } = useBoardThemes();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultThemeId = systemThemes[0]?.id ?? BOARD_DEFAULT_THEME_ID;
  const [selectedThemeId, setSelectedThemeId] = useState(defaultThemeId);

  const availableThemes = useMemo<BoardThemeDefinition[]>(() => {
    const seen = new Set<string>();
    const merged: BoardThemeDefinition[] = [];
    for (const theme of allThemes) {
      if (seen.has(theme.id)) continue;
      seen.add(theme.id);
      merged.push({ id: theme.id, name: theme.name, palette: { ...theme.palette } });
    }
    return merged;
  }, [allThemes]);

  const effectiveSelectedThemeId = availableThemes.some((theme) => theme.id === selectedThemeId)
    ? selectedThemeId
    : defaultThemeId;

  const nameOverLimit = name.length > BOARD_NAME_MAX_LENGTH;
  const descriptionOverLimit = description.length > BOARD_DESCRIPTION_MAX_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    if (nameOverLimit) {
      setError(`Board name cannot exceed ${BOARD_NAME_MAX_LENGTH} characters`);
      return;
    }
    if (descriptionOverLimit) {
      setError(`Description cannot exceed ${BOARD_DESCRIPTION_MAX_LENGTH} characters`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const boardData: {
        workspaceId: string;
        name: string;
        description?: string;
        background?: string;
        themeSettings?: ReturnType<typeof createDefaultBoardThemeSettings>;
      } = {
        workspaceId,
        name: name.trim(),
      };
      if (description.trim()) {
        boardData.description = description.trim();
      }
      const selectedTheme =
        availableThemes.find((theme) => theme.id === effectiveSelectedThemeId) ??
        findBoardThemeById(effectiveSelectedThemeId, catalog) ??
        findBoardThemeById(BOARD_DEFAULT_THEME_ID, catalog) ??
        systemThemes[0];
      if (selectedTheme != null) {
        const themeSettings = createDefaultBoardThemeSettings(selectedTheme.id, catalog);
        themeSettings.selectedTheme = {
          id: selectedTheme.id,
          name: selectedTheme.name,
          palette: { ...selectedTheme.palette },
        };
        themeSettings.selectedThemeId = selectedTheme.id;
        themeSettings.backgroundMode = 'theme';
        themeSettings.backgroundColor = selectedTheme.palette.canvasBg;
        boardData.themeSettings = themeSettings;
        const resolvedBackground = resolveBoardBackgroundFromThemeSettings(themeSettings);
        if (resolvedBackground !== undefined) {
          boardData.background = resolvedBackground;
        }
      }
      await api.createBoard(boardData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={true} onClose={onClose} title="Create New Board" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && (
            <Alert color="red">
              {error}
            </Alert>
          )}

          <TextInput
            label="Board Name"
            placeholder="Enter board name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
            disabled={loading}
            required
            error={nameOverLimit ? `Cannot exceed ${BOARD_NAME_MAX_LENGTH} characters` : undefined}
            description={
              <Text component="span" size="xs" c={nameOverLimit ? 'red' : 'dimmed'}>
                {name.length}/{BOARD_NAME_MAX_LENGTH}
                {nameOverLimit ? ' — over limit' : ''}
              </Text>
            }
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Enter board description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={loading}
            rows={3}
            error={descriptionOverLimit ? `Cannot exceed ${BOARD_DESCRIPTION_MAX_LENGTH} characters` : undefined}
            description={
              <Text component="span" size="xs" c={descriptionOverLimit ? 'red' : 'dimmed'}>
                {description.length}/{BOARD_DESCRIPTION_MAX_LENGTH}
                {descriptionOverLimit ? ' — over limit' : ''}
              </Text>
            }
          />

          <Select
            label="Theme"
            data={availableThemes.map((theme) => ({ value: theme.id, label: theme.name }))}
            value={effectiveSelectedThemeId}
            onChange={(value) => setSelectedThemeId(value ?? selectedThemeId)}
            disabled={loading}
            allowDeselect={false}
          />

          <Group justify="flex-end" mt="md">
            <Button
              type="button"
              variant="subtle"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              loading={loading}
              disabled={nameOverLimit || descriptionOverLimit}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
