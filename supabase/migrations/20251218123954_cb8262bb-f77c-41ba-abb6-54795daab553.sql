-- Add logo size setting
ALTER TABLE public.app_settings 
ADD COLUMN custom_login_logo_size TEXT NOT NULL DEFAULT 'medium';