-- Ejecutar una vez en Supabase SQL Editor.
alter table public.profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles enable row level security;

insert into public.profiles (id, email, first_name, last_name, city, country)
select
  users.id,
  users.email,
  users.raw_user_meta_data ->> 'first_name',
  users.raw_user_meta_data ->> 'last_name',
  users.raw_user_meta_data ->> 'city',
  users.raw_user_meta_data ->> 'country'
from auth.users users
on conflict (id) do update set
  email = excluded.email,
  first_name = coalesce(excluded.first_name, profiles.first_name),
  last_name = coalesce(excluded.last_name, profiles.last_name),
  city = coalesce(excluded.city, profiles.city),
  country = coalesce(excluded.country, profiles.country);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create or replace function public.is_profile_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create policy "Admins can read all profiles" on public.profiles
  for select using (public.is_profile_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, city, country)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'city',
    new.raw_user_meta_data ->> 'country'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();