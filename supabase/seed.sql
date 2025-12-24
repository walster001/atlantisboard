-- =====================================================
-- AtlantisBoard Seed Data
-- Initial data required for application to function
-- =====================================================

-- Insert default app settings
INSERT INTO public.app_settings (id) 
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Insert default board theme
INSERT INTO public.board_themes (
    id,
    name,
    navbar_color,
    column_color,
    board_icon_color,
    homepage_board_color,
    scrollbar_color,
    scrollbar_track_color,
    card_window_color,
    card_window_text_color,
    card_window_button_color,
    card_window_button_text_color,
    card_window_button_hover_color,
    card_window_button_hover_text_color,
    card_window_intelligent_contrast,
    is_default
) VALUES (
    gen_random_uuid(),
    'Default Theme',
    '#0079bf',
    '#ffffff',
    '#ffffff',
    '#0079bf',
    '#888888',
    '#f1f1f1',
    '#ffffff',
    '#000000',
    '#0079bf',
    '#ffffff',
    '#005a8c',
    '#ffffff',
    false,
    true
) ON CONFLICT DO NOTHING;

-- Note: The first user to sign up will automatically become an admin
-- via the handle_new_user() trigger function
