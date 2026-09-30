-- Run in the NEW project's SQL editor after the CRM owner signs up.
-- Replace the placeholder with the owner's exact UUID from Authentication > Users.
-- Never expose this script as a public endpoint or callable browser function.
BEGIN;
DO $$
DECLARE
  owner_uuid uuid := 'REPLACE_WITH_OWNER_USER_UUID';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_uuid) THEN
    RAISE EXCEPTION 'The owner must sign up in this project first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'An administrator already exists; bootstrap stopped';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (owner_uuid, 'admin');
  UPDATE public.account_requests
    SET status = 'approved', decided_by = owner_uuid, decided_at = now()
    WHERE user_id = owner_uuid;
END;
$$;
COMMIT;
