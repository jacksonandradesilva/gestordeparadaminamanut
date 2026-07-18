create table if not exists public.app_state (
  id text primary key,
  owner_id uuid,
  equipamentos jsonb not null default '[]'::jsonb,
  historico_paradas jsonb not null default '[]'::jsonb,
  relatorio_turnos_notas jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state
  add column if not exists owner_id uuid;

alter table public.app_state
  add column if not exists relatorio_turnos_notas jsonb not null default '{}'::jsonb;

alter table public.app_state
  alter column owner_id drop not null;

alter table public.app_state
  drop constraint if exists app_state_owner_id_fkey;

alter table public.app_state
  add constraint app_state_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

drop index if exists app_state_owner_id_key;

insert into public.app_state (id, owner_id, equipamentos, historico_paradas, relatorio_turnos_notas)
select 'global', owner_id, equipamentos, historico_paradas, relatorio_turnos_notas
from public.app_state
where id <> 'global'
order by updated_at desc
limit 1
on conflict (id) do nothing;

delete from public.app_state
where id <> 'global';

alter table public.app_state enable row level security;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  allowed_pages jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_access
  add column if not exists email text;

alter table public.user_access
  add column if not exists status text not null default 'pending';

alter table public.user_access
  add column if not exists allowed_pages jsonb not null default '[]'::jsonb;

alter table public.user_access
  add column if not exists approved_at timestamptz;

alter table public.user_access
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.user_access
  add column if not exists created_at timestamptz not null default now();

alter table public.user_access
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_access
  drop constraint if exists user_access_status_check;

alter table public.user_access
  add constraint user_access_status_check
  check (status in ('pending', 'approved'));

alter table public.user_access
  drop constraint if exists user_access_allowed_pages_is_array;

alter table public.user_access
  add constraint user_access_allowed_pages_is_array
  check (jsonb_typeof(allowed_pages) = 'array');

update public.user_access
set
  allowed_pages = '["dashboard", "historico", "relatorio-turnos", "historico-opcoes", "dashboard-turnos", "agente-ia"]'::jsonb,
  updated_at = now()
where status = 'approved'
  and (
    allowed_pages is null
    or jsonb_typeof(allowed_pages) <> 'array'
    or jsonb_array_length(allowed_pages) = 0
  );

drop policy if exists "Allow anon read app_state" on public.app_state;
drop policy if exists "Allow anon write app_state" on public.app_state;
drop policy if exists "Allow owner read app_state" on public.app_state;
drop policy if exists "Allow owner write app_state" on public.app_state;

create policy "Allow owner read app_state"
  on public.app_state
  for select
  to authenticated
  using (true);

create policy "Allow owner write app_state"
  on public.app_state
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.admin_users enable row level security;

alter table public.user_access enable row level security;

drop policy if exists "Allow user read own admin flag" on public.admin_users;
drop policy if exists "Allow user create own access request" on public.user_access;
drop policy if exists "Allow user read own access status" on public.user_access;
drop policy if exists "Allow admin read all access records" on public.user_access;
drop policy if exists "Allow admin update access records" on public.user_access;
drop policy if exists "Allow admin insert access records" on public.user_access;
drop policy if exists "Allow admin delete access records" on public.user_access;

create policy "Allow user read own admin flag"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Allow user create own access request"
  on public.user_access
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and allowed_pages = '[]'::jsonb
    and approved_at is null
    and approved_by is null
  );

create policy "Allow user read own access status"
  on public.user_access
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Allow admin read all access records"
  on public.user_access
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create policy "Allow admin update access records"
  on public.user_access
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create policy "Allow admin insert access records"
  on public.user_access
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create policy "Allow admin delete access records"
  on public.user_access
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

alter table public.audit_logs enable row level security;

drop policy if exists "Allow user insert own audit logs" on public.audit_logs;
drop policy if exists "Allow admin read audit logs" on public.audit_logs;
drop policy if exists "Allow admin delete audit logs" on public.audit_logs;

create policy "Allow user insert own audit logs"
  on public.audit_logs
  for insert
  to authenticated
  with check (auth.uid() = actor_id);

create policy "Allow admin read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create policy "Allow admin delete audit logs"
  on public.audit_logs
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );
