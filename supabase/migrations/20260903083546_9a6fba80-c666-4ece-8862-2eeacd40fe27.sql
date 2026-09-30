CREATE TABLE public.teamleader_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company text NOT NULL,
  contact_name text,
  job_title text,
  email text,
  phone text,
  city text,
  country text,
  teamleader_id text,
  teamleader_owner text,
  tags text,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teamleader_contacts TO authenticated;
GRANT ALL ON public.teamleader_contacts TO service_role;

ALTER TABLE public.teamleader_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teamleader_contacts_select_all" ON public.teamleader_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "teamleader_contacts_insert" ON public.teamleader_contacts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "teamleader_contacts_update" ON public.teamleader_contacts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teamleader_contacts_delete" ON public.teamleader_contacts
  FOR DELETE TO authenticated USING (true);

CREATE INDEX teamleader_contacts_email_idx ON public.teamleader_contacts (lower(email));
CREATE INDEX teamleader_contacts_company_idx ON public.teamleader_contacts (lower(company));

CREATE TRIGGER teamleader_contacts_set_updated_at
  BEFORE UPDATE ON public.teamleader_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();