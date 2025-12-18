-- Drop the existing INSERT policy on boards
DROP POLICY IF EXISTS "Workspace members can create boards" ON public.boards;

-- Create new INSERT policy that only allows admins
CREATE POLICY "Only app admins can create boards" 
ON public.boards 
FOR INSERT 
WITH CHECK (is_app_admin(auth.uid()));