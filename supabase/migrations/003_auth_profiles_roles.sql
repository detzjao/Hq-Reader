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
