drop policy if exists "surplus_sources_read" on public.surplus_sources;
create policy "surplus_sources_admin_read" on public.surplus_sources
  for select to authenticated
  using (private.has_role(auth.uid(), 'super_admin'::app_role));

drop policy if exists "surplus_statutes_read" on public.surplus_statutes;
create policy "surplus_statutes_admin_read" on public.surplus_statutes
  for select to authenticated
  using (private.has_role(auth.uid(), 'super_admin'::app_role));