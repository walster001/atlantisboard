-- Add button hover color fields to board_themes table
ALTER TABLE public.board_themes
ADD COLUMN card_window_button_hover_color text DEFAULT '#005a8c',
ADD COLUMN card_window_button_hover_text_color text DEFAULT '#ffffff';