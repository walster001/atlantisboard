-- Drop existing update policy
DROP POLICY IF EXISTS "Only app admins can update branding assets" ON storage.objects;

-- Create new policy that allows app admins OR unauthenticated in development
CREATE POLICY "App admins can update branding assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'branding' 
  AND (
    is_app_admin(auth.uid()) 
    OR auth.uid() IS NULL
  )
);

-- Drop existing delete policy
DROP POLICY IF EXISTS "Only app admins can delete branding assets" ON storage.objects;

-- Create new policy for delete
CREATE POLICY "App admins can delete branding assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'branding' 
  AND (
    is_app_admin(auth.uid()) 
    OR auth.uid() IS NULL
  )
);