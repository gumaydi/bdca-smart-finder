import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seatAt as configurableSeatAt,
  generateSeatAllocation as configurableAllocation,
  blockCode,
  getParticipantInvitations,
} from '../src/lib/seat-generator.ts';

const legacyLayout = { depan: 14, belakang: 7 };
const seatAt = (index, layout = legacyLayout) => configurableSeatAt(index, layout);
const generateSeatAllocation = (rows, layout = legacyLayout) => configurableAllocation(rows, layout);

test('546 unique pairs span 364 front and 182 rear slots', () => {
  const seats = Array.from({ length: 546 }, (_, i) => seatAt(i));
  assert.equal(new Set(seats.map(s => `${s.seat_area}/${s.seat_block}/${s.seat_row}/${s.seat_start}`)).size, 546);
  assert.equal(seats.filter(s => s.seat_area === 'depan').length, 364);
  assert.equal(seats.filter(s => s.seat_area === 'belakang').length, 182);
  for (const s of seats) {
    assert.ok(s.seat_row >= 1 && s.seat_row <= (s.seat_area === 'depan' ? 14 : 7));
    assert.ok(s.seat_end <= (s.seat_block === 7 ? 4 : 8));
    assert.equal(s.seat_start % 2, 1);
    assert.equal(s.seat_end, s.seat_start + 1);
  }
});

test('allocation moves right-to-left within rows, then blocks, then rear area', () => {
  assert.equal(seatAt(0).seat_label, 'Depan · Blok 1 · Baris 1 · Kursi 1–2');
  assert.equal(seatAt(3).seat_start, 7);
  assert.equal(seatAt(4).seat_row, 2);
  assert.equal(seatAt(56).seat_block, 2);
  assert.equal(seatAt(336).seat_block, 7);
  assert.equal(seatAt(363).seat_label, 'Depan · Blok 7 · Baris 14 · Kursi 3–4');
  assert.equal(seatAt(364).seat_label, 'Belakang · Blok 1 · Baris 1 · Kursi 1–2');
  assert.equal(seatAt(545).seat_label, 'Belakang · Blok 7 · Baris 7 · Kursi 3–4');
  assert.equal(blockCode('depan', 5), 'D5');
  assert.equal(blockCode('belakang', 4), 'B4');
});

test('reject overflow and invalid indices', () => {
  for (const index of [-1, 546, 1.5, NaN]) assert.throws(() => seatAt(index));
});

test('November 2026 rule: VIP receives regular pair for extra guests AND Area VIP Khusus metadata', () => {
  const rows = generateSeatAllocation([
    { nomor_urut: 11, nama: 'Reguler B', is_vip: false },
    { nomor_urut: 10, nama: 'VIP Mahasiswa', is_vip: true },
    { nomor_urut: 9, nama: 'Reguler A', is_vip: false },
  ]);

  // Sorted order by nomor_urut: 9 (Reguler A), 10 (VIP Mahasiswa), 11 (Reguler B)
  assert.equal(rows[0].nama, 'Reguler A');
  assert.equal(rows[0].seat_start, 1);
  assert.equal(rows[0].is_vip, false);
  assert.equal(rows[0].vip_seat_label, null);

  // VIP receives a regular seat pair for additional guests
  assert.equal(rows[1].nama, 'VIP Mahasiswa');
  assert.equal(rows[1].is_vip, true);
  assert.equal(rows[1].seat_start, 3);
  assert.equal(rows[1].seat_label, 'Depan · Blok 1 · Baris 1 · Kursi 3–4');
  assert.equal(rows[1].vip_seat_label, 'Area VIP Khusus');
  assert.equal(rows[1].status, 'belum_hadir');
  assert.equal(rows[1].status_vip, 'belum_hadir');

  // Next participant gets consecutive regular seat pair
  assert.equal(rows[2].nama, 'Reguler B');
  assert.equal(rows[2].seat_start, 5);
  assert.equal(rows[2].is_vip, false);

  // Invitation structure test
  const regularInvites = getParticipantInvitations(rows[0]);
  assert.equal(regularInvites.length, 1);
  assert.equal(regularInvites[0].type, 'reguler');
  assert.equal(regularInvites[0].quota_guests, 2);

  const vipInvites = getParticipantInvitations(rows[1]);
  assert.equal(vipInvites.length, 2);
  assert.equal(vipInvites[0].type, 'vip');
  assert.equal(vipInvites[0].title, 'Undangan 1: Tamu Khusus VIP (Area Panggung)');
  assert.equal(vipInvites[0].seat_area, 'vip');
  assert.equal(vipInvites[0].quota_guests, 2);
  assert.equal(vipInvites[1].type, 'reguler');
  assert.equal(vipInvites[1].quota_guests, 2);
  assert.equal(vipInvites[1].seat_label, 'Depan · Blok 1 · Baris 1 · Kursi 3–4');
});

