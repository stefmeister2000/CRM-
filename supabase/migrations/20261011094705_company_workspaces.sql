-- Apply to the existing CRM, never rerun the fresh bootstrap. Existing data stays in Verkoop Studio.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm_private;
REVOKE ALL ON SCHEMA crm_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA crm_private TO authenticated, service_role;

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
INSERT INTO public.companies(id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Verkoop Studio');

CREATE TABLE crm_private.platform_admins (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
ALTER TABLE crm_private.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_private.platform_admins FROM PUBLIC, anon, authenticated;
-- Existing trusted CRM administrators are the software operators. New company admins are NOT operators.
INSERT INTO crm_private.platform_admins SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['leads','activities','import_batches','user_roles','app_settings','account_requests','teamleader_contacts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', t, '00000000-0000-4000-8000-000000000001');
      EXECUTE format('CREATE INDEX %I ON public.%I(company_id)', t || '_company_idx', t);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.user_roles ADD COLUMN team text NOT NULL DEFAULT '';
UPDATE public.user_roles r SET team = COALESCE(p.team, '') FROM public.profiles p WHERE p.id = r.user_id;
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD UNIQUE (company_id, user_id, role);
CREATE INDEX user_roles_user_company_idx ON public.user_roles(user_id, company_id);
ALTER TABLE public.app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (company_id, key);
CREATE UNIQUE INDEX app_settings_intake_token_unique ON public.app_settings(value) WHERE key = 'inbound_lead_token';
ALTER TABLE public.account_requests DROP CONSTRAINT account_requests_user_id_key;
ALTER TABLE public.account_requests ADD UNIQUE (company_id, user_id);
CREATE INDEX leads_company_created_idx ON public.leads(company_id, created_at DESC, id DESC);
CREATE INDEX leads_company_owner_idx ON public.leads(company_id, owner_id);
CREATE INDEX activities_company_lead_idx ON public.activities(company_id, lead_id);

CREATE FUNCTION crm_private.is_member(_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = _company AND user_id = auth.uid())
$$;
CREATE FUNCTION crm_private.company_admin(_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = _company AND user_id = auth.uid() AND role = 'admin')
$$;
CREATE FUNCTION crm_private.current_company() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested text; selected uuid; BEGIN
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 requested := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-crm-company-id';
 IF requested IS NOT NULL THEN
   IF requested !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
   selected := requested::uuid;
   IF crm_private.is_member(selected) THEN RETURN selected; END IF;
   RETURN NULL;
 END IF;
 -- Backward compatibility for single-company clients; ambiguous requests fail closed.
 SELECT min(company_id::text)::uuid INTO selected FROM public.user_roles WHERE user_id = auth.uid() HAVING count(DISTINCT company_id) = 1;
 RETURN selected;
END $$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT _user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = crm_private.current_company() AND user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'team_leader')
$$;
CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.current_company() $$;

DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['leads','activities','import_batches','user_roles','app_settings','teamleader_contacts'] LOOP
  IF to_regclass('public.' || t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT crm_private.current_company()', t);
  END IF;
 END LOOP;
 FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('leads','activities','import_batches','user_roles','app_settings','account_requests','teamleader_contacts','profiles') LOOP
  EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
 END LOOP;
END $$;
CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (crm_private.is_member(id));
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (company_id = (SELECT crm_private.current_company()));
-- Membership mutations go through checked, atomic RPCs, never arbitrary direct writes.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
CREATE POLICY leads_read ON public.leads FOR SELECT TO authenticated USING (company_id = (SELECT crm_private.current_company()));
CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT crm_private.current_company()) AND created_by = (SELECT auth.uid()));
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated USING (company_id = (SELECT crm_private.current_company())) WITH CHECK (company_id = (SELECT crm_private.current_company()));
CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated USING (company_id = (SELECT crm_private.current_company()) AND (owner_id = auth.uid() OR created_by = auth.uid() OR public.is_manager(auth.uid())));
CREATE POLICY activities_read ON public.activities FOR SELECT TO authenticated USING (company_id = (SELECT crm_private.current_company()));
CREATE POLICY activities_insert ON public.activities FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT crm_private.current_company()) AND user_id = auth.uid());
CREATE POLICY activities_update ON public.activities FOR UPDATE TO authenticated USING (company_id = (SELECT crm_private.current_company()) AND (user_id = auth.uid() OR public.is_manager(auth.uid()))) WITH CHECK (company_id = (SELECT crm_private.current_company()) AND (user_id = auth.uid() OR public.is_manager(auth.uid())));
CREATE POLICY activities_delete ON public.activities FOR DELETE TO authenticated USING (company_id = (SELECT crm_private.current_company()) AND (user_id = auth.uid() OR public.is_manager(auth.uid())));
CREATE POLICY imports_read ON public.import_batches FOR SELECT TO authenticated USING (company_id = (SELECT crm_private.current_company()));
CREATE POLICY imports_insert ON public.import_batches FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT crm_private.current_company()) AND created_by = auth.uid());
CREATE POLICY settings_admin ON public.app_settings FOR ALL TO authenticated USING (company_id = (SELECT crm_private.current_company()) AND crm_private.company_admin(company_id)) WITH CHECK (company_id = (SELECT crm_private.current_company()) AND crm_private.company_admin(company_id));
-- Identity is shared, but the legacy profile team label belongs to Verkoop only.
-- Keep its historical value in the database and expose company-specific user_roles.team instead.
REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,full_name,email,created_at,updated_at) ON public.profiles TO authenticated;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = profiles.id AND company_id = (SELECT crm_private.current_company())));
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY requests_read ON public.account_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR (company_id = (SELECT crm_private.current_company()) AND crm_private.company_admin(company_id)));
CREATE POLICY requests_insert ON public.account_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND company_id = '00000000-0000-4000-8000-000000000001' AND status = 'pending' AND decided_by IS NULL AND decided_at IS NULL);
DO $$ BEGIN
 IF to_regclass('public.teamleader_contacts') IS NOT NULL THEN
  EXECUTE 'CREATE POLICY contacts_company ON public.teamleader_contacts FOR ALL TO authenticated USING (company_id = (SELECT crm_private.current_company())) WITH CHECK (company_id = (SELECT crm_private.current_company()))';
 END IF;
