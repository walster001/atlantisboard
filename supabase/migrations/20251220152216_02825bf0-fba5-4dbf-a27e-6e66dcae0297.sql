-- Fix app_settings UPDATE policy - remove unauthenticated access
DROP POLICY IF EXISTS "App admins can update app settings" ON public.app_settings;
CREATE POLICY "App admins can update app settings"
ON public.app_settings FOR UPDATE
USING (is_app_admin(auth.uid()));

-- Fix storage branding INSERT policy - remove unauthenticated access
DROP POLICY IF EXISTS "App admins can upload branding assets" ON storage.objects;
CREATE POLICY "App admins can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding' AND is_app_admin(auth.uid()));

-- Fix storage branding UPDATE policy - remove unauthenticated access
DROP POLICY IF EXISTS "App admins can update branding assets" ON storage.objects;
CREATE POLICY "App admins can update branding assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding' AND is_app_admin(auth.uid()));

-- Fix storage branding DELETE policy - remove unauthenticated access
DROP POLICY IF EXISTS "App admins can delete branding assets" ON storage.objects;
CREATE POLICY "App admins can delete branding assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding' AND is_app_admin(auth.uid()));