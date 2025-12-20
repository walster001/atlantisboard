-- Drop and recreate foreign keys with ON DELETE CASCADE for workspace and board cascading deletion

-- boards -> workspaces
ALTER TABLE public.boards DROP CONSTRAINT IF EXISTS boards_workspace_id_fkey;
ALTER TABLE public.boards ADD CONSTRAINT boards_workspace_id_fkey 
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- columns -> boards
ALTER TABLE public.columns DROP CONSTRAINT IF EXISTS columns_board_id_fkey;
ALTER TABLE public.columns ADD CONSTRAINT columns_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

-- cards -> columns
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_column_id_fkey;
ALTER TABLE public.cards ADD CONSTRAINT cards_column_id_fkey 
  FOREIGN KEY (column_id) REFERENCES public.columns(id) ON DELETE CASCADE;

-- board_members -> boards
ALTER TABLE public.board_members DROP CONSTRAINT IF EXISTS board_members_board_id_fkey;
ALTER TABLE public.board_members ADD CONSTRAINT board_members_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

-- board_member_audit_log -> boards
ALTER TABLE public.board_member_audit_log DROP CONSTRAINT IF EXISTS board_member_audit_log_board_id_fkey;
ALTER TABLE public.board_member_audit_log ADD CONSTRAINT board_member_audit_log_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

-- labels -> boards
ALTER TABLE public.labels DROP CONSTRAINT IF EXISTS labels_board_id_fkey;
ALTER TABLE public.labels ADD CONSTRAINT labels_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

-- card_labels -> cards
ALTER TABLE public.card_labels DROP CONSTRAINT IF EXISTS card_labels_card_id_fkey;
ALTER TABLE public.card_labels ADD CONSTRAINT card_labels_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- card_labels -> labels
ALTER TABLE public.card_labels DROP CONSTRAINT IF EXISTS card_labels_label_id_fkey;
ALTER TABLE public.card_labels ADD CONSTRAINT card_labels_label_id_fkey 
  FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;

-- card_subtasks -> cards
ALTER TABLE public.card_subtasks DROP CONSTRAINT IF EXISTS card_subtasks_card_id_fkey;
ALTER TABLE public.card_subtasks ADD CONSTRAINT card_subtasks_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- card_attachments -> cards
ALTER TABLE public.card_attachments DROP CONSTRAINT IF EXISTS card_attachments_card_id_fkey;
ALTER TABLE public.card_attachments ADD CONSTRAINT card_attachments_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- card_assignees -> cards
ALTER TABLE public.card_assignees DROP CONSTRAINT IF EXISTS card_assignees_card_id_fkey;
ALTER TABLE public.card_assignees ADD CONSTRAINT card_assignees_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- import_pending_assignees -> boards and cards
ALTER TABLE public.import_pending_assignees DROP CONSTRAINT IF EXISTS import_pending_assignees_board_id_fkey;
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE public.import_pending_assignees DROP CONSTRAINT IF EXISTS import_pending_assignees_card_id_fkey;
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- import_pending_attachments -> boards and cards
ALTER TABLE public.import_pending_attachments DROP CONSTRAINT IF EXISTS import_pending_attachments_board_id_fkey;
ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;

ALTER TABLE public.import_pending_attachments DROP CONSTRAINT IF EXISTS import_pending_attachments_card_id_fkey;
ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

-- workspace_members -> workspaces
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey 
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;