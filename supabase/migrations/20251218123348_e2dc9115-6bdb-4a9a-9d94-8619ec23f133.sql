-- Drop existing upload policy
DROP POLICY IF EXISTS "Only app admins can upload branding assets" ON storage.objects;

-- Create new policy that allows app admins OR unauthenticated in development
-- Note: In production, you may want to revert to admin-only
CREATE POLICY "App admins can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'branding' 
  AND (
    is_app_admin(auth.uid()) 
    OR auth.uid() IS NULL  -- Allow unauthenticated uploads for testing
  )
);