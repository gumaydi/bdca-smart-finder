import { createClient as createSSRClient } from '@/utils/supabase/client';
import { Participant, SeatLayoutConfig } from '../types';
import { configToSeatLayout } from '../seat-generator';

export { configToSeatLayout };
export const supabase = createSSRClient();


export async function getActiveSeatLayout(): Promise<SeatLayoutConfig | null> {
  try {
    const { data, error } = await supabase
      .from('seat_layouts')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Supabase query error on seat_layouts:', error);
      throw new Error(`Gagal mengambil konfigurasi denah dari database: ${error.message}`);
    }

    return data as SeatLayoutConfig | null;
  } catch (err: unknown) {
    console.error('Failed to fetch active seat layout:', err);
    throw err;
  }
}

export async function getAllParticipants() {

  try {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .order('nomor_urut', { ascending: true });
    
    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(error.message);
    }
    return data as Participant[];
  } catch (err: unknown) {
    console.error('Failed to fetch participants:', err);
    throw err;
  }
}

export async function markPresent(participantId: string, type: 'reguler' | 'vip' = 'reguler') {
  const res = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantId,
      type,
      action: 'hadir',
    }),
  });

  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Gagal menandai kehadiran');
  }
}

export async function cancelPresent(participantId: string, type: 'reguler' | 'vip' = 'reguler') {
  const res = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantId,
      type,
      action: 'batal',
    }),
  });

  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Gagal membatalkan kehadiran');
  }
}

