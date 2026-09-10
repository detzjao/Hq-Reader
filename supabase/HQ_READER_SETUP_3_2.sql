-- HQ Reader 3.2.0 - setup completo
-- Execute no SQL Editor do mesmo projeto Supabase.

-- ============================================================
-- supabase/migrations/001_initial_schema.sql
-- ============================================================
-- HQ Reader 2.4.2 - schema completo para catálogo, sincronização e leitura.
create extension if not exists pgcrypto;

create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  publisher text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comics (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  drive_file_id text,
  title text not null,
  name text,
  normalized_title text,
  series_id uuid references public.series(id) on delete set null,
  category text,
  publisher text,
  format text,
  mime_type text,
  file_url text,
  source_type text not null default 'drive',
  source_url text,
  resource_key text,
  source_folder_id text,
  blob_url text,
  download_url text,
  thumbnail_url text,
  folder_path text not null default '',
  page_count integer not null default 0,
  file_size bigint not null default 0,
  added_at timestamptz,
  synced_at timestamptz,
  deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists comics_external_id_uidx on public.comics(external_id);
create index if not exists comics_category_idx on public.comics(category) where deleted = false;
create index if not exists comics_source_folder_idx on public.comics(source_folder_id) where deleted = false;
create index if not exists comics_title_idx on public.comics(normalized_title) where deleted = false;

create table if not exists public.drive_sources (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  folder_id text,
  name text,
  label text,
  url text,
  category text,
  path text,
  resource_key text,
  enabled boolean not null default true,
  status text not null default 'pending',
  last_sync timestamptz,
  deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists drive_sources_external_id_uidx on public.drive_sources(external_id);

create table if not exists public.source_sync_status (
  source_external_id text primary key,
  ok boolean not null default true,
  complete boolean not null default false,
  files integer not null default 0,
  folders integer not null default 0,
  failed_folders integer not null default 0,
  formats jsonb not null default '{}'::jsonb,
  error text,
  synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  source_external_id text references public.drive_sources(external_id) on delete cascade,
  status text not null default 'pending',
  continuation jsonb,
  total_files integer not null default 0,
  processed_files integer not null default 0,
  found_comics integer not null default 0,
  errors integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_user_state (
  profile_key text primary key,
  payload jsonb not null default '{"version":1,"favorites":{},"reading":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  comic_id uuid references public.comics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, comic_id)
);

create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  comic_id uuid references public.comics(id) on delete cascade,
  current_page integer not null default 1,
  percentage numeric not null default 0,
  finished boolean not null default false,
  started_at timestamptz,
  last_opened timestamptz not null default now(),
  unique(user_id, comic_id)
);

create table if not exists public.comic_pages (
  id uuid primary key default gen_random_uuid(),
  comic_external_id text not null,
  page_number integer not null,
  storage_path text,
  image_url text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(comic_external_id, page_number)
);
create index if not exists comic_pages_comic_idx on public.comic_pages(comic_external_id, page_number);

create table if not exists public.archive_cache (
  comic_external_id text primary key,
  format text,
  status text not null default 'pending',
  page_count integer not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

-- Catálogo e páginas podem ser lidos anonimamente. Escritas ficam restritas ao
-- backend com SERVICE_ROLE, que ignora RLS. Favoritos/progresso atuais passam
-- pela API do HQ Reader e são guardados em shared_user_state.
alter table public.comics enable row level security;
alter table public.drive_sources enable row level security;
alter table public.source_sync_status enable row level security;
alter table public.comic_pages enable row level security;
alter table public.archive_cache enable row level security;
alter table public.shared_user_state enable row level security;
alter table public.series enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_progress enable row level security;

drop policy if exists "hq_reader_public_comics_read" on public.comics;
create policy "hq_reader_public_comics_read" on public.comics for select to anon, authenticated using (deleted = false);
drop policy if exists "hq_reader_public_sources_read" on public.drive_sources;
create policy "hq_reader_public_sources_read" on public.drive_sources for select to anon, authenticated using (deleted = false and enabled = true);
drop policy if exists "hq_reader_public_status_read" on public.source_sync_status;
create policy "hq_reader_public_status_read" on public.source_sync_status for select to anon, authenticated using (true);
drop policy if exists "hq_reader_public_pages_read" on public.comic_pages;
create policy "hq_reader_public_pages_read" on public.comic_pages for select to anon, authenticated using (true);
drop policy if exists "hq_reader_public_archive_cache_read" on public.archive_cache;
create policy "hq_reader_public_archive_cache_read" on public.archive_cache for select to anon, authenticated using (true);
drop policy if exists "hq_reader_shared_state_read" on public.shared_user_state;
create policy "hq_reader_shared_state_read" on public.shared_user_state for select to anon, authenticated using (profile_key = 'default');
drop policy if exists "hq_reader_series_read" on public.series;
create policy "hq_reader_series_read" on public.series for select to anon, authenticated using (true);

grant select on public.comics, public.drive_sources, public.source_sync_status, public.comic_pages, public.archive_cache, public.shared_user_state, public.series to anon, authenticated;
grant all on public.comics, public.drive_sources, public.source_sync_status, public.comic_pages, public.archive_cache, public.shared_user_state, public.series, public.sync_jobs, public.favorites, public.reading_progress, public.app_meta to service_role;

-- Cache das páginas de CBZ/CBR. O bucket é público apenas para leitura das
-- imagens; uploads e remoções são feitos pelo backend com SERVICE_ROLE.
insert into storage.buckets (id, name, public)
values ('comic-pages', 'comic-pages', true)
on conflict (id) do update set public = true;

drop policy if exists "hq_reader_public_archive_objects" on storage.objects;
create policy "hq_reader_public_archive_objects"
on storage.objects for select to anon, authenticated
using (bucket_id = 'comic-pages');

-- ============================================================
-- supabase/migrations/002_upgrade_from_2_4_0.sql
-- ============================================================
-- Compatibilidade caso a migration simples da 2.4.0/2.4.1 já tenha sido rodada.
create extension if not exists pgcrypto;

alter table if exists public.comics add column if not exists external_id text;
alter table if exists public.comics add column if not exists name text;
alter table if exists public.comics add column if not exists mime_type text;
alter table if exists public.comics add column if not exists source_type text default 'drive';
alter table if exists public.comics add column if not exists source_url text;
alter table if exists public.comics add column if not exists resource_key text;
alter table if exists public.comics add column if not exists source_folder_id text;
alter table if exists public.comics add column if not exists blob_url text;
alter table if exists public.comics add column if not exists download_url text;
alter table if exists public.comics add column if not exists thumbnail_url text;
alter table if exists public.comics add column if not exists added_at timestamptz;
alter table if exists public.comics add column if not exists synced_at timestamptz;
alter table if exists public.comics add column if not exists deleted boolean default false;
alter table if exists public.comics add column if not exists metadata jsonb default '{}'::jsonb;
update public.comics set external_id = coalesce(external_id, drive_file_id, id::text) where external_id is null;
update public.comics set name = coalesce(name, title) where name is null;
create unique index if not exists comics_external_id_uidx on public.comics(external_id);

alter table if exists public.drive_sources add column if not exists external_id text;
alter table if exists public.drive_sources add column if not exists label text;
alter table if exists public.drive_sources add column if not exists path text;
alter table if exists public.drive_sources add column if not exists resource_key text;
alter table if exists public.drive_sources add column if not exists deleted boolean default false;
alter table if exists public.drive_sources add column if not exists metadata jsonb default '{}'::jsonb;
alter table if exists public.drive_sources add column if not exists updated_at timestamptz default now();
update public.drive_sources set external_id = coalesce(external_id, folder_id, id::text) where external_id is null;
create unique index if not exists drive_sources_external_id_uidx on public.drive_sources(external_id);

create table if not exists public.source_sync_status (
  source_external_id text primary key,
  ok boolean not null default true,
  complete boolean not null default false,
  files integer not null default 0,
  folders integer not null default 0,
  failed_folders integer not null default 0,
  formats jsonb not null default '{}'::jsonb,
  error text,
  synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.shared_user_state (
  profile_key text primary key,
  payload jsonb not null default '{"version":1,"favorites":{},"reading":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table if exists public.comic_pages add column if not exists comic_external_id text;
alter table if exists public.comic_pages add column if not exists storage_path text;
alter table if exists public.comic_pages add column if not exists mime_type text;
alter table if exists public.comic_pages add column if not exists size_bytes bigint default 0;
create unique index if not exists comic_pages_external_page_uidx on public.comic_pages(comic_external_id, page_number);

create table if not exists public.archive_cache (
  comic_external_id text primary key,
  format text,
  status text not null default 'pending',
  page_count integer not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('comic-pages', 'comic-pages', true)
on conflict (id) do update set public = true;

alter table public.comics enable row level security;
alter table public.drive_sources enable row level security;
alter table public.source_sync_status enable row level security;
alter table public.comic_pages enable row level security;
alter table public.archive_cache enable row level security;
alter table public.shared_user_state enable row level security;

drop policy if exists "hq_reader_public_comics_read" on public.comics;
create policy "hq_reader_public_comics_read" on public.comics for select to anon, authenticated using (coalesce(deleted, false) = false);
drop policy if exists "hq_reader_public_sources_read" on public.drive_sources;
create policy "hq_reader_public_sources_read" on public.drive_sources for select to anon, authenticated using (coalesce(deleted, false) = false and coalesce(enabled, true) = true);
drop policy if exists "hq_reader_public_status_read" on public.source_sync_status;
create policy "hq_reader_public_status_read" on public.source_sync_status for select to anon, authenticated using (true);
drop policy if exists "hq_reader_public_pages_read" on public.comic_pages;
create policy "hq_reader_public_pages_read" on public.comic_pages for select to anon, authenticated using (true);
drop policy if exists "hq_reader_public_archive_cache_read" on public.archive_cache;
create policy "hq_reader_public_archive_cache_read" on public.archive_cache for select to anon, authenticated using (true);
drop policy if exists "hq_reader_shared_state_read" on public.shared_user_state;
create policy "hq_reader_shared_state_read" on public.shared_user_state for select to anon, authenticated using (profile_key = 'default');

drop policy if exists "hq_reader_public_archive_objects" on storage.objects;
create policy "hq_reader_public_archive_objects" on storage.objects for select to anon, authenticated using (bucket_id = 'comic-pages');

-- ============================================================
-- supabase/migrations/003_auth_profiles_roles.sql
-- ============================================================
-- HQ Reader 3.1.0
-- Login, perfis e separação de papéis admin/user.
-- Execute DEPOIS das migrations 001 e 002.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(lower(email));

create or replace function public.handle_hq_reader_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'usuario'), '@', 1)),
    'user',
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_hq_reader_auth_user_created on auth.users;
create trigger on_hq_reader_auth_user_created
after insert or update on auth.users
for each row execute procedure public.handle_hq_reader_new_user();

-- Cria profiles para usuários que já existiam antes da migration.
insert into public.profiles (id, email, display_name, role, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, 'usuario'), '@', 1)),
  'user',
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
  updated_at = now();

alter table public.profiles enable row level security;

drop policy if exists "hq_reader_profile_self_read" on public.profiles;
create policy "hq_reader_profile_self_read"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- O navegador só precisa ler o próprio perfil. Criação/alteração de papéis é
-- feita pelo trigger ou pelo backend com SUPABASE_SECRET_KEY/service_role.
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- O estado de leitura continua sendo escrito exclusivamente pelo backend,
-- agora usando profile_key = auth.users.id em vez do antigo "default" global.
grant all on public.shared_user_state to service_role;

-- IMPORTANTE: depois de criar sua própria conta pelo formulário de login,
-- transforme-a em administradora UMA VEZ no SQL Editor:
--
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where email = 'SEU_EMAIL@EXEMPLO.COM';

-- ============================================================
-- supabase/migrations/004_admin_profiles_v3_2.sql
-- ============================================================
-- HQ Reader 3.2.0 - políticas de perfil/admin sem depender da service_role para leitura.

create or replace function public.hq_is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role = 'admin'
  );
