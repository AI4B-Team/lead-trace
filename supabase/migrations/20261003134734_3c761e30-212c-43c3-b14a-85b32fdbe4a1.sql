DROP POLICY IF EXISTS "ws invites admin insert" ON public.workspace_invites;
CREATE POLICY "ws invites admin insert" ON public.workspace_invites FOR INSERT TO authenticated
WITH CHECK (private.is_workspace_admin(workspace_id) AND (role <> 'owner' OR private.is_workspace_owner(workspace_id)));
DROP POLICY IF EXISTS "ws invites admin update" ON public.workspace_invites;
CREATE POLICY "ws invites admin update" ON public.workspace_invites FOR UPDATE TO authenticated
USING (private.is_workspace_admin(workspace_id) AND (role <> 'owner' OR private.is_workspace_owner(workspace_id)))
WITH CHECK (private.is_workspace_admin(workspace_id) AND (role <> 'owner' OR private.is_workspace_owner(workspace_id)));