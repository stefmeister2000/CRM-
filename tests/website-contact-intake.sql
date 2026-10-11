-- Disposable local database only; the setup script enforces its exact name.
\ir company-workspaces.sql
\ir ../supabase/migrations/20261011112632_website_contact_intake.sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public,crm_private TO service_role;
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.ingest_website_contact(uuid,uuid,jsonb)','EXECUTE'),'anonymous RPC denied');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.ingest_website_contact(uuid,uuid,jsonb)','EXECUTE'),'user RPC denied');
SET ROLE service_role;
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000001','{"contactName":"Same Name","email":"one@example.test","notes":"First request","campaign":"Fitness"}') AS first_result \gset
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000001','{"contactName":"Same Name","email":"one@example.test","notes":"First request","campaign":"Fitness"}') AS retry_result \gset
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000002','{"contactName":"Same Name","email":"two@example.test","notes":"Different person"}');
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000003','{"email":"ONE@example.test","notes":"Second request","campaign":"Boxing"}');
SELECT public.ingest_website_contact('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','{"email":"one@example.test","notes":"Other company"}');
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000004','{"phone":"+32400000000","notes":"Phone only"}');
SELECT public.ingest_website_contact(:'client_company','50000000-0000-4000-8000-000000000005','{"phone":"+32400000000","notes":"Second phone request"}');
RESET ROLE;
SELECT pg_temp.assert(:'first_result'::jsonb=:'retry_result'::jsonb,'retry returns the original response');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.leads WHERE company='Same Name' AND company_id=:'client_company'),'same names do not merge different contacts');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.activities WHERE lead_id=(:'first_result'::jsonb->>'leadId')::uuid),'retry does not duplicate history; new submission does');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.leads WHERE email='one@example.test'),'same contact isolated between companies');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.leads WHERE phone='+32400000000'),'phone-only contact matching');
SELECT pg_temp.assert((SELECT count(*)=6 FROM crm_private.website_submissions),'submissions recorded independently per company');
\echo 'Website contact intake checks passed.'
