-- Fresh Sales CRM schema. Run once in a NEW empty Supabase project only.

-- No leads, users, activities, or integration tokens are copied.

BEGIN;

-- ROLES ENUM
CREATE TYPE public.app_role AS ENUM ('admin', 'team_leader', 'rep');
CREATE TYPE public.lead_source AS ENUM ('email', 'linkedin', 'ads', 'cold_call', 'referral', 'event', 'csv', 'website');
CREATE TYPE public.lead_stage AS ENUM ('new', 'contacted', 'engaged', 'meeting', 'proposal', 'won', 'lost');
CREATE TYPE public.activity_channel AS ENUM ('email', 'linkedin', 'ads', 'call', 'meeting', 'note');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  team text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','team_leader')
  )
$$;

CREATE POLICY "user_roles_select_all" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  contact_name text,
  job_title text,
  email text,
  phone text,
  linkedin_url text,
  website text,
  city text,
  country text,
  source public.lead_source NOT NULL DEFAULT 'cold_call',
  campaign text,
  stage public.lead_stage NOT NULL DEFAULT 'new',
  priority int NOT NULL DEFAULT 3,
  value_estimate numeric(12,2),
  notes text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  import_batch_id uuid,
  last_touch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_owner_idx ON public.leads(owner_id);
CREATE INDEX leads_stage_idx ON public.leads(stage);
CREATE INDEX leads_source_idx ON public.leads(source);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_select_all" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_manager(auth.uid()))
  WITH CHECK (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_manager(auth.uid()));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_manager(auth.uid()));

-- ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel public.activity_channel NOT NULL DEFAULT 'note',
  direction text NOT NULL DEFAULT 'outbound',
  subject text,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead_idx ON public.activities(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_select_all" ON public.activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "activities_insert" ON public.activities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activities_update" ON public.activities FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_manager(auth.uid()));
CREATE POLICY "activities_delete" ON public.activities FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()));

-- IMPORT BATCHES
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  source public.lead_source NOT NULL DEFAULT 'csv',
  campaign text,
  row_count int NOT NULL DEFAULT 0,
  imported_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_batches_select_all" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "import_batches_insert" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.account_request_status AS ENUM ('pending', 'approved', 'declined');

CREATE TABLE public.account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  email text NOT NULL,
  status public.account_request_status NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.account_requests TO authenticated;
GRANT ALL ON public.account_requests TO service_role;

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_requests_select_own_or_admin"
ON public.account_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "account_requests_insert_own"
ON public.account_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND decided_by IS NULL AND decided_at IS NULL);

CREATE TRIGGER account_requests_set_updated_at
BEFORE UPDATE ON public.account_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER POLICY "leads_select_all" ON public.leads USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_insert" ON public.leads WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_update" ON public.leads USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_delete" ON public.leads USING (((auth.uid() = owner_id) OR (auth.uid() = created_by) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "activities_select_all" ON public.activities USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_insert" ON public.activities WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_update" ON public.activities USING (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())) WITH CHECK (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_delete" ON public.activities USING (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "profiles_select_all" ON public.profiles USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "import_batches_select_all" ON public.import_batches USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "import_batches_insert" ON public.import_batches WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));


ALTER POLICY "user_roles_select_all" ON public.user_roles USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
CREATE POLICY "app_settings_admin_all" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;


GRANT SELECT, INSERT, UPDATE ON public.account_requests TO authenticated;
GRANT ALL ON public.account_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;

CREATE INDEX leads_incoming_idx ON public.leads(created_at DESC, id DESC);

COMMIT;