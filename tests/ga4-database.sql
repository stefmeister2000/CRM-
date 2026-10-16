-- Transaction-only integration checks: no persisted test contacts and no HTTP.
BEGIN;
DO $$
DECLARE company uuid; lead uuid; untracked uuid; event crm_private.ga4_outbox; payload jsonb;
BEGIN
 SELECT company_id INTO company FROM crm_private.ga4_connections WHERE measurement_id='G-VRKJP8K3SD';
 IF company IS NULL THEN RAISE EXCEPTION 'Configure target company before testing'; END IF;
 INSERT INTO public.leads(company,company_id,source,stage) VALUES('GA4 rollback test',company,'website','new') RETURNING id INTO lead;
 INSERT INTO public.leads(company,company_id,source,stage) VALUES('GA4 untracked rollback test',company,'website','new') RETURNING id INTO untracked;
 INSERT INTO crm_private.ga4_attribution(company_id,lead_id,client_id,session_id) VALUES(company,lead,'123456.789012','789012');
 UPDATE public.leads SET stage='contacted' WHERE id=lead;
 IF EXISTS(SELECT 1 FROM crm_private.ga4_outbox WHERE lead_id=lead) THEN RAISE EXCEPTION 'Premature conversion'; END IF;
 UPDATE public.leads SET stage='meeting' WHERE id IN (lead,untracked);
 IF (SELECT count(*) FROM crm_private.ga4_outbox WHERE lead_id=lead)<>1 THEN RAISE EXCEPTION 'Missing meeting conversion'; END IF;
 IF EXISTS(SELECT 1 FROM crm_private.ga4_outbox WHERE lead_id=untracked) THEN RAISE EXCEPTION 'Invented visitor attribution'; END IF;
 UPDATE public.leads SET stage='new' WHERE id=lead;
 UPDATE public.leads SET stage='meeting' WHERE id=lead;
 IF (SELECT count(*) FROM crm_private.ga4_outbox WHERE lead_id=lead)<>1 THEN RAISE EXCEPTION 'Duplicate meeting'; END IF;
 SELECT * INTO event FROM crm_private.ga4_outbox WHERE lead_id=lead;
 payload:=crm_private.ga4_meeting_payload(event);
 IF payload->>'client_id'<>'123456.789012' OR payload->'events'->0->>'name'<>'meeting_booked' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
 IF payload::text LIKE '%rollback%' OR payload::text LIKE '%'||lead::text||'%' THEN RAISE EXCEPTION 'CRM data leaked'; END IF;
 IF has_table_privilege('authenticated','crm_private.ga4_attribution','SELECT') OR has_table_privilege('anon','crm_private.ga4_outbox','SELECT') THEN RAISE EXCEPTION 'Attribution is exposed'; END IF;
 IF has_function_privilege('authenticated','public.record_ga4_attribution(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('anon','crm_private.dispatch_ga4_meetings()','EXECUTE') THEN RAISE EXCEPTION 'Privileged RPC exposed'; END IF;
END $$;
ROLLBACK;
