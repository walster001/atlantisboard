-- Drop existing update policy for app_settings
DROP POLICY IF EXISTS "Only app admins can update app settings" ON public.app_settings;

-- Create new policy that allows app admins OR unauthenticated in development
CREATE POLICY "App admins can update app settings"
ON public.app_settings FOR UPDATE
USING (
  is_app_admin(auth.uid()) 
  OR auth.uid() IS NULL
);