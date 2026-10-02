-- Run only in an empty, disposable local database with psql -v ON_ERROR_STOP=1 -f tests/team-management.sql.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
\ir ../supabase/bootstrap/fresh-crm.sql
\ir ../supabase/migrations/20261002100000_team_management.sql

INSERT INTO auth.users VALUES
 ('00000000-0000-0000-0000-000000000001', 'admin@example.test', now()),
 ('00000000-0000-0000-0000-000000000002', 'rep@example.test', now()),
 ('00000000-0000-0000-0000-000000000003', 'invite@example.test', null),
 ('00000000-0000-0000-0000-000000000004', 'second-admin@example.test', now());
INSERT INTO public.profiles(id, email) SELECT id, email FROM auth.users;
INSERT INTO public.user_roles(user_id, role) VALUES
 ('00000000-0000-0000-0000-000000000001', 'admin'),
 ('00000000-0000-0000-0000-000000000002', 'rep'),
 ('00000000-0000-0000-0000-000000000004', 'admin');
INSERT INTO public.leads(id, company, owner_id, created_by) VALUES
 ('10000000-0000-0000-0000-000000000001', 'Keep this lead', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.activities(lead_id, user_id, body) VALUES
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Keep this history');

-- Admin-only enforcement holds even with direct RPC calls.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.remove_crm_member('00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST: non-admin removal succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Alleen beheerders%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.configure_crm_invitation('00000000-0000-0000-0000-000000000003', 'Invited', '', 'admin');
    RAISE EXCEPTION 'TEST: non-admin invitation succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Alleen beheerders%' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.remove_crm_member(auth.uid());
    RAISE EXCEPTION 'TEST: self-removal succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Je kunt jezelf%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.configure_crm_invitation('00000000-0000-0000-0000-000000000002', 'Overwrite', '', 'admin');
    RAISE EXCEPTION 'TEST: confirmed user invitation succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Dit account bestaat al%' THEN RAISE; END IF;
  END;
END $$;
SELECT public.configure_crm_invitation('00000000-0000-0000-0000-000000000003', 'Invited Person', 'Sales', 'rep');
SELECT public.remove_crm_member('00000000-0000-0000-0000-000000000002');
SELECT public.remove_crm_member('00000000-0000-0000-0000-000000000004');

-- A removed administrator cannot remove the remaining administrator with an old session.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.remove_crm_member('00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST: removed admin retained access';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Alleen beheerders%' THEN RAISE; END IF;
  END;
END $$;

-- A removed user's existing JWT cannot read leads or history, or acquire a role.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.leads) THEN RAISE EXCEPTION 'TEST: removed user can read leads'; END IF;
  IF EXISTS(SELECT 1 FROM public.activities) THEN RAISE EXCEPTION 'TEST: removed user can read history'; END IF;
  BEGIN
    INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin');
    RAISE EXCEPTION 'TEST: removed user escalated role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.leads) <> 1 THEN RAISE EXCEPTION 'TEST: lead lost'; END IF;
  IF EXISTS(SELECT 1 FROM public.leads WHERE owner_id IS NOT NULL) THEN RAISE EXCEPTION 'TEST: owner retained'; END IF;
  IF (SELECT count(*) FROM public.activities) <> 1 THEN RAISE EXCEPTION 'TEST: history lost'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 4 THEN RAISE EXCEPTION 'TEST: identity lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.account_requests WHERE user_id = '00000000-0000-0000-0000-000000000002' AND status = 'declined') THEN RAISE EXCEPTION 'TEST: removed access request not retained'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003' AND team = 'Sales' AND full_name = 'Invited Person') THEN RAISE EXCEPTION 'TEST: invited profile missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000003' AND role = 'rep') THEN RAISE EXCEPTION 'TEST: invitation role missing'; END IF;
END $$;
\echo 'Team management database checks passed.'
