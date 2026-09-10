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
