import { CreateWorkspaceModal } from '../../components/workspace/CreateWorkspaceModal.js';
import { CreateBoardModal } from '../../components/workspace/CreateBoardModal.js';
import { WorkspaceSettingsModal } from '../../components/workspace/WorkspaceSettingsModal.js';
import {
  EditWorkspaceDescriptionModal,
  RenameWorkspaceModal,
} from '../../components/workspace/WorkspaceHomeQuickEditModals.js';
import { ImportExportModal } from '../../components/import-export/ImportExportModal.js';
import type { HomePageController } from './useHomePageController.js';

interface HomePageDragPreviewProps {
  readonly controller: HomePageController;
}

export function HomePageDragPreview({ controller }: HomePageDragPreviewProps) {
  return (
    <div
      ref={controller.floatHostRef}
      data-home-drag-preview="1"
      className="home-page__drag-float-host"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 5000,
        pointerEvents: 'none',
        visibility: controller.floatPreview != null ? 'visible' : 'hidden',
        transform: 'translate3d(0,0,0)',
      }}
      aria-hidden
    >
      {controller.floatPreview?.kind === 'board' ? (
        <div className="home-page__drag-float-card">
          <span className="home-page__drag-float-card-title">{controller.floatPreview.name}</span>
        </div>
      ) : null}
      {controller.floatPreview?.kind === 'workspace' ? (
        <div className="home-page__drag-float-workspace">
          <span className="home-page__drag-float-workspace-title">{controller.floatPreview.name}</span>
        </div>
      ) : null}
    </div>
  );
}

interface HomePageModalsProps {
  readonly controller: HomePageController;
}

export function HomePageModals({ controller }: HomePageModalsProps) {
  return (
    <>
      {controller.showCreateWorkspace && controller.canCreateWorkspace ? (
        <CreateWorkspaceModal onClose={controller.closeCreateWorkspace} onSuccess={controller.refreshData} />
      ) : null}
      {controller.showCreateBoard && controller.selectedWorkspaceIdForBoard != null ? (
        <CreateBoardModal
          workspaceId={controller.selectedWorkspaceIdForBoard}
          onClose={controller.closeCreateBoard}
          onSuccess={controller.refreshData}
        />
      ) : null}
      {controller.showImportModal && controller.canUseImport ? (
        <ImportExportModal onClose={controller.closeImportModal} onImportComplete={controller.refreshData} />
      ) : null}
      {controller.workspaceSettingsId !== null ? (
        <WorkspaceSettingsModal
          workspaceId={controller.workspaceSettingsId}
          onClose={controller.closeWorkspaceSettings}
        />
      ) : null}
      <RenameWorkspaceModal
        key={controller.renameWorkspaceTarget?.id ?? 'rename-closed'}
        target={
          controller.renameWorkspaceTarget == null
            ? null
            : {
                id: controller.renameWorkspaceTarget.id,
                initialName: controller.renameWorkspaceTarget.initialName ?? '',
              }
        }
        onClose={controller.closeRenameWorkspace}
        onSuccess={controller.refreshData}
      />
      <EditWorkspaceDescriptionModal
        key={controller.editDescriptionTarget?.id ?? 'description-closed'}
        target={
          controller.editDescriptionTarget == null
            ? null
            : {
                id: controller.editDescriptionTarget.id,
                initialDescription: controller.editDescriptionTarget.initialDescription ?? '',
              }
        }
        onClose={controller.closeEditDescription}
        onSuccess={controller.refreshData}
      />
    </>
  );
}
