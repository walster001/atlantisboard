-- Add login_style column to app_settings
ALTER TABLE public.app_settings
ADD COLUMN login_style text NOT NULL DEFAULT 'google_only';

-- Add comment for clarity
COMMENT ON COLUMN public.app_settings.login_style IS 'Login style: local_accounts, google_only, or google_verified';