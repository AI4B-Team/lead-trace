CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_workspace_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_workspace_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_workspace_owner(uuid) SET SCHEMA private;
ALTER FUNCTION public.workspace_role(uuid) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.workspace_role(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.workspace_role(uuid) TO authenticated, service_role;