create table if not exists public.marketplace_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  name text not null,
  category text not null,
  prompt text not null default '',
  criteria jsonb not null default '{}'::jsonb,
  sources text[] not null default '{}',
  location text,
  radius_miles integer,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_searches_workspace_idx
  on public.marketplace_searches (workspace_id, created_at desc);

grant select, insert, update, delete on public.marketplace_searches to authenticated;
grant all on public.marketplace_searches to service_role;

alter table public.marketplace_searches enable row level security;

create policy "Members read workspace marketplace searches"
  on public.marketplace_searches for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "Members create workspace marketplace searches"
  on public.marketplace_searches for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and created_by = auth.uid());

create policy "Members update workspace marketplace searches"
  on public.marketplace_searches for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy "Members delete workspace marketplace searches"
  on public.marketplace_searches for delete to authenticated
  using (private.is_workspace_member(workspace_id));