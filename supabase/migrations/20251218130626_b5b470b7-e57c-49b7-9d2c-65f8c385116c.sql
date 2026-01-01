-- Create storage bucket for custom fonts (only if it doesn't exist)
INSERT INTO storage.buckets (id, name, public) VALUES ('fonts', 'fonts', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow public read access
CREATE POLICY "Public font access" ON storage.objects FOR SELECT USING (bucket_id = 'fonts');

-- Create policy for authenticated users to upload fonts (app admins only via RLS)
CREATE POLICY "Admins can upload fonts" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'fonts' AND is_app_admin(auth.uid()));

-- Create policy for admins to delete fonts
CREATE POLICY "Admins can delete fonts" ON storage.objects FOR DELETE 
USING (bucket_id = 'fonts' AND is_app_admin(auth.uid()));

-- Create table to track custom fonts (stores metadata, not the files)
CREATE TABLE public.custom_fonts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  font_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_fonts ENABLE ROW LEVEL SECURITY;

-- Everyone can view fonts
CREATE POLICY "Anyone can view custom fonts" ON public.custom_fonts FOR SELECT USING (true);

-- Only admins can manage fonts
CREATE POLICY "Admins can insert fonts" ON public.custom_fonts FOR INSERT WITH CHECK (is_app_admin(auth.uid()));
CREATE POLICY "Admins can delete fonts" ON public.custom_fonts FOR DELETE USING (is_app_admin(auth.uid()));

-- Add font columns to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN custom_app_name_font text DEFAULT 'default',
ADD COLUMN custom_tagline_font text DEFAULT 'default';