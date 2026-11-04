import type { Participant, RawParticipant, SeatArea, SeatLayoutConfig, SeatInvitation } from './types';


export const AREAS: SeatArea[] = ['depan', 'belakang'];
export const MAX_BLOCKS = 30;
export type SeatLayout = Record<SeatArea, number> & { widths?: Record<SeatArea, number[]> };
export const DEFAULT_LAYOUT: SeatLayout = { depan: 18, belakang: 8 };
export const TARGET_SEATS = 1318;

export function configToSeatLayout(config: SeatLayoutConfig): SeatLayout {
  return {
    depan: config.depan,
    belakang: config.belakang,
    widths: {
      depan: config.widths.depan,
      belakang: config.widths.belakang,
    },
  };
}

export function validateLayout(layout: SeatLayout) {
  for (const area of AREAS) {
    if (!Number.isInteger(layout[area]) || layout[area] < 1 || layout[area] > 100) {
      throw new Error('Jumlah baris setiap area harus bilangan bulat antara 1 dan 100.');
    }
    const widths = layout.widths?.[area];
    if (layout.widths && (!Array.isArray(widths) || widths.length < 1 || widths.length > MAX_BLOCKS || widths.some(n => !Number.isInteger(n) || n < 1 || n > 24))) {
      throw new Error(`Isi 1–${MAX_BLOCKS} blok per area dengan 1–24 kursi per baris.`);
    }
  }
}
export const blockCount = (area: SeatArea, layout: SeatLayout = DEFAULT_LAYOUT) => layout.widths?.[area].length ?? 7;
export const blocksFor = (area: SeatArea, layout: SeatLayout = DEFAULT_LAYOUT) => Array.from({ length: blockCount(area, layout) }, (_, i) => blockCount(area, layout) - i);
export const seatsPerRow = (area: SeatArea, block: number, layout: SeatLayout = DEFAULT_LAYOUT) => layout.widths?.[area][block - 1] ?? (block === 7 ? 4 : 8);
export const areaWidth = (area: SeatArea, layout: SeatLayout) => blocksFor(area, layout).reduce((sum, block) => sum + seatsPerRow(area, block, layout), 0);
export function layoutPairCapacity(layout: SeatLayout) {
  validateLayout(layout);
  return AREAS.reduce((sum, area) => sum + blocksFor(area, layout).reduce((slots, block) => slots + rowCount(area, layout) * pairsPerRow(block, area, layout), 0), 0);
}
export function layoutCapacity(layout: SeatLayout) {
  validateLayout(layout);
  return AREAS.reduce((sum, area) => sum + rowCount(area, layout) * areaWidth(area, layout), 0);
}
export const rowCount = (area: SeatArea, layout: SeatLayout = DEFAULT_LAYOUT) => layout[area];
export const pairsPerRow = (block: number, area: SeatArea = 'depan', layout: SeatLayout = DEFAULT_LAYOUT) => Math.floor(seatsPerRow(area, block, layout) / 2);
export const blockCode = (area: SeatArea, block: number) => `${area === 'depan' ? 'D' : 'B'}${block}`;

export function seatAt(index: number, layout: SeatLayout = DEFAULT_LAYOUT) {
  const maxPairs = layoutPairCapacity(layout);
  if (!Number.isInteger(index) || index < 0 || index >= maxPairs) throw new Error(`Kapasitas reguler maksimal ${maxPairs} pasangan (${maxPairs * 2} kursi)`);
  let remaining = index;
  for (const area of AREAS) {
    for (let block = 1; block <= blockCount(area, layout); block++) {
      const pairs = pairsPerRow(block, area, layout);
      const capacity = rowCount(area, layout) * pairs;
      if (remaining < capacity) {
        const row = Math.floor(remaining / pairs) + 1;
        const start = (remaining % pairs) * 2 + 1;
        return { seat_area: area, seat_block: block, seat_row: row, seat_start: start, seat_end: start + 1,
          seat_label: `${area === 'depan' ? 'Depan' : 'Belakang'} · Blok ${block} · Baris ${row} · Kursi ${start}–${start + 1}` };
      }
      remaining -= capacity;
    }
  }
  throw new Error('Posisi kursi tidak ditemukan');
}


export function generateSeatAllocation(participants: RawParticipant[], layout: SeatLayout = DEFAULT_LAYOUT): Partial<Participant>[] {
  validateLayout(layout);
  const sortedParticipants = [...participants].sort((a, b) => a.nomor_urut - b.nomor_urut);
  
  const allocated: Partial<Participant>[] = [];

  for (let i = 0; i < sortedParticipants.length; i++) {
    const p = sortedParticipants[i];
    const isVip = Boolean(p.is_vip);
    const regularSeat = seatAt(i, layout);

    allocated.push({
      ...p,
      is_vip: isVip,
      ...regularSeat,
      status: p.status ?? 'belum_hadir',
      checked_in_at: p.checked_in_at ?? null,
      status_vip: isVip ? (p.status_vip ?? 'belum_hadir') : null,
      checked_in_vip_at: isVip ? (p.checked_in_vip_at ?? null) : null,
      vip_seat_label: isVip ? 'Area VIP Khusus' : null,
    });
  }

  return allocated;
}

export function getParticipantInvitations(participant: Participant): SeatInvitation[] {
  const invitations: SeatInvitation[] = [
    {
      id: `${participant.id}-reguler`,
      participant_id: participant.id,
      type: 'reguler',
      title: participant.is_vip ? 'Undangan 2: Tamu Tambahan (Reguler)' : 'Undangan Orang Tua/Wali (Reguler)',
      quota_guests: 2,
      seat_area: participant.seat_area ?? 'depan',
      seat_label: participant.seat_label,
      seat_block: participant.seat_block,
      seat_row: participant.seat_row,
      seat_start: participant.seat_start,
      seat_end: participant.seat_end,
      status: participant.status,
      checked_in_at: participant.checked_in_at,
    },
  ];

  if (participant.is_vip) {
    invitations.unshift({
      id: `${participant.id}-vip`,
      participant_id: participant.id,
      type: 'vip',
      title: 'Undangan 1: Tamu Khusus VIP (Area Panggung)',
      quota_guests: 2,
      seat_area: 'vip',
      seat_label: participant.vip_seat_label || 'Area VIP Khusus',
      seat_block: null,
      seat_row: null,
      seat_start: null,
      seat_end: null,
      status: participant.status_vip || 'belum_hadir',
      checked_in_at: participant.checked_in_vip_at || null,
    });
  }

  return invitations;
}

