-- Update workspace INSERT policy to restrict creation to app admins only
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;

CREATE POLICY "Only app admins can create workspaces" 
ON public.workspaces 
FOR INSERT 
WITH CHECK (auth.uid() = owner_id AND is_app_admin(auth.uid()));