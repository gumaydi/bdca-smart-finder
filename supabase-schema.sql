-- Create participants table
create table participants (
  id uuid primary key default gen_random_uuid(),
  nomor_urut integer not null,
  nama text not null,
  nim text,
  prodi text,
  is_vip boolean not null default false,
  seat_block integer,
  seat_row integer,
  seat_start integer,
  seat_end integer,
  seat_label text,
  status text not null default 'belum_hadir',
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Realtime
alter publication supabase_realtime add table participants;

-- Disable RLS for simplicity as per requirements
alter table participants disable row level security;

-- Create indexes for searching
create index participants_nama_idx on participants using gin (to_tsvector('simple', nama));
create index participants_nim_idx on participants (nim);
create index participants_prodi_idx on participants (prodi);
create index participants_status_idx on participants (status);
create index participants_is_vip_idx on participants (is_vip);

-- Function and Trigger for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_participants_updated_at
before update on participants
for each row
execute function update_updated_at_column();
