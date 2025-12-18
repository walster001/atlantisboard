-- Add text color columns for app name and tagline
ALTER TABLE public.app_settings 
ADD COLUMN custom_app_name_color text NOT NULL DEFAULT '#000000',
ADD COLUMN custom_tagline_color text NOT NULL DEFAULT '#6b7280';