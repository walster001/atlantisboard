import { memo } from 'react';
import { Alert, Box, Button, Group, Loader, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { AppBrandingPreviewPane } from './AppBrandingPreviewPane.js';
import {
  BoardNavIconCard,
  HomeBackgroundCard,
  HomeNavBarColorCard,
  HomeNavIconCard,
  HomeNavLabelCard,
  HomeNavTextColorCard,
} from './AppBrandingSection/cards.js';
import { useAppBrandingSectionController } from './AppBrandingSection/useAppBrandingSectionController.js';

function AppBrandingSectionInner() {
  const {
    boardNavIconRef,
    clearAsset,
    clearError,
    closeResetModal,
    draft,
    error,
    handleConfirmReset,
    handleSave,
    handlers,
    homeBgRef,
    homeNavIconRef,
    loginPreview,
    onPick,
    onUploadAndClearInput,
    openResetModal,
    pageLoading,
    previewApp,
    resetModalOpened,
    resetting,
    saving,
    success,
  } = useAppBrandingSectionController();

  if (pageLoading) {
    return (
      <Box py="xl" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack gap="lg">
      <Modal
        opened={resetModalOpened}
        onClose={resetting ? () => undefined : closeResetModal}
        title="Reset app branding to defaults?"
        centered
        closeOnClickOutside={!resetting}
        closeOnEscape={!resetting}
        closeButtonProps={{ disabled: resetting }}
      >
        <Stack gap="md">
          <Text size="sm">
            This clears homepage navbar, background, and board icon settings, saves factory defaults,
            and deletes uploaded app branding files from storage when they are hosted on this app.
          </Text>
          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" onClick={closeResetModal} disabled={resetting}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleConfirmReset()} loading={resetting}>
              Yes, reset everything
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={3}>Boards homepage</Title>
          <Text size="sm" c="dimmed" maw={520} mt="xs">
            Customise the boards home page chrome and the board header home icon.
          </Text>
        </Box>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button variant="default" color="gray" onClick={openResetModal} disabled={saving || resetting}>
            Reset defaults
          </Button>
          <Button color="blue" onClick={() => void handleSave()} loading={saving} disabled={resetting}>
            Save changes
          </Button>
        </Group>
      </Group>

      {error && <Alert color="red" withCloseButton onClose={clearError}>{error}</Alert>}
      {success && <Alert color="green">{success}</Alert>}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'flex-start' }}>
        <Stack gap="md">
          <HomeNavIconCard
            iconUrl={draft.homepageNavbarIconUrl}
            iconSizePx={draft.homepageNavbarIconSizePx}
            useLoginFavicon={draft.homepageNavbarUseLoginFavicon}
            handlers={handlers}
            inputRef={homeNavIconRef}
            onFileChange={(f) => void onUploadAndClearInput(f, 'home-nav-icon')}
            onPickClick={() => onPick(homeNavIconRef)}
            onClear={() => void clearAsset('home-nav-icon')}
          />
          <HomeNavLabelCard
            inherit={draft.homepageNavbarLabelInheritAppName}
            label={draft.homepageNavbarLabel ?? ''}
            handlers={handlers}
            disabledInput={draft.homepageNavbarLabelInheritAppName}
          />
          <HomeNavTextColorCard color={draft.homepageNavbarTextColor} handlers={handlers} />
          <HomeNavBarColorCard color={draft.homepageNavbarColor} handlers={handlers} />
          <HomeBackgroundCard
            mode={draft.homepageBackgroundMode}
            backgroundColor={draft.homepageBackgroundColor}
            imageUrl={draft.homepageBackgroundImageUrl}
            inputRef={homeBgRef}
            onFileChange={(f) => void onUploadAndClearInput(f, 'home-bg-image')}
            onPickClick={() => onPick(homeBgRef)}
            onClearImage={() => void clearAsset('home-bg-image')}
            handlers={handlers}
          />
          <BoardNavIconCard
            sameAsHome={draft.boardNavbarIconSameAsHomepage}
            iconUrl={draft.boardNavbarIconUrl}
            iconSizePx={draft.boardNavbarIconSizePx}
            inputRef={boardNavIconRef}
            onFileChange={(f) => void onUploadAndClearInput(f, 'board-nav-icon')}
            onPickClick={() => onPick(boardNavIconRef)}
            onClear={() => void clearAsset('board-nav-icon')}
            handlers={handlers}
          />
        </Stack>

        <Box
          style={{
            position: 'sticky',
            top: 'var(--mantine-spacing-md)',
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - var(--mantine-spacing-xl))',
            overflowY: 'auto',
            minWidth: 0,
          }}
        >
          <AppBrandingPreviewPane app={previewApp} login={loginPreview} />
        </Box>
      </SimpleGrid>
    </Stack>
  );
}

export const AppBrandingSection = memo(AppBrandingSectionInner);
