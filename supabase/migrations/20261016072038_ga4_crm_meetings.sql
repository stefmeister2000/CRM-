-- Additive only. No historical meetings are backfilled and delivery is disabled
-- until a company is explicitly configured with a Measurement Protocol secret.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE crm_private.ga4_connections (
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 measurement_id text NOT NULL CHECK (measurement_id ~ '^G-[A-Z0-9]+$'),
 secret_name text NOT NULL,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE crm_private.ga4_attribution (
 company_id uuid NOT NULL,
 lead_id uuid NOT NULL,
 client_id text NOT NULL CHECK (client_id ~ '^[0-9]{1,20}\.[0-9]{1,20}$'),
 session_id text CHECK (session_id ~ '^[0-9]{1,20}$'),
 captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,lead_id),
 FOREIGN KEY(company_id,lead_id) REFERENCES public.leads(company_id,id) ON DELETE CASCADE
);
CREATE TABLE crm_private.ga4_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 lead_id uuid NOT NULL,
 event_name text NOT NULL CHECK(event_name='meeting_booked'),
 client_id text NOT NULL,
 session_id text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','failed','uncertain','expired')),
 attempts int NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 http_status int,
 last_error text,
 submitted_at timestamptz,
 UNIQUE(company_id,lead_id,event_name),
 FOREIGN KEY(company_id,lead_id) REFERENCES public.leads(company_id,id) ON DELETE CASCADE
);
ALTER TABLE crm_private.ga4_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_private.ga4_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_private.ga4_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_private.ga4_connections, crm_private.ga4_attribution, crm_private.ga4_outbox FROM PUBLIC,anon,authenticated;
CREATE INDEX ga4_outbox_pending ON crm_private.ga4_outbox(next_attempt_at) WHERE status='pending';

-- Only the authenticated server intake may attach browser attribution. The
-- company is resolved from its server-only inbound token, never from the form.
CREATE FUNCTION crm_private.record_ga4_attribution(_company uuid,_lead uuid,_client text,_session text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL OR current_setting('role',true) NOT IN ('service_role','postgres') THEN
  RAISE EXCEPTION 'Server intake only';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE company_id=_company AND id=_lead AND source='website') THEN
  RAISE EXCEPTION 'Website lead not found in company';
 END IF;
 INSERT INTO crm_private.ga4_attribution(company_id,lead_id,client_id,session_id)
 VALUES(_company,_lead,_client,_session)
 ON CONFLICT(company_id,lead_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION crm_private.record_ga4_attribution(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION crm_private.record_ga4_attribution(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.record_ga4_attribution(_company uuid,_lead uuid,_client text,_session text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT crm_private.record_ga4_attribution(_company,_lead,_client,_session)
$$;
REVOKE ALL ON FUNCTION public.record_ga4_attribution(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ga4_attribution(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION crm_private.queue_ga4_meeting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- The underlying update is protected by lead RLS. Also check membership here.
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE company_id=NEW.company_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Company membership required';
 END IF;
 IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('service_role','postgres','none') THEN
  RAISE EXCEPTION 'Authenticated lead update required';
 END IF;
 IF NEW.stage='meeting' AND OLD.stage IS DISTINCT FROM NEW.stage AND NEW.deleted_at IS NULL THEN
  INSERT INTO crm_private.ga4_outbox(company_id,lead_id,event_name,client_id,session_id)
  SELECT a.company_id,a.lead_id,'meeting_booked',a.client_id,
   CASE WHEN a.captured_at > now()-interval '24 hours' THEN a.session_id END
  FROM crm_private.ga4_attribution a
  JOIN crm_private.ga4_connections c USING(company_id)
  WHERE a.company_id=NEW.company_id AND a.lead_id=NEW.id
  ON CONFLICT(company_id,lead_id,event_name) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION crm_private.queue_ga4_meeting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ga4_meeting AFTER UPDATE OF stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION crm_private.queue_ga4_meeting();

-- Pure payload builder makes the exact allowlist independently testable.
CREATE FUNCTION crm_private.ga4_meeting_payload(_event crm_private.ga4_outbox)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'client_id',_event.client_id,
  'timestamp_micros',floor(extract(epoch FROM _event.occurred_at)*1000000)::bigint,
  'consent',jsonb_build_object('ad_user_data','DENIED','ad_personalization','DENIED'),
  'events',jsonb_build_array(jsonb_build_object('name','meeting_booked','params',
   jsonb_strip_nulls(jsonb_build_object('method','sales_crm','session_id',_event.session_id,'engagement_time_msec',1))))
 )
$$;
REVOKE ALL ON FUNCTION crm_private.ga4_meeting_payload(crm_private.ga4_outbox) FROM PUBLIC,anon,authenticated;

-- Invoker-only cron worker: no browser/server RPC can invoke it or read secrets.
-- HTTP runs outside the lead-update transaction; no requests are stored in pg_net.
CREATE FUNCTION crm_private.dispatch_ga4_meetings() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e crm_private.ga4_outbox; cfg crm_private.ga4_connections; secret text; code int;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('crm-ga4-meetings')) THEN RETURN; END IF;
 UPDATE crm_private.ga4_outbox SET status='expired',last_error='Older than Measurement Protocol 72-hour window'
 WHERE status='pending' AND occurred_at < now()-interval '71 hours';
 PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','5000');
 PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','2000');
 FOR e IN SELECT o.* FROM crm_private.ga4_outbox o JOIN crm_private.ga4_connections c USING(company_id)
  WHERE o.status='pending' AND o.next_attempt_at<=now() AND c.enabled
  ORDER BY o.occurred_at LIMIT 5 FOR UPDATE OF o SKIP LOCKED
 LOOP
  SELECT * INTO cfg FROM crm_private.ga4_connections WHERE company_id=e.company_id;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name=cfg.secret_name;
  IF secret IS NULL OR secret !~ '^[A-Za-z0-9_-]+$' THEN
   UPDATE crm_private.ga4_outbox SET last_error='Missing or invalid API secret',next_attempt_at=now()+interval '10 minutes' WHERE id=e.id;
   CONTINUE;
  END IF;
  BEGIN
   SELECT status INTO code FROM extensions.http_post(
    'https://region1.google-analytics.com/mp/collect?measurement_id='||cfg.measurement_id||'&api_secret='||secret,
    crm_private.ga4_meeting_payload(e)::text,'application/json');
   UPDATE crm_private.ga4_outbox SET attempts=attempts+1,http_status=code,
    status=CASE WHEN code BETWEEN 200 AND 299 THEN 'submitted'
      WHEN (code=429 OR code>=500) AND attempts<4 THEN 'pending' ELSE 'failed' END,
    submitted_at=CASE WHEN code BETWEEN 200 AND 299 THEN now() END,
    last_error=CASE WHEN code BETWEEN 200 AND 299 THEN NULL ELSE 'Google HTTP '||code::text END,
    next_attempt_at=now()+interval '5 minutes' WHERE id=e.id;
  EXCEPTION WHEN OTHERS THEN
   -- A network timeout may have reached Google. Don't silently duplicate it.
   -- Never log SQLERRM: an extension error could contain the secret URL.
   UPDATE crm_private.ga4_outbox SET attempts=attempts+1,status='uncertain',last_error='Network outcome unknown; manual review required' WHERE id=e.id;
  END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION crm_private.dispatch_ga4_meetings() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('crm-ga4-meetings','* * * * *','SELECT crm_private.dispatch_ga4_meetings()');
