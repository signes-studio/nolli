-- Ejecutar una vez en Supabase SQL Editor.
-- Configura el acceso a las obras públicas de NOLLI.

alter table public."Buildings" enable row level security;

create or replace function public.can_manage_buildings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'superadmin')
  );
$$;

drop policy if exists "Anyone can read published buildings" on public."Buildings";
create policy "Anyone can read published buildings" on public."Buildings"
  for select using (coalesce(estado_revision, 'publicada') = 'publicada');

drop policy if exists "Users can read own proposed buildings" on public."Buildings";
create policy "Users can read own proposed buildings" on public."Buildings"
  for select to authenticated
  using (propuesto_por = auth.uid());

drop policy if exists "Admins can read all buildings" on public."Buildings";
create policy "Admins can read all buildings" on public."Buildings"
  for select to authenticated
  using (public.can_manage_buildings());

drop policy if exists "Authenticated users can propose buildings" on public."Buildings";
create policy "Authenticated users can propose buildings" on public."Buildings"
  for insert to authenticated
  with check (
    (public.can_manage_buildings() and estado_revision = 'publicada')
    or (
      not public.can_manage_buildings()
      and estado_revision = 'pendiente'
      and propuesto_por = auth.uid()
    )
  );

drop policy if exists "Admins can update buildings" on public."Buildings";
create policy "Admins can update buildings" on public."Buildings"
  for update to authenticated
  using (public.can_manage_buildings())
  with check (public.can_manage_buildings());

drop policy if exists "Admins can delete buildings" on public."Buildings";
create policy "Admins can delete buildings" on public."Buildings"
  for delete to authenticated
  using (public.can_manage_buildings());