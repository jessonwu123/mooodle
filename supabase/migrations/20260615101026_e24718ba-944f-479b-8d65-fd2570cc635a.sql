ALTER TABLE public.math_questions
  ADD COLUMN IF NOT EXISTS stem_render_mode TEXT NOT NULL DEFAULT 'text'
    CHECK (stem_render_mode IN ('text', 'image')),
  ADD COLUMN IF NOT EXISTS options_render_mode TEXT NOT NULL DEFAULT 'text'
    CHECK (options_render_mode IN ('text', 'image'));