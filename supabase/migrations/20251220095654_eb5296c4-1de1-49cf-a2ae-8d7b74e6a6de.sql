
-- Fix cards.created_by foreign key to SET NULL on delete
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_created_by_fkey;
ALTER TABLE public.cards ADD CONSTRAINT cards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Fix import_pending_assignees.resolved_by foreign key to SET NULL on delete
ALTER TABLE public.import_pending_assignees DROP CONSTRAINT IF EXISTS import_pending_assignees_resolved_by_fkey;
ALTER TABLE public.import_pending_assignees ADD CONSTRAINT import_pending_assignees_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Fix import_pending_attachments.resolved_by - change from auth.users to profiles with SET NULL
ALTER TABLE public.import_pending_attachments DROP CONSTRAINT IF EXISTS import_pending_attachments_resolved_by_fkey;
ALTER TABLE public.import_pending_attachments ADD CONSTRAINT import_pending_attachments_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
