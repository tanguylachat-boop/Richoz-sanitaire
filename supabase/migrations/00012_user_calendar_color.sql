-- Add calendar_color column to users table for technician color in calendar
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS calendar_color text DEFAULT NULL;
