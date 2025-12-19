-- Add color column to cards table
ALTER TABLE public.cards ADD COLUMN color text DEFAULT NULL;

-- Add color column to columns table
ALTER TABLE public.columns ADD COLUMN color text DEFAULT NULL;