END $$;

-- Deny moves between companies, including for people who belong to both.
CREATE FUNCTION crm_private.immutable_company() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Records cannot be moved between companies'; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['leads','activities','import_batches','user_roles','app_settings','account_requests','teamleader_contacts'] LOOP
  IF to_regclass('public.' || t) IS NOT NULL THEN
   EXECUTE format('CREATE TRIGGER immutable_company BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION crm_private.immutable_company()', t);
  END IF;
 END LOOP;
END $$;
-- Composite foreign keys protect parent links even on privileged server writes.
ALTER TABLE public.leads ADD UNIQUE(company_id, id);
ALTER TABLE public.import_batches ADD UNIQUE(company_id, id);
ALTER TABLE public.activities ADD CONSTRAINT activities_company_lead_fkey FOREIGN KEY(company_id, lead_id) REFERENCES public.leads(company_id, id) ON DELETE CASCADE;
-- Old installations may contain historical batch IDs without batch rows; validate new writes without dropping history.
ALTER TABLE public.leads ADD CONSTRAINT leads_company_import_fkey FOREIGN KEY(company_id, import_batch_id) REFERENCES public.import_batches(company_id, id) NOT VALID;
CREATE FUNCTION crm_private.check_lead_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
 IF NEW.owner_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = NEW.company_id AND user_id = NEW.owner_id) THEN
  RAISE EXCEPTION 'Lead owner must belong to this company';
 END IF;
 IF NEW.created_by IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.created_by IS DISTINCT FROM OLD.created_by) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = NEW.company_id AND user_id = NEW.created_by) THEN
  RAISE EXCEPTION 'Lead creator must belong to this company';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER check_lead_owner BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION crm_private.check_lead_owner();

-- Storage does not universally forward custom request headers into PostgreSQL.
-- Authorize the linked lead's company directly; keep uploader-only file visibility.
CREATE FUNCTION crm_private.document_access(_lead text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested text; BEGIN
 IF auth.uid() IS NULL OR _lead IS NULL OR _lead !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 requested := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-crm-company-id';
 RETURN EXISTS(SELECT 1 FROM public.leads l JOIN public.user_roles r ON r.company_id=l.company_id AND r.user_id=auth.uid()
  WHERE l.id=_lead::uuid AND (requested IS NULL OR l.company_id=crm_private.current_company()));
END $$;
DROP POLICY crm_documents_read ON storage.objects;
DROP POLICY crm_documents_upload ON storage.objects;
CREATE POLICY crm_documents_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='lead-documents' AND owner_id=(SELECT auth.uid())::text AND crm_private.document_access((storage.foldername(name))[1])
);
CREATE POLICY crm_documents_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='lead-documents' AND owner_id=(SELECT auth.uid())::text AND crm_private.document_access((storage.foldername(name))[1]) AND (storage.foldername(name))[2] IN ('contract','quote')
);

