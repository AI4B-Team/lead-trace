DO $$
DECLARE
  v_email    text := 'mdazmainzim@gmail.com';
  v_amount   integer := 5000000;
  v_user_id  uuid;
  v_ws_id    uuid;
  v_kind     text;
  v_prev     integer;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'dev_seed: no auth user for %, skipping', v_email;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'super_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RAISE NOTICE 'dev_seed: granted super_admin to %', v_email;
  END IF;

  SELECT workspace_id INTO v_ws_id
  FROM public.workspace_members
  WHERE user_id = v_user_id
  ORDER BY (role = 'owner') DESC, workspace_id
  LIMIT 1;

  IF v_ws_id IS NULL THEN
    RAISE NOTICE 'dev_seed: user % has no workspace, skipping credit seed', v_email;
    RETURN;
  END IF;

  FOREACH v_kind IN ARRAY ARRAY['scrape','skip_trace','sms'] LOOP
    SELECT balance INTO v_prev FROM public.credit_balances
    WHERE workspace_id = v_ws_id AND kind = v_kind;

    INSERT INTO public.credit_balances (workspace_id, kind, balance, updated_at)
    VALUES (v_ws_id, v_kind, v_amount, now())
    ON CONFLICT (workspace_id, kind)
    DO UPDATE SET balance = v_amount, updated_at = now();

    IF COALESCE(v_prev, 0) < v_amount THEN
      INSERT INTO public.credit_ledger (workspace_id, kind, delta, reason, actor_user_id)
      VALUES (v_ws_id, v_kind, v_amount - COALESCE(v_prev, 0), 'dev_seed', v_user_id);
    END IF;
  END LOOP;

  RAISE NOTICE 'dev_seed: seeded workspace % to % credits per kind', v_ws_id, v_amount;
END $$;