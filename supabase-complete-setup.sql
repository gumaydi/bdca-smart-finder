-- ==============================================================================
-- SETUP DATABASE LENGKAP: BDCA Smart Finder (Wisuda November 2026)
-- Target: Project Supabase Baru
-- Karakteristik: Idempotent, Non-destruktif, Server-Only Mutation, RLS Terproteksi
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNGSI UTILITAS: Timestamp otomatis
-- ------------------------------------------------------------------------------
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------------------
-- 2. TABEL: participants (Data Wisudawan & Kehadiran Orang Tua/Wali)
-- ------------------------------------------------------------------------------
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  nomor_urut integer not null unique,
  nama text not null,
  nim text unique,
  prodi text,
  is_vip boolean not null default false,
  seat_block integer,
  seat_row integer,
  seat_start integer,
  seat_end integer,
  seat_label text,
  status text not null default 'belum_hadir' check (status in ('belum_hadir', 'sudah_hadir')),
  checked_in_at timestamptz,
  status_vip text default null check (status_vip is null or status_vip in ('belum_hadir', 'sudah_hadir')),
  checked_in_vip_at timestamptz,
  vip_seat_label text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Penambahan kolom idempotent untuk tabel yang sudah ada sebelumnya
alter table participants add column if not exists status_vip text default null;
alter table participants add column if not exists checked_in_vip_at timestamptz default null;
alter table participants add column if not exists vip_seat_label text default null;

-- Validasi konsistensi status VIP: non-VIP tidak boleh memiliki status atau alokasi VIP
alter table participants drop constraint if exists chk_vip_attendance_consistency;
alter table participants add constraint chk_vip_attendance_consistency
check (
  (is_vip = false and status_vip is null and checked_in_vip_at is null and vip_seat_label is null)
  or
  (is_vip = true and status_vip in ('belum_hadir', 'sudah_hadir') and (checked_in_vip_at is null or status_vip = 'sudah_hadir'))
);

-- Indeks pencarian cepat untuk panitia
create index if not exists participants_nama_gin_idx on participants using gin (to_tsvector('simple', nama));
create index if not exists participants_nim_idx on participants (nim);
create index if not exists participants_prodi_idx on participants (prodi);
create index if not exists participants_status_idx on participants (status);
create index if not exists participants_status_vip_idx on participants (status_vip);
create index if not exists participants_is_vip_idx on participants (is_vip);
create index if not exists participants_nomor_urut_idx on participants (nomor_urut);

-- Trigger: Otomatisasi transisi status VIP oleh Admin
create or replace function handle_participant_vip_transition()
returns trigger as $$
begin
  if new.is_vip = true and old.is_vip = false then
    if new.status_vip is null then
      new.status_vip := 'belum_hadir';
    end if;
    if new.vip_seat_label is null then
      new.vip_seat_label := 'Area VIP Khusus';
    end if;
  elsif new.is_vip = false and old.is_vip = true then
    new.status_vip := null;
    new.checked_in_vip_at := null;
    new.vip_seat_label := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_participant_vip_transition on participants;
create trigger trg_participant_vip_transition
before update on participants
for each row
execute function handle_participant_vip_transition();

-- Trigger: updated_at otomatis pada participants
drop trigger if exists update_participants_updated_at on participants;
create trigger update_participants_updated_at
before update on participants
for each row
execute function update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 3. TABEL: seat_layouts (Konfigurasi Denah Kursi Permanen)
-- ------------------------------------------------------------------------------
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

-- Menjamin hanya satu konfigurasi aktif
create unique index if not exists seat_layouts_active_idx on seat_layouts (is_active) where is_active = true;

-- Trigger updated_at pada seat_layouts
drop trigger if exists update_seat_layouts_updated_at on seat_layouts;
create trigger update_seat_layouts_updated_at
before update on seat_layouts
for each row
execute function update_updated_at_column();

-- Konfigurasi bawaan jika tabel baru dibuat (18 depan, 8 belakang)
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

-- ------------------------------------------------------------------------------
-- 4. SUPABASE REALTIME: Publikasi Perubahan Realtime
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seat_layouts'
  ) then
    alter publication supabase_realtime add table seat_layouts;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 5. TRIGGER ANTI-TAMPER: Mencegah Perubahan Identitas