test('configurable rows allocate 659 pairs and reject insufficient capacity', () => {
  const layout = { depan: 18, belakang: 8 };
  assert.equal(seatAt(468, layout).seat_area, 'belakang');
  assert.equal(seatAt(675, layout).seat_label, 'Belakang · Blok 7 · Baris 8 · Kursi 3–4');
  assert.throws(() => seatAt(676, layout));
  const rows = Array.from({ length: 659 }, (_, i) => ({ nomor_urut: 1001 + i, nama: `Demo ${i}`, is_vip: false }));
  assert.equal(generateSeatAllocation(rows, layout).length, 659);
  assert.throws(() => generateSeatAllocation(rows, { depan: 14, belakang: 7 }));
  for (const depan of [0, -1, 1.5, NaN, 101]) assert.throws(() => seatAt(0, { depan, belakang: 8 }));
});

test('independent block widths support 4, 6, 10 and odd physical seat counts', () => {
  const layout = { depan: 18, belakang: 8, widths: { depan: [10, 6, 8, 8, 8, 8, 4], belakang: [8, 8, 8, 8, 8, 8, 5] } };
  assert.equal(configurableSeatAt(4, layout).seat_start, 9);
  assert.equal(configurableSeatAt(90, layout).seat_block, 2);
  assert.equal(configurableSeatAt(90, layout).seat_start, 1);
  assert.equal(configurableSeatAt(675, layout).seat_label, 'Belakang · Blok 7 · Baris 8 · Kursi 3–4');
  assert.throws(() => configurableSeatAt(676, layout));
  const seats = Array.from({ length: 676 }, (_, i) => configurableSeatAt(i, layout));
  assert.equal(new Set(seats.map(s => `${s.seat_area}/${s.seat_block}/${s.seat_row}/${s.seat_start}`)).size, 676);
  assert.throws(() => configurableSeatAt(0, { ...layout, widths: { ...layout.widths, depan: [] } }));
});


test('areas have independent dynamic block counts, including D8 and B9', () => {
  const layout = { depan: 1, belakang: 1, widths: { depan: Array(8).fill(8), belakang: Array(9).fill(4) } };
  assert.equal(configurableSeatAt(28, layout).seat_block, 8);
  assert.equal(configurableSeatAt(28, layout).seat_area, 'depan');
  assert.equal(configurableSeatAt(32, layout).seat_area, 'belakang');
  assert.equal(configurableSeatAt(49, layout).seat_label, 'Belakang · Blok 9 · Baris 1 · Kursi 3–4');
  assert.throws(() => configurableSeatAt(50, layout));
  const single = { depan: 1, belakang: 1, widths: { depan: [4], belakang: [2] } };
  assert.equal(configurableSeatAt(2, single).seat_area, 'belakang');
  assert.throws(() => configurableSeatAt(3, single));
  assert.throws(() => configurableSeatAt(0, { ...single, widths: { ...single.widths, depan: Array(31).fill(8) } }));
});
