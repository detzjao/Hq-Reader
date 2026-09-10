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