-- ------------------------------------------------------------------------------
create or replace function protect_participant_identity()
returns trigger as $$
begin
  -- Pengguna anonim dan terautentikasi client HANYA diizinkan membaca data
  if current_user in ('anon', 'authenticated') then
    raise exception 'Perlindungan Database: Peran % tidak memiliki izin untuk memodifikasi peserta secara langsung. Gunakan endpoint kehadiran resmi.', current_user;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_participant_identity on participants;
create trigger trg_protect_participant_identity
before update on participants
for each row
execute function protect_participant_identity();

-- ------------------------------------------------------------------------------
-- 6. KEAMANAN: Hak Akses Ketat (Server-Only Mutation)
-- ------------------------------------------------------------------------------
-- Cabut seluruh akses default publik
revoke all on participants from anon, authenticated;
revoke all on seat_layouts from anon, authenticated;

-- Izinkan publik membaca seluruh data peserta & konfigurasi denah
grant select on participants to anon, authenticated;
grant select on seat_layouts to anon, authenticated;

-- Hak akses untuk server backend (service_role):
-- Hanya SELECT, INSERT, UPDATE untuk kebutuhan aplikasi dan impor data.
-- Hak DELETE dan TRUNCATE sengaja TIDAK diberikan demi menjaga integritas data wisuda.
grant select, insert, update on table participants to service_role;
grant select, insert, update on table seat_layouts to service_role;
grant usage, select on all sequences in schema public to service_role;

-- PENTING: Hak UPDATE langsung dicabut dari anon dan authenticated pada semua kolom!
-- Seluruh mutasi peserta dan denah dilakukan melalui server terproteksi menggunakan service_role key.

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) & POLICIES
-- ------------------------------------------------------------------------------
alter table participants enable row level security;
alter table seat_layouts enable row level security;

-- Policy SELECT peserta untuk publik
drop policy if exists "Allow public select on participants" on participants;
create policy "Allow public select on participants"
on participants for select
to anon, authenticated
using (true);

-- Policy SELECT konfigurasi denah untuk publik
drop policy if exists "Allow public select on seat_layouts" on seat_layouts;
create policy "Allow public select on seat_layouts"
on seat_layouts for select
to anon, authenticated
using (true);

-- Tidak ada policy UPDATE/INSERT/DELETE untuk anon/authenticated.
-- PostgREST otomatis menolak setiap request PATCH/POST/DELETE langsung dari publik.

-- ------------------------------------------------------------------------------
-- 8. FUNGSI DATABASE: record_attendance (Jalur Mutasi Server Terkendali)
-- ------------------------------------------------------------------------------
create or replace function record_attendance(
  p_id uuid,
  p_type text,      -- 'reguler' | 'vip'
  p_action text     -- 'hadir' | 'batal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
begin
  if p_type not in ('reguler', 'vip') then
    raise exception 'Tipe kehadiran tidak valid: harus reguler atau vip';
  end if;
  if p_action not in ('hadir', 'batal') then
    raise exception 'Aksi kehadiran tidak valid: harus hadir atau batal';
  end if;

  select * into v_participant from participants where id = p_id;
  if not found then
    raise exception 'Peserta dengan ID % tidak ditemukan', p_id;
  end if;

  if p_type = 'vip' and not v_participant.is_vip then
    raise exception 'Peserta bukan VIP. Kehadiran VIP hanya untuk peserta VIP.';
  end if;

  if p_type = 'reguler' then
    if p_action = 'hadir' then
      update participants
      set status = 'sudah_hadir', checked_in_at = now()
      where id = p_id;
    else
      update participants
      set status = 'belum_hadir', checked_in_at = null
      where id = p_id;
    end if;
  elsif p_type = 'vip' then
    if p_action = 'hadir' then
      update participants
      set status_vip = 'sudah_hadir', checked_in_vip_at = now()
      where id = p_id;
    else
      update participants
      set status_vip = 'belum_hadir', checked_in_vip_at = null
      where id = p_id;
    end if;
  end if;

  select * into v_participant from participants where id = p_id;
  return to_jsonb(v_participant);
end;
$$;

-- PENTING: Cabut izin eksekusi dari publik/anon/authenticated!
revoke all on function record_attendance(uuid, text, text) from public, anon, authenticated;

-- Berikan izin eksekusi HANYA kepada service_role (server backend)
grant execute on function record_attendance(uuid, text, text) to service_role;
