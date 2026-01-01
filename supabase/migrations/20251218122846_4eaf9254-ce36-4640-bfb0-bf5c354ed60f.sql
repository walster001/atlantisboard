-- Add custom app name settings
ALTER TABLE public.app_settings 
ADD COLUMN custom_app_name_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN custom_app_name TEXT;