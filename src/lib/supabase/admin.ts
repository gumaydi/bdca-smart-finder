import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SeatLayoutConfig } from '../types.ts';
import type { SeatLayout } from '../seat-generator.ts';
import { layoutCapacity, layoutPairCapacity } from '../seat-generator.ts';

let cachedClient: SupabaseClient | null = null;

export function getAdminSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key if configured, otherwise fall back to publishable key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL) are not configured.');
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export async function getActiveLayoutServer(): Promise<SeatLayoutConfig | null> {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('seat_layouts')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Failed to get active seat layout from server:', error);
    throw new Error(`Gagal membaca konfigurasi denah dari database: ${error.message}`);
  }

  return data as SeatLayoutConfig | null;
}

export async function getRegularParticipantsCountServer(): Promise<number> {
  const supabase = getAdminSupabaseClient();
  const { count, error } = await supabase
    .from('participants')
    .select('id', { count: 'exact' })
    .eq('is_vip', false)
    .limit(1);

  if (error) {
    console.error('Failed to count regular participants from server:', error);
    throw new Error(`Gagal menghitung jumlah peserta dari database: ${error.message}`);
  }

  return count ?? 0;
}

export async function saveActiveLayoutServer(
  layout: SeatLayout,
  expectedVersion?: number,
  updatedBy: string = 'admin'
): Promise<SeatLayoutConfig> {
  const supabase = getAdminSupabaseClient();
  const current = await getActiveLayoutServer();

  const totalCapacity = layoutCapacity(layout);
  const pairCapacity = layoutPairCapacity(layout);
  const widths = layout.widths ?? {
    depan: [8, 8, 8, 8, 8, 8, 4],
    belakang: [8, 8, 8, 8, 8, 8, 4],
  };

  if (!current) {
    // If table is newly created without initial seed, insert first active row
    const initialVersion = 1;
    const { data, error } = await supabase
      .from('seat_layouts')
      .insert({
        is_active: true,
        version: initialVersion,
        name: 'Konfigurasi Utama',
        depan: layout.depan,
        belakang: layout.belakang,
        widths,
        orientation: 'right_to_left',
        target_seats: 1318,
        total_capacity: totalCapacity,
        pair_capacity: pairCapacity,
        updated_by: updatedBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Gagal menyimpan konfigurasi awal: ${error.message}`);
    }
    return data as SeatLayoutConfig;
  }

  // Optimistic locking check
  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    const error = new Error(`Konflik versi denah: Konfigurasi telah diperbarui ke versi ${current.version} oleh sesi lain. Silakan muat ulang halaman.`);
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const nextVersion = current.version + 1;
  const { data, error } = await supabase
    .from('seat_layouts')
    .update({
      depan: layout.depan,
      belakang: layout.belakang,
      widths,
      total_capacity: totalCapacity,
      pair_capacity: pairCapacity,
      version: nextVersion,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .eq('version', current.version) // Atomic optimistic update condition
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Gagal memperbarui konfigurasi denah: ${error?.message ?? 'Konflik konkuren saat update'}`);
  }

  return data as SeatLayoutConfig;
}
