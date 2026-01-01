-- Add custom tagline settings
ALTER TABLE public.app_settings 
ADD COLUMN custom_tagline_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN custom_tagline TEXT;