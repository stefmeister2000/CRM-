BEGIN;
-- Remember accepted website submissions so retries cannot duplicate their history.
CREATE TABLE crm_private.website_submissions (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  submission_id uuid NOT NULL,
  response jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, submission_id)
);
ALTER TABLE crm_private.website_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_private.website_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON crm_private.website_submissions TO service_role;

-- Server-only, called after the HTTP route validates the company intake token.
-- Uses the caller's service role, with no additional privilege escalation.
CREATE FUNCTION public.ingest_website_contact(_company uuid, _submission_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  mail text := nullif(lower(btrim(_payload->>'email')), '');
  contact_phone text := nullif(btrim(_payload->>'phone'), '');
  person text := nullif(btrim(_payload->>'contactName'), '');
  note text := nullif(btrim(_payload->>'notes'), '');
  matched uuid;
  result jsonb;
  stamp timestamptz := now();
BEGIN
  IF _company IS NULL OR _submission_id IS NULL OR (mail IS NULL AND contact_phone IS NULL)
     OR length(mail)>200 OR length(contact_phone)>60 OR length(person)>200 OR length(note)>4000
     OR length(_payload->>'campaign')>200 THEN
    RAISE EXCEPTION 'Invalid website contact';
  END IF;
  -- Serialize duplicate submissions and matching contacts within this company.
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':submission:' || _submission_id::text, 0));
  SELECT response INTO result FROM crm_private.website_submissions
    WHERE company_id=_company AND submission_id=_submission_id;
  IF FOUND THEN RETURN result; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':contact:' || coalesce(mail, contact_phone), 0));
  IF mail IS NOT NULL THEN
    SELECT id INTO matched FROM public.leads WHERE company_id=_company AND lower(email)=mail ORDER BY created_at,id LIMIT 1;
  ELSE
    SELECT id INTO matched FROM public.leads WHERE company_id=_company AND public.leads.phone=contact_phone ORDER BY created_at,id LIMIT 1;
  END IF;
  IF matched IS NULL THEN
    INSERT INTO public.leads(company_id,company,contact_name,email,phone,source,stage,priority,campaign,last_touch_at,notes)
    VALUES(_company,coalesce(person,mail,contact_phone),person,mail,contact_phone,'website','new',3,coalesce(nullif(_payload->>'campaign',''),'Website inquiry'),stamp,note)
    RETURNING id INTO matched;
    result := jsonb_build_object('status','created','leadId',matched);
  ELSE
    UPDATE public.leads SET contact_name=coalesce(person,contact_name), email=coalesce(mail,email),
      phone=coalesce(nullif(btrim(_payload->>'phone'),''),public.leads.phone), last_touch_at=stamp, deleted_at=NULL,
      notes=CASE WHEN note IS NULL THEN notes ELSE concat_ws(E'\n\n',nullif(notes,''),note) END
      WHERE id=matched AND company_id=_company;
    result := jsonb_build_object('status','matched','leadId',matched);
  END IF;
  INSERT INTO public.activities(company_id,lead_id,channel,direction,body)
    VALUES(_company,matched,'note','inbound',coalesce(note,'Nieuwe aanvraag via website.'));
  INSERT INTO crm_private.website_submissions(company_id,submission_id,response) VALUES(_company,_submission_id,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ingest_website_contact(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_website_contact(uuid,uuid,jsonb) TO service_role;
COMMIT;
