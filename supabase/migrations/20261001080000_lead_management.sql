-- Preserve leads and related documents/history when moved to the trash.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
