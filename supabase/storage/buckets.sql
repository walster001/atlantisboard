-- =====================================================
-- AtlantisBoard Storage Buckets Configuration
-- Run this after initial schema migration
-- =====================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('branding', 'branding', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']),
    ('fonts', 'fonts', true, 10485760, ARRAY['font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff', 'application/font-woff2']),
    ('card-attachments', 'card-attachments', false, 52428800, NULL)  -- 50MB limit, any file type
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage Policies: branding bucket (public)
-- =====================================================

-- Anyone can view branding assets
CREATE POLICY "Branding assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Only app admins can upload branding assets
CREATE POLICY "App admins can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'branding' 
    AND public.is_app_admin(auth.uid())
);

-- Only app admins can update branding assets
CREATE POLICY "App admins can update branding assets"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'branding' 
    AND public.is_app_admin(auth.uid())
);

-- Only app admins can delete branding assets
CREATE POLICY "App admins can delete branding assets"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'branding' 
    AND public.is_app_admin(auth.uid())
);

-- =====================================================
-- Storage Policies: fonts bucket (public)
-- =====================================================

-- Anyone can view fonts
CREATE POLICY "Fonts are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'fonts');

-- Only app admins can upload fonts
CREATE POLICY "App admins can upload fonts"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'fonts' 
    AND public.is_app_admin(auth.uid())
);

-- Only app admins can update fonts
CREATE POLICY "App admins can update fonts"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'fonts' 
    AND public.is_app_admin(auth.uid())
);

-- Only app admins can delete fonts
CREATE POLICY "App admins can delete fonts"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'fonts' 
    AND public.is_app_admin(auth.uid())
);

-- =====================================================
-- Storage Policies: card-attachments bucket (private)
-- =====================================================

-- Board members can view attachments for their boards
-- Note: This policy checks if the user is a member of the board
-- The path format is: board_id/card_id/filename
CREATE POLICY "Board members can view card attachments"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'card-attachments'
    AND (
        public.is_board_member(auth.uid(), (storage.foldername(name))[1]::uuid)
        OR public.is_app_admin(auth.uid())
    )
);

-- Board admins can upload attachments
CREATE POLICY "Board admins can upload card attachments"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'card-attachments'
    AND (
        public.can_edit_board(auth.uid(), (storage.foldername(name))[1]::uuid)
        OR public.is_app_admin(auth.uid())
    )
);

-- Board admins can update attachments
CREATE POLICY "Board admins can update card attachments"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'card-attachments'
    AND (
        public.can_edit_board(auth.uid(), (storage.foldername(name))[1]::uuid)
        OR public.is_app_admin(auth.uid())
    )
);

-- Board admins can delete attachments
CREATE POLICY "Board admins can delete card attachments"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'card-attachments'
    AND (
        public.can_edit_board(auth.uid(), (storage.foldername(name))[1]::uuid)
        OR public.is_app_admin(auth.uid())
    )
);
