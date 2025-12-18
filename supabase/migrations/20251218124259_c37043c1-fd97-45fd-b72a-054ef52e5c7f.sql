-- Add text size settings
ALTER TABLE public.app_settings 
ADD COLUMN custom_app_name_size INTEGER NOT NULL DEFAULT 24,
ADD COLUMN custom_tagline_size INTEGER NOT NULL DEFAULT 14;