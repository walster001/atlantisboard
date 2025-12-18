-- Create app_settings table to store application-wide settings
CREATE TABLE public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  custom_login_logo_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_login_logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read app settings (needed for login page)
CREATE POLICY "App settings are publicly readable"
ON public.app_settings FOR SELECT
USING (true);

-- Only app admins can update settings
CREATE POLICY "Only app admins can update app settings"
ON public.app_settings FOR UPDATE
USING (is_app_admin(auth.uid()));

-- Only app admins can insert settings
CREATE POLICY "Only app admins can insert app settings"
ON public.app_settings FOR INSERT
WITH CHECK (is_app_admin(auth.uid()));

-- Insert default settings row
INSERT INTO public.app_settings (id) VALUES ('default');

-- Create storage bucket for branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Allow public read access to branding bucket
CREATE POLICY "Branding assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Only app admins can upload to branding bucket
CREATE POLICY "Only app admins can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding' AND is_app_admin(auth.uid()));

-- Only app admins can update branding assets
CREATE POLICY "Only app admins can update branding assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding' AND is_app_admin(auth.uid()));

-- Only app admins can delete branding assets
CREATE POLICY "Only app admins can delete branding assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding' AND is_app_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();