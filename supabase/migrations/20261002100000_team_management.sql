-- Apply to the existing CRM database. No users, leads or history are deleted.
BEGIN;

CREATE OR REPLACE FUNCTION public.configure_crm_invitation(
  _user_id uuid, _full_name text, _team text, _role public.app_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite_email text;
BEGIN
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen beheerders kunnen uitnodigingen maken.';
  END IF;
  SELECT email INTO invite_email FROM auth.users
    WHERE id = _user_id AND email_confirmed_at IS NULL;
  IF invite_email IS NULL THEN
    RAISE EXCEPTION 'Dit account bestaat al. Beheer de toegang via het teamoverzicht.';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, team)
    VALUES (_user_id, invite_email, _full_name, NULLIF(_team, ''))
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, team = EXCLUDED.team;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
  UPDATE public.account_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now()
    WHERE user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_crm_member(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE member_email text; member_name text;
BEGIN
  -- Serialize removals so two administrators cannot remove each other's access.
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen beheerders kunnen gebruikers verwijderen.';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Je kunt jezelf niet verwijderen.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'Deze persoon heeft geen CRM-toegang meer.';
  END IF;
  SELECT email, full_name INTO member_email, member_name FROM public.profiles WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  UPDATE public.leads SET owner_id = NULL WHERE owner_id = _user_id;
  -- Retain identity, documents and history. RLS denies CRM data even to existing sessions.
  -- Retain a declined request so signing in does not silently request access again.
  INSERT INTO public.account_requests (user_id, email, full_name, status, decided_by, decided_at)
    VALUES (_user_id, COALESCE(member_email, ''), member_name, 'declined', auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET status = 'declined', decided_by = auth.uid(), decided_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.configure_crm_invitation(uuid, text, text, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_crm_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_crm_invitation(uuid, text, text, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_crm_member(uuid) TO authenticated;
COMMIT;
