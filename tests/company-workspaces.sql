-- Destructive ONLY to a disposable test database with this exact name.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'crm_company_test' THEN RAISE EXCEPTION 'Run only against crm_company_test'; END IF; END $$;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS crm_private CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,owner_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
\ir ../supabase/bootstrap/fresh-crm.sql
\ir ../supabase/migrations/20260930160000_lead_documents.sql
\ir ../supabase/migrations/20261001080000_lead_management.sql
\ir ../supabase/migrations/20261002100000_team_management.sql
-- Include a legacy table to verify that older installations are isolated too.
CREATE TABLE public.teamleader_contacts(id uuid PRIMARY KEY,company text);
ALTER TABLE public.teamleader_contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.teamleader_contacts TO authenticated;
CREATE POLICY old_shared ON public.teamleader_contacts FOR ALL TO authenticated USING(true) WITH CHECK(true);
INSERT INTO auth.users VALUES
 ('10000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('10000000-0000-4000-8000-000000000002','shared@example.test',now()),
 ('10000000-0000-4000-8000-000000000003','client-admin@example.test',now()),
 ('10000000-0000-4000-8000-000000000004','client-rep@example.test',now()),
 ('10000000-0000-4000-8000-000000000005','new@example.test',now()),
 ('10000000-0000-4000-8000-000000000006','outsider@example.test',now());
INSERT INTO public.profiles(id,email,full_name) SELECT id,email,email FROM auth.users;
INSERT INTO public.user_roles(user_id,role) VALUES('10000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000002','rep');
INSERT INTO public.leads(id,company,owner_id,created_by,notes) VALUES('20000000-0000-4000-8000-000000000001','Original lead','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Keep original notes');
INSERT INTO public.activities(lead_id,user_id,body) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Keep history');
INSERT INTO public.import_batches(id,file_name,created_by) VALUES('30000000-0000-4000-8000-000000000001','original.csv','10000000-0000-4000-8000-000000000002');
INSERT INTO public.app_settings(key,value) VALUES('inbound_lead_token','original-secret');
INSERT INTO storage.objects(bucket_id,owner_id,name) VALUES('lead-documents','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001/quote/file.pdf');
INSERT INTO public.teamleader_contacts VALUES('40000000-0000-4000-8000-000000000001','Old contact');
\ir ../supabase/migrations/20261011094705_company_workspaces.sql
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'TEST: %',message; END IF; END $$;
SELECT pg_temp.assert((SELECT count(*)=1 AND min(company_id::text)='00000000-0000-4000-8000-000000000001' FROM public.leads),'legacy leads preserved');
SELECT pg_temp.assert((SELECT notes='Keep original notes' FROM public.leads LIMIT 1),'notes preserved');
SELECT pg_temp.assert((SELECT value='original-secret' FROM public.app_settings LIMIT 1),'intake token preserved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.headers','{}',false);
SELECT pg_temp.assert(public.current_company_id()='00000000-0000-4000-8000-000000000001','single-company fallback');
SELECT public.create_crm_company('Client Company') AS client_company \gset
SELECT set_config('test.company_b', :'client_company', false);
SELECT pg_temp.assert(public.current_company_id() IS NULL,'multi-company missing header fails closed');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.leads),'no mixed records without scope');
SELECT set_config('request.headers',jsonb_build_object('x-crm-company-id', :'client_company')::text,false);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.leads),'new company starts empty');
RESET ROLE;
INSERT INTO public.user_roles(company_id,user_id,role) VALUES(:'client_company','10000000-0000-4000-8000-000000000003','admin'),(:'client_company','10000000-0000-4000-8000-000000000004','rep');
INSERT INTO public.leads(id,company_id,company,owner_id,created_by) VALUES('20000000-0000-4000-8000-000000000002',:'client_company','Private client lead','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004');
INSERT INTO public.activities(company_id,lead_id,user_id,body) VALUES(:'client_company','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Private client history');
INSERT INTO public.import_batches(company_id,file_name) VALUES(:'client_company','private.csv');
INSERT INTO public.app_settings(company_id,key,value) VALUES(:'client_company','inbound_lead_token','client-secret');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert((SELECT count(*)=1 AND min(company)='Private client lead' FROM public.leads),'client lead isolation');
SELECT pg_temp.assert((SELECT count(*)=1 AND min(body)='Private client history' FROM public.activities),'history isolation');
SELECT pg_temp.assert((SELECT count(*)=1 AND min(file_name)='private.csv' FROM public.import_batches),'import isolation');
SELECT pg_temp.assert((SELECT count(*)=1 AND min(value)='client-secret' FROM public.app_settings),'token isolation');
SELECT pg_temp.assert((SELECT count(*)=3 FROM public.profiles),'company directory isolation');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.teamleader_contacts),'legacy table isolation');
DO $$ BEGIN
 BEGIN PERFORM public.create_crm_company('Unauthorized company'); RAISE EXCEPTION 'TEST: tenant admin became operator'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Only software%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.remove_crm_member('10000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'TEST: removed another company member'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Deze persoon%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.set_company_member_role('10000000-0000-4000-8000-000000000001','rep'); RAISE EXCEPTION 'TEST: demoted software owner'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Software administrators%' THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.user_roles(company_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000001',auth.uid(),'admin'); RAISE EXCEPTION 'TEST: direct role escalation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.activities(lead_id,user_id,body) VALUES('20000000-0000-4000-8000-000000000001',auth.uid(),'cross-company'); RAISE EXCEPTION 'TEST: cross-company activity'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN UPDATE public.leads SET owner_id='10000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'TEST: foreign company owner'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Lead owner%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.leads SET import_batch_id='30000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'TEST: foreign import batch'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN UPDATE public.leads SET company_id='00000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'TEST: company move'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Records cannot%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.headers','{"x-crm-company-id":"00000000-0000-4000-8000-000000000001"}',false);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.leads),'forged company header fails closed');
