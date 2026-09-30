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