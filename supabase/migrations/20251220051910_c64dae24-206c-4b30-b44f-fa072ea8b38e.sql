-- Create board_themes table for global themes (available to all users)
CREATE TABLE public.board_themes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    navbar_color TEXT NOT NULL DEFAULT '#0079bf',
    column_color TEXT NOT NULL DEFAULT '#ffffff',
    default_card_color TEXT,
    card_window_color TEXT NOT NULL DEFAULT '#ffffff',
    card_window_text_color TEXT NOT NULL DEFAULT '#000000',
    homepage_board_color TEXT NOT NULL DEFAULT '#0079bf',
    board_icon_color TEXT NOT NULL DEFAULT '#ffffff',
    scrollbar_color TEXT NOT NULL DEFAULT '#888888',
    scrollbar_track_color TEXT NOT NULL DEFAULT '#f1f1f1',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.board_themes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view themes (global themes)
CREATE POLICY "Authenticated users can view themes"
ON public.board_themes
FOR SELECT
TO authenticated
USING (true);

-- Only app admins can create themes
CREATE POLICY "App admins can create themes"
ON public.board_themes
FOR INSERT
TO authenticated
WITH CHECK (is_app_admin(auth.uid()));

-- Only app admins can update themes
CREATE POLICY "App admins can update themes"
ON public.board_themes
FOR UPDATE
TO authenticated
USING (is_app_admin(auth.uid()));

-- Only app admins can delete themes (except default themes)
CREATE POLICY "App admins can delete themes"
ON public.board_themes
FOR DELETE
TO authenticated
USING (is_app_admin(auth.uid()) AND is_default = false);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_board_themes_updated_at
BEFORE UPDATE ON public.board_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default themes based on existing board creation colors
INSERT INTO public.board_themes (name, is_default, navbar_color, column_color, default_card_color, card_window_color, card_window_text_color, homepage_board_color, board_icon_color, scrollbar_color, scrollbar_track_color)
VALUES 
    ('Ocean Blue', true, '#0079bf', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#0079bf', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Sunset Orange', true, '#d29034', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#d29034', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Forest Green', true, '#519839', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#519839', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Ruby Red', true, '#b04632', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#b04632', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Royal Purple', true, '#89609e', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#89609e', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Hot Pink', true, '#cd5a91', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#cd5a91', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Mint Green', true, '#4bbf6b', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#4bbf6b', '#ffffff', '#c1c7cd', '#f4f5f7'),
    ('Teal', true, '#00aecc', '#f4f5f7', NULL, '#ffffff', '#172b4d', '#00aecc', '#ffffff', '#c1c7cd', '#f4f5f7');

-- Add theme_id column to boards table for applying themes
ALTER TABLE public.boards ADD COLUMN theme_id UUID REFERENCES public.board_themes(id) ON DELETE SET NULL;