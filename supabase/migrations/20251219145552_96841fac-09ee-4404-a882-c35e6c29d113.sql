-- Add app branding settings columns to app_settings table
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS custom_home_logo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_home_logo_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_home_logo_size integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS custom_board_logo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_board_logo_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_board_logo_size integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS custom_global_app_name_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_global_app_name text DEFAULT NULL;