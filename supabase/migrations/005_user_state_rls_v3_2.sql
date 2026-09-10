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