CREATE FUNCTION crm_private.list_companies() RETURNS TABLE(id uuid, name text, role public.app_role, platform_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT c.id, c.name, CASE WHEN bool_or(r.role = 'admin') THEN 'admin'::public.app_role WHEN bool_or(r.role = 'team_leader') THEN 'team_leader'::public.app_role ELSE 'rep'::public.app_role END,
 EXISTS(SELECT 1 FROM crm_private.platform_admins WHERE user_id = auth.uid())
 FROM public.companies c JOIN public.user_roles r ON r.company_id = c.id WHERE r.user_id = auth.uid()
 GROUP BY c.id ORDER BY c.created_at, c.id
$$;
CREATE FUNCTION public.list_my_companies() RETURNS TABLE(id uuid, name text, role public.app_role, platform_owner boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT * FROM crm_private.list_companies() $$;
CREATE FUNCTION crm_private.create_company(_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ DECLARE created uuid; BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM crm_private.platform_admins WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Only software administrators can create companies'; END IF;
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Enter a company name (1–200 characters)'; END IF;
 INSERT INTO public.companies(name, created_by) VALUES(btrim(_name), auth.uid()) RETURNING id INTO created;
 INSERT INTO public.user_roles(company_id, user_id, role) VALUES(created, auth.uid(), 'admin');
 RETURN created;
END $$;
CREATE FUNCTION public.create_crm_company(_name text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.create_company(_name) $$;

CREATE TABLE public.company_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 email text NOT NULL, full_name text NOT NULL, team text NOT NULL DEFAULT '', role public.app_role NOT NULL,
 token_hash text NOT NULL UNIQUE, invited_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
 revoked_at timestamptz, accepted_at timestamptz, accepted_by uuid REFERENCES auth.users(id)
);
CREATE INDEX company_invitations_company_idx ON public.company_invitations(company_id, created_at DESC);
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,company_id,email,full_name,team,role,invited_by,created_at,expires_at,revoked_at,accepted_at,accepted_by) ON public.company_invitations TO authenticated;
GRANT ALL ON public.company_invitations TO service_role;
CREATE POLICY invitations_admin_read ON public.company_invitations FOR SELECT TO authenticated USING (company_id = (SELECT crm_private.current_company()) AND crm_private.company_admin(company_id));
CREATE FUNCTION crm_private.invite_company_member(_email text, _full_name text, _team text, _role public.app_role) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c uuid := crm_private.current_company(); token text; invitation uuid; BEGIN
 PERFORM 1 FROM public.companies WHERE id = c FOR UPDATE;
 IF NOT crm_private.company_admin(c) THEN RAISE EXCEPTION 'Alleen beheerders kunnen uitnodigingen maken.'; END IF;
 IF _email IS NULL OR _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(_email) > 254 OR length(btrim(_full_name)) NOT BETWEEN 1 AND 200 OR length(_team) > 200 THEN RAISE EXCEPTION 'Invalid invitation details'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id WHERE r.company_id = c AND lower(u.email) = lower(btrim(_email))) THEN RAISE EXCEPTION 'Deze persoon is al lid van dit bedrijf.'; END IF;
 UPDATE public.company_invitations SET revoked_at = now() WHERE company_id = c AND email = lower(btrim(_email)) AND accepted_at IS NULL AND revoked_at IS NULL;
 token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
 INSERT INTO public.company_invitations(company_id,email,full_name,team,role,token_hash,invited_by)
 VALUES(c,lower(btrim(_email)),btrim(_full_name),_team,_role,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid()) RETURNING id INTO invitation;
 RETURN jsonb_build_object('id',invitation,'token',token);
END $$;
CREATE FUNCTION public.invite_company_member(_email text, _full_name text, _team text, _role public.app_role) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.invite_company_member(_email,_full_name,_team,_role) $$;
CREATE FUNCTION crm_private.accept_invitation(_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invitation public.company_invitations; verified_email text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invitation'; END IF;
 SELECT email INTO verified_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
 SELECT * INTO invitation FROM public.company_invitations WHERE token_hash = encode(sha256(convert_to(_token,'UTF8')),'hex');
 IF NOT FOUND OR verified_email IS NULL OR lower(verified_email) <> invitation.email OR invitation.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation is invalid or belongs to another email address'; END IF;
 PERFORM 1 FROM public.companies WHERE id = invitation.company_id FOR UPDATE;
 SELECT * INTO invitation FROM public.company_invitations WHERE id = invitation.id FOR UPDATE;
 IF invitation.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation is invalid or belongs to another email address'; END IF;
 IF invitation.accepted_at IS NOT NULL THEN
  IF invitation.accepted_by = auth.uid() AND crm_private.is_member(invitation.company_id) THEN RETURN invitation.company_id; END IF;
  RAISE EXCEPTION 'Invitation has already been used';
 END IF;
 IF invitation.expires_at <= now() OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = invitation.company_id AND user_id = invitation.invited_by AND role = 'admin') THEN RAISE EXCEPTION 'Invitation has expired or was revoked'; END IF;
 INSERT INTO public.profiles(id,email,full_name,team) VALUES(auth.uid(),verified_email,invitation.full_name,invitation.team) ON CONFLICT(id) DO NOTHING;
 IF NOT crm_private.is_member(invitation.company_id) THEN
  INSERT INTO public.user_roles(company_id,user_id,role,team) VALUES(invitation.company_id,auth.uid(),invitation.role,invitation.team);
 END IF;
 UPDATE public.company_invitations SET accepted_at = now(), accepted_by = auth.uid() WHERE id = invitation.id;
 UPDATE public.account_requests SET status = 'approved', decided_at = now(), decided_by = invitation.invited_by WHERE company_id = invitation.company_id AND user_id = auth.uid();
 RETURN invitation.company_id;
END $$;
CREATE FUNCTION public.accept_company_invitation(_token text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.accept_invitation(_token) $$;
CREATE FUNCTION crm_private.revoke_invitation(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c uuid := crm_private.current_company(); BEGIN
 PERFORM 1 FROM public.companies WHERE id = c FOR UPDATE;
 IF NOT crm_private.company_admin(c) THEN RAISE EXCEPTION 'Only company administrators can revoke invitations'; END IF;
 UPDATE public.company_invitations SET revoked_at = now() WHERE id = _id AND company_id = c AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is no longer pending'; END IF;
END $$;
CREATE FUNCTION public.revoke_company_invitation(_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.revoke_invitation(_id) $$;

CREATE FUNCTION crm_private.change_member(_user_id uuid, _role public.app_role DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c uuid := crm_private.current_company(); member_team text; BEGIN
 PERFORM 1 FROM public.companies WHERE id = c FOR UPDATE;
 IF NOT crm_private.company_admin(c) THEN RAISE EXCEPTION 'Alleen beheerders kunnen gebruikers beheren.'; END IF;
 IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Je kunt jezelf niet verwijderen of je eigen rol wijzigen.'; END IF;
 IF EXISTS(SELECT 1 FROM crm_private.platform_admins WHERE user_id = _user_id) THEN RAISE EXCEPTION 'Software administrators manage their own company access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = c AND user_id = _user_id) THEN RAISE EXCEPTION 'Deze persoon heeft geen toegang tot dit bedrijf.'; END IF;
 SELECT max(team) INTO member_team FROM public.user_roles WHERE company_id = c AND user_id = _user_id;
 DELETE FROM public.user_roles WHERE company_id = c AND user_id = _user_id;
 IF _role IS NOT NULL THEN
  INSERT INTO public.user_roles(company_id,user_id,role,team) VALUES(c,_user_id,_role,COALESCE(member_team,''));
 ELSE
  UPDATE public.leads SET owner_id = NULL WHERE company_id = c AND owner_id = _user_id;
  UPDATE public.company_invitations SET revoked_at = now() WHERE company_id = c AND invited_by = _user_id AND accepted_at IS NULL;
  UPDATE public.account_requests SET status = 'declined', decided_by = auth.uid(), decided_at = now() WHERE company_id = c AND user_id = _user_id;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.remove_crm_member(_user_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.change_member(_user_id) $$;
CREATE FUNCTION public.set_company_member_role(_user_id uuid, _role public.app_role) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.change_member(_user_id, _role) $$;
CREATE FUNCTION crm_private.decide_request(_request_id uuid, _user_id uuid, _approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c uuid := crm_private.current_company(); BEGIN
 PERFORM 1 FROM public.companies WHERE id = c FOR UPDATE;
 IF NOT crm_private.company_admin(c) THEN RAISE EXCEPTION 'Only company administrators can handle requests'; END IF;
 PERFORM 1 FROM public.account_requests WHERE id = _request_id AND company_id = c AND user_id = _user_id AND status = 'pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
 IF _approve AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id = c AND user_id = _user_id) THEN
  INSERT INTO public.user_roles(company_id,user_id,role) VALUES(c,_user_id,'rep');
 END IF;
 UPDATE public.account_requests SET status = CASE WHEN _approve THEN 'approved'::public.account_request_status ELSE 'declined'::public.account_request_status END, decided_by = auth.uid(), decided_at = now() WHERE id = _request_id;
END $$;
CREATE FUNCTION public.decide_company_request(_request_id uuid, _user_id uuid, _approve boolean) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT crm_private.decide_request(_request_id,_user_id,_approve) $$;

-- Legacy provisioning RPC must never create an unscoped membership.
REVOKE ALL ON FUNCTION public.configure_crm_invitation(uuid,text,text,public.app_role) FROM PUBLIC, anon, authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('claim_admin','ensure_rep_role') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA crm_private TO authenticated, service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('current_company_id','list_my_companies','create_crm_company','invite_company_member','accept_company_invitation','revoke_company_invitation','set_company_member_role','decide_company_request','remove_crm_member','has_role','is_manager') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
 END LOOP;
END $$;
COMMIT;
