-- ============================================================
--  Miss Thani — Tab Supabase yo
--  Kopi TOUT tèks sa a, kole l nan Supabase -> SQL Editor, klike RUN.
-- ============================================================

-- 1) Tab konfigirasyon an (yon sèl ranje ki kenbe tout reglaj admin yo)
create table if not exists app_config (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- 2) Tab prospè yo
create table if not exists prospects (
  id text primary key,
  program text,
  answers jsonb,
  updated_at timestamptz default now()
);

-- 3) Aktive sekirite (RLS)
alter table app_config enable row level security;
alter table prospects enable row level security;

-- 4) Politik aksè (app piblik la, san login Supabase)
drop policy if exists "config_select" on app_config;
drop policy if exists "config_insert" on app_config;
drop policy if exists "config_update" on app_config;
create policy "config_select" on app_config for select using (true);
create policy "config_insert" on app_config for insert with check (true);
create policy "config_update" on app_config for update using (true);

drop policy if exists "prospects_select" on prospects;
drop policy if exists "prospects_insert" on prospects;
drop policy if exists "prospects_delete" on prospects;
create policy "prospects_select" on prospects for select using (true);
create policy "prospects_insert" on prospects for insert with check (true);
create policy "prospects_delete" on prospects for delete using (true);
