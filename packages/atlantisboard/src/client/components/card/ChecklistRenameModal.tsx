import { Box, Group, Stack, TextInput, Button, Modal } from '@mantine/core';
import { CHECKLIST_TITLE_MAX_LENGTH } from './checklistSectionConstants.js';
import type { ChecklistSectionController } from './useChecklistSection.js';

interface ChecklistRenameModalProps {
  readonly canEdit: boolean;
  readonly controller: ChecklistSectionController;
}

export function ChecklistRenameModal({ canEdit, controller }: ChecklistRenameModalProps) {
  const {
    checklistRename,
    setChecklistRename,
    checklistRenameOverLimit,
    checklistRenameDisabled,
    checklistRenameSaving,
    commitRenameChecklist,
  } = controller;

  return (
    <Modal
      opened={canEdit && checklistRename !== null}
      onClose={() => setChecklistRename(null)}
      title="Rename checklist"
      centered
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            value={checklistRename?.draft ?? ''}
            onChange={(e) => {
              const nextDraft = e.currentTarget.value;
              setChecklistRename((prev) => (prev ? { ...prev, draft: nextDraft } : prev));
            }}
            maxLength={CHECKLIST_TITLE_MAX_LENGTH}
            error={
              checklistRenameOverLimit
                ? `Maximum ${CHECKLIST_TITLE_MAX_LENGTH} characters`
                : undefined
            }
            autoFocus
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setChecklistRename(null)}>
              Cancel
            </Button>
            <Button
              color="blue"
              onClick={() => void commitRenameChecklist()}
              loading={checklistRenameSaving}
              disabled={checklistRenameDisabled}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  );
}

interface ChecklistNewChecklistFormProps {
  readonly controller: ChecklistSectionController;
}

export function ChecklistNewChecklistForm({ controller }: ChecklistNewChecklistFormProps) {
  const {
    newChecklistTitle,
    setNewChecklistTitle,
    isCreatingChecklist,
    handleCreateChecklist,
    setShowNewChecklist,
  } = controller;

  return (
    <Box
      p="md"
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <TextInput
        placeholder="Checklist title"
        value={newChecklistTitle}
        onChange={(e) => setNewChecklistTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleCreateChecklist();
          }
          if (e.key === 'Escape') {
            setShowNewChecklist(false);
            setNewChecklistTitle('');
          }
        }}
        autoFocus
        disabled={isCreatingChecklist}
        mb="sm"
        maxLength={CHECKLIST_TITLE_MAX_LENGTH}
      />
      <Group gap="xs">
        <Button
          size="sm"
          color="blue"
          onClick={handleCreateChecklist}
          disabled={isCreatingChecklist || !newChecklistTitle.trim()}
        >
          Add
        </Button>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            setShowNewChecklist(false);
            setNewChecklistTitle('');
          }}
          disabled={isCreatingChecklist}
        >
          Cancel
        </Button>
      </Group>
    </Box>
  );
}
