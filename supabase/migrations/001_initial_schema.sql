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
