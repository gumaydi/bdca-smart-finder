-- Migration: Add seat_layouts table for permanent seat configuration
-- Non-destructive and idempotent migration for graduation parents/guardians seating

-- 1. Create seat_layouts table
create table if not exists seat_layouts (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  version integer not null default 1,
  name text not null default 'Konfigurasi Utama',
  depan integer not null check (depan >= 1 and depan <= 100),
  belakang integer not null check (belakang >= 1 and belakang <= 100),
  widths jsonb not null default '{"depan": [8, 8, 8, 8, 8, 8, 4], "belakang": [8, 8, 8, 8, 8, 8, 4]}'::jsonb,
  orientation text not null default 'right_to_left',
  target_seats integer not null default 1318,
  total_capacity integer not null check (total_capacity >= 0),
  pair_capacity integer not null check (pair_capacity >= 0),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Ensure only one active layout at any time
create unique index if not exists seat_layouts_active_idx on seat_layouts (is_active) where is_active = true;

-- 3. Automatic updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_seat_layouts_updated_at on seat_layouts;
create trigger update_seat_layouts_updated_at
before update on seat_layouts
for each row
execute function update_updated_at_column();

-- 4. Enable Supabase Realtime for seat_layouts
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seat_layouts'
  ) then
    alter publication supabase_realtime add table seat_layouts;
  end if;
end $$;

-- 5. Row Level Security (RLS)
alter table seat_layouts enable row level security;

-- Public read access: panitia, admin, and visitors can read active seat layout
drop policy if exists "Allow public read active seat layout" on seat_layouts;
create policy "Allow public read active seat layout"
on seat_layouts
for select
to anon, authenticated
using (true);

-- Mutations (INSERT, UPDATE) are intentionally restricted to service_role (server backend)
-- No INSERT/UPDATE policy for anon ensures direct client-side mutation is blocked by Postgres.
revoke all on seat_layouts from anon, authenticated;
grant select on seat_layouts to anon, authenticated;
grant select, insert, update on table seat_layouts to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 6. Insert initial default configuration if no active configuration exists
insert into seat_layouts (
  is_active,
  version,
  name,
  depan,
  belakang,
  widths,
  orientation,
  target_seats,
  total_capacity,
  pair_capacity
)
values (
  true,
  1,
  'Konfigurasi Standar Wisuda',
  18,
  8,
  '{"depan": [8, 8, 8, 8, 8, 8, 4], "belakang": [8, 8, 8, 8, 8, 8, 4]}'::jsonb,
  'right_to_left',
  1318,
  1352,
  676
)
on conflict do nothing;