$$;

revoke all on function public.hq_is_admin(uuid) from public;
grant execute on function public.hq_is_admin(uuid) to authenticated;

drop policy if exists "hq_reader_profile_self_read" on public.profiles;
drop policy if exists "hq_reader_profiles_read" on public.profiles;
create policy "hq_reader_profiles_read"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.hq_is_admin(auth.uid()));

create or replace function public.hq_admin_set_profile_role(target_user_id uuid, new_role text)
returns table(id uuid, email text, display_name text, role text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hq_is_admin(auth.uid()) then
    raise exception 'ADMIN_UNAUTHORIZED' using errcode = '42501';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  update public.profiles p
  set role = new_role, updated_at = now()
  where p.id = target_user_id;

  return query
  select p.id, p.email, p.display_name, p.role, p.created_at, p.updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

revoke all on function public.hq_admin_set_profile_role(uuid,text) from public;
grant execute on function public.hq_admin_set_profile_role(uuid,text) to authenticated;

grant select on public.profiles to authenticated;

-- ============================================================
-- supabase/migrations/005_user_state_rls_v3_2.sql
-- ============================================================
-- HQ Reader 3.2.0 - estado de leitura/favoritos por usuário sem depender de service_role.

alter table public.shared_user_state enable row level security;

drop policy if exists "hq_reader_shared_state_read" on public.shared_user_state;
drop policy if exists "hq_reader_user_state_select" on public.shared_user_state;
drop policy if exists "hq_reader_user_state_insert" on public.shared_user_state;
drop policy if exists "hq_reader_user_state_update" on public.shared_user_state;

create policy "hq_reader_user_state_select"
on public.shared_user_state for select to authenticated
using (profile_key = auth.uid()::text);

create policy "hq_reader_user_state_insert"
on public.shared_user_state for insert to authenticated
with check (profile_key = auth.uid()::text);

create policy "hq_reader_user_state_update"
on public.shared_user_state for update to authenticated
using (profile_key = auth.uid()::text)
with check (profile_key = auth.uid()::text);

grant select, insert, update on public.shared_user_state to authenticated;
