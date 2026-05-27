ALTER TABLE public.pets 
  ADD COLUMN IF NOT EXISTS challenges_today smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_date date;