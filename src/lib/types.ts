export type SeatArea = 'depan' | 'belakang';

export type ParticipantStatus = 'belum_hadir' | 'sudah_hadir';
export type InvitationType = 'reguler' | 'vip';

export interface Participant {
  id: string;
  nomor_urut: number;
  nama: string;
  nim: string | null;
  prodi: string | null;
  is_vip: boolean;
  seat_area?: SeatArea;
  seat_block: number | null;
  seat_row: number | null;
  seat_start: number | null;
  seat_end: number | null;
  seat_label: string;
  // Undangan Reguler (Berlaku untuk seluruh wisudawan, termasuk tamu tambahan VIP)
  status: ParticipantStatus;
  checked_in_at: string | null;
  // Undangan Khusus VIP (Hanya jika is_vip = true)
  status_vip?: ParticipantStatus | null;
  checked_in_vip_at?: string | null;
  vip_seat_label?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeatInvitation {
  id: string;
  participant_id: string;
  type: InvitationType;
  title: string;
  quota_guests: number; // Selalu 2 tamu per undangan
  seat_area: 'depan' | 'belakang' | 'vip';
  seat_label: string;
  seat_block: number | null;
  seat_row: number | null;
  seat_start: number | null;
  seat_end: number | null;
  status: ParticipantStatus;
  checked_in_at: string | null;
}

export type RawParticipant = {
  nomor_urut: number;
  nama: string;
  is_vip?: boolean;
  nim?: string;
  prodi?: string;
  status?: ParticipantStatus;
  checked_in_at?: string | null;
  status_vip?: ParticipantStatus | null;
  checked_in_vip_at?: string | null;
};


export interface SeatLayoutConfig {
  id: string;
  is_active: boolean;
  version: number;
  name: string;
  depan: number;
  belakang: number;
  widths: {
    depan: number[];
    belakang: number[];
  };
  orientation: string;
  target_seats: number;
  total_capacity: number;
  pair_capacity: number;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

