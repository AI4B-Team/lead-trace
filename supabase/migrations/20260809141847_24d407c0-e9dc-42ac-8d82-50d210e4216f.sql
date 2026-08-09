CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.webhook_endpoints(id) ON DELETE SET NULL,
  event_id uuid,
  event_type text NOT NULL,
  url text NOT NULL,
  status_code integer,
  ok boolean NOT NULL DEFAULT false,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace webhook deliveries"
  ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));

CREATE INDEX webhook_deliveries_ws_created_idx
  ON public.webhook_deliveries (workspace_id, created_at DESC);

CREATE TABLE public.api_rate_counters (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

GRANT ALL ON public.api_rate_counters TO service_role;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_api_rate(_bucket text, _window_seconds integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win timestamptz := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  _hits integer;
BEGIN
  INSERT INTO public.api_rate_counters AS c (bucket, window_start, hits)
  VALUES (_bucket, _win, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = c.hits + 1
  RETURNING c.hits INTO _hits;

  DELETE FROM public.api_rate_counters
  WHERE window_start < now() - interval '1 hour';

  RETURN _hits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_api_rate(text, integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_api_rate(text, integer) TO service_role;