-- 1) Hub identity link can never be claimed twice
CREATE UNIQUE INDEX IF NOT EXISTS user_prefs_real_elite_user_id_key
  ON public.user_prefs (real_elite_user_id)
  WHERE real_elite_user_id IS NOT NULL;

-- 2) Members no longer see the full roster / roles of a workspace
DROP POLICY IF EXISTS "read own memberships" ON public.workspace_members;
CREATE POLICY "read own memberships" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_workspace_admin(workspace_id));