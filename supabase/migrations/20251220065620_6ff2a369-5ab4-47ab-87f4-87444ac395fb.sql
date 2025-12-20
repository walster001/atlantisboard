-- Add new columns to board_themes for card detail window button styling and intelligent contrast
ALTER TABLE public.board_themes
ADD COLUMN IF NOT EXISTS card_window_button_color text NOT NULL DEFAULT '#0079bf',
ADD COLUMN IF NOT EXISTS card_window_button_text_color text NOT NULL DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS card_window_intelligent_contrast boolean NOT NULL DEFAULT false;