DO $$ BEGIN
 BEGIN INSERT INTO storage.objects(bucket_id,owner_id,name) VALUES('lead-documents',auth.uid()::text,'20000000-0000-4000-8000-000000000001/quote/forged.pdf'); RAISE EXCEPTION 'TEST: uploaded into foreign company'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.assert(NOT public.has_role(auth.uid(),'admin'),'no cross-company admin');
SELECT set_config('request.headers','{"x-crm-company-id":"malformed"}',false);
SELECT pg_temp.assert(public.current_company_id() IS NULL,'malformed header fails closed');
SELECT set_config('request.headers',jsonb_build_object('x-crm-company-id', :'client_company')::text,false);
SELECT public.invite_company_member('shared@example.test','Shared colleague','','rep')->>'token' AS invite_token \gset
SELECT set_config('test.invite_token', :'invite_token',false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.invite_token')); RAISE EXCEPTION 'TEST: wrong email accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation is invalid%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
SELECT public.accept_company_invitation(:'invite_token');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.list_my_companies()),'existing account joined second company');
SELECT pg_temp.assert((SELECT count(*)=1 AND min(company)='Private client lead' FROM public.leads),'accepted company scope');
SELECT public.accept_company_invitation(:'invite_token'); -- idempotent retry, never creates a second role
SELECT set_config('request.headers','{"x-crm-company-id":"00000000-0000-4000-8000-000000000001"}',false);
SELECT pg_temp.assert((SELECT count(*)=1 AND min(company)='Original lead' FROM public.leads),'company switch isolates shared user');
SELECT pg_temp.assert((SELECT count(*)=1 FROM storage.objects),'existing attachment preserved');
SELECT set_config('request.headers',jsonb_build_object('x-crm-company-id', :'client_company')::text,false);
SELECT pg_temp.assert((SELECT count(*)=0 FROM storage.objects),'attachments follow company scope');
SELECT set_config('request.headers','{}',false);
SELECT pg_temp.assert((SELECT count(*)=1 FROM storage.objects),'multi-company storage works without custom headers');
SELECT set_config('request.headers',jsonb_build_object('x-crm-company-id', :'client_company')::text,false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT public.remove_crm_member('10000000-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.leads),'removed member old JWT denied');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.list_my_companies()),'removal preserves other company access');
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.invite_token')); RAISE EXCEPTION 'TEST: revoked membership resurrected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation has already%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT public.invite_company_member('new@example.test','New user','','admin')->>'token' AS revoked_token \gset
SELECT id AS revoke_id FROM public.company_invitations WHERE email='new@example.test' \gset
SELECT public.revoke_company_invitation(:'revoke_id');
SELECT set_config('test.revoked_token', :'revoked_token',false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.revoked_token')); RAISE EXCEPTION 'TEST: revoked invite accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation is invalid%' THEN RAISE; END IF; END;
END $$;
-- Expiry, replacement and inviter-removal also invalidate pending invitations.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT public.invite_company_member('new@example.test','New user','Client sales','admin')->>'token' AS expired_token \gset
SELECT set_config('test.expired_token', :'expired_token',false);
RESET ROLE;
UPDATE public.company_invitations SET expires_at=now()-interval '1 second' WHERE email='new@example.test' AND revoked_at IS NULL;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.expired_token')); RAISE EXCEPTION 'TEST: expired invite accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation has expired%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT public.invite_company_member('new@example.test','New user','Client sales','rep')->>'token' AS replaced_token \gset
SELECT set_config('test.replaced_token', :'replaced_token',false);
SELECT public.invite_company_member('new@example.test','New user','Client sales','rep')->>'token' AS valid_token \gset
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.replaced_token')); RAISE EXCEPTION 'TEST: replaced invite accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation is invalid%' THEN RAISE; END IF; END;
END $$;
SELECT public.accept_company_invitation(:'valid_token');
SELECT pg_temp.assert((SELECT team='Client sales' FROM public.user_roles WHERE user_id=auth.uid()),'team is company-specific');
DO $$ BEGIN
 BEGIN PERFORM public.invite_company_member('outsider@example.test','Outsider','','admin'); RAISE EXCEPTION 'TEST: rep invited admin'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Alleen beheerders%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT public.set_company_member_role('10000000-0000-4000-8000-000000000005','team_leader');
SELECT pg_temp.assert((SELECT team='Client sales' AND role='team_leader' FROM public.user_roles WHERE user_id='10000000-0000-4000-8000-000000000005'),'role update preserves company team');
SELECT public.invite_company_member('outsider@example.test','Outsider','','rep')->>'token' AS orphaned_token \gset
SELECT set_config('test.orphaned_token', :'orphaned_token',false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.remove_crm_member('10000000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_company_invitation(current_setting('test.orphaned_token')); RAISE EXCEPTION 'TEST: removed inviter granted access'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invitation is invalid%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
INSERT INTO public.account_requests(user_id,email) VALUES(auth.uid(),'new@example.test') RETURNING id AS request_id \gset
SELECT set_config('test.request_id', :'request_id',false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM public.decide_company_request(current_setting('test.request_id')::uuid,'10000000-0000-4000-8000-000000000005',true); RAISE EXCEPTION 'TEST: approved request in another company'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Request is no longer%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.headers','{"x-crm-company-id":"00000000-0000-4000-8000-000000000001"}',false);
SELECT public.decide_company_request(:'request_id','10000000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.list_my_companies()),'request approval preserves other membership');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
INSERT INTO public.account_requests(user_id,email) VALUES(auth.uid(),'outsider@example.test') RETURNING id AS declined_request \gset
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.decide_company_request(:'declined_request','10000000-0000-4000-8000-000000000006',false);
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.leads),'all lead history preserved');
SELECT pg_temp.assert((SELECT owner_id='10000000-0000-4000-8000-000000000002' FROM public.leads WHERE company='Original lead'),'other company ownership preserved');
SELECT pg_temp.assert((SELECT count(*)=6 FROM auth.users),'auth identities preserved');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.create_crm_company(text)','EXECUTE'),'anonymous cannot create company');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.configure_crm_invitation(uuid,text,text,public.app_role)','EXECUTE'),'legacy global invitation disabled');
\echo 'Company isolation, invitation, revocation, storage and migration checks passed.'
