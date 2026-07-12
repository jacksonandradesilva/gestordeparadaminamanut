create table if not exists public.app_state (
  id text primary key,
  equipamentos jsonb not null default '[]'::jsonb,
  historico_paradas jsonb not null default '[]'::jsonb,
  relatorio_turnos_notas jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state
  add column if not exists relatorio_turnos_notas jsonb not null default '{}'::jsonb;

alter table public.app_state enable row level security;

drop policy if exists "Allow anon read app_state" on public.app_state;
create policy "Allow anon read app_state"
  on public.app_state
  for select
  to anon
  using (true);

drop policy if exists "Allow anon write app_state" on public.app_state;
create policy "Allow anon write app_state"
  on public.app_state
  for all
  to anon
  using (true)
  with check (true);
