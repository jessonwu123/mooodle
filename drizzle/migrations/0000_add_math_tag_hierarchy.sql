ALTER TABLE public.math_tags
ADD COLUMN parent_id uuid NULL REFERENCES public.math_tags(id) ON DELETE RESTRICT;

ALTER TABLE public.math_tags
ADD CONSTRAINT math_tags_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX math_tags_parent_id_idx ON public.math_tags(parent_id);