DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_venue') THEN
    CREATE TYPE public.lead_venue AS ENUM ('gent', 'hasselt', 'ekart');
  END IF;
END $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS venue public.lead_venue NOT NULL DEFAULT 'gent';

CREATE INDEX IF NOT EXISTS leads_venue_idx ON public.leads (venue);