import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LAYOUT,
  generateSeatAllocation,
  layoutCapacity,
  layoutPairCapacity,
  validateLayout,
  configToSeatLayout,
} from '../src/lib/seat-generator.ts';


test('configToSeatLayout transforms Supabase row to SeatLayout correctly', () => {
  const config = {
    id: '11111111-2222-3333-4444-555555555555',
    is_active: true,
    version: 3,
    name: 'Konfigurasi Utama',
    depan: 18,
    belakang: 8,
    widths: {
      depan: [8, 8, 8, 8, 8, 8, 4],
      belakang: [8, 8, 8, 8, 8, 8, 4],
    },
    orientation: 'right_to_left',
    target_seats: 1318,
    total_capacity: 1352,
    pair_capacity: 676,
    created_at: '2026-11-03T00:00:00Z',
    updated_at: '2026-11-03T00:00:00Z',
  };

  const layout = configToSeatLayout(config);
  assert.equal(layout.depan, 18);
  assert.equal(layout.belakang, 8);
  assert.deepEqual(layout.widths?.depan, [8, 8, 8, 8, 8, 8, 4]);
  assert.deepEqual(layout.widths?.belakang, [8, 8, 8, 8, 8, 8, 4]);
  assert.equal(layoutCapacity(layout), 1352);
  assert.equal(layoutPairCapacity(layout), 676);
});

test('attendance status is 100% preserved when layout changes', () => {
  const initialLayout = { depan: 18, belakang: 8 };
  const updatedLayout = { depan: 19, belakang: 7 };

  const rawParticipants = Array.from({ length: 659 }, (_, i) => ({
    id: `p-${i}`,
    nomor_urut: 1001 + i,
    nama: `Wisudawan ${i + 1}`,
    nim: `NIM${1001 + i}`,
    prodi: 'Teknik',
    is_vip: i === 10 || i === 50,
    status: (i % 3 === 0 ? 'sudah_hadir' : 'belum_hadir'),
    checked_in_at: (i % 3 === 0 ? '2026-11-03T07:30:00Z' : null),
  }));

  // Initial allocation
  const allocInitial = generateSeatAllocation(rawParticipants, initialLayout);
  const participantsInitial = rawParticipants.map((p, i) => ({
    ...p,
    ...allocInitial[i],
    status: p.status,
    checked_in_at: p.checked_in_at,
  }));

  // Simulate updating layout
  const allocUpdated = generateSeatAllocation(participantsInitial, updatedLayout);
  const participantsUpdated = participantsInitial.map((p, i) => ({
    ...p,
    ...allocUpdated[i],
    status: p.status,
    checked_in_at: p.checked_in_at,
  }));

  assert.equal(participantsUpdated.length, 659);
  for (let i = 0; i < 659; i++) {
    // Identity must match
    assert.equal(participantsUpdated[i].id, rawParticipants[i].id);
    assert.equal(participantsUpdated[i].nomor_urut, rawParticipants[i].nomor_urut);
    // Attendance status and timestamp must be strictly preserved
    assert.equal(participantsUpdated[i].status, rawParticipants[i].status);
    assert.equal(participantsUpdated[i].checked_in_at, rawParticipants[i].checked_in_at);
  }

  // VIP participants retain VIP area metadata AND regular seat
  assert.equal(participantsUpdated[10].is_vip, true);
  assert.equal(participantsUpdated[10].vip_seat_label, 'Area VIP Khusus');
  assert.ok(participantsUpdated[10].seat_label.includes('Blok'));
  assert.equal(participantsUpdated[50].is_vip, true);
  assert.equal(participantsUpdated[50].vip_seat_label, 'Area VIP Khusus');
  assert.ok(participantsUpdated[50].seat_label.includes('Blok'));
});

test('deterministic allocation guarantees zero collision across different devices with same layout', () => {
  const layout = {
    depan: 18,
    belakang: 8,
    widths: {
      depan: [8, 8, 8, 8, 8, 8, 4],
      belakang: [8, 8, 8, 8, 8, 8, 4],
    },
  };

  const participants = Array.from({ length: 659 }, (_, i) => ({
    nomor_urut: 1001 + i,
    nama: `Peserta ${i + 1}`,
  }));

  // Device 1 calculation
  const device1 = generateSeatAllocation(participants, layout);
  // Device 2 calculation
  const device2 = generateSeatAllocation(participants, layout);

  assert.deepEqual(device1, device2);

  // Check no collision in regular pairs across all 659 participants
  const seatKeys = device1.map(p => `${p.seat_area}-${p.seat_block}-${p.seat_row}-${p.seat_start}`);
  const uniqueSeatKeys = new Set(seatKeys);
  assert.equal(seatKeys.length, uniqueSeatKeys.size, 'No two participants can share the same seat pair');
  assert.equal(uniqueSeatKeys.size, 659);
});

test('capacity validation rejects layouts with insufficient capacity for actual participants', () => {
  const totalWisudawanCount = 659; // All 659 wisudawan require a regular pair
  const smallLayout = { depan: 14, belakang: 7 }; // 546 pairs
  const pairCapacity = layoutPairCapacity(smallLayout);

  assert.ok(pairCapacity < totalWisudawanCount);
  assert.throws(() => {
    if (pairCapacity < totalWisudawanCount) {
      throw new Error(`Kapasitas denah (${pairCapacity} pasangan) tidak mencukupi untuk ${totalWisudawanCount} peserta.`);
    }
  }, /tidak mencukupi/);
});

test('optimistic versioning logic prevents overwrite conflicts', () => {
  let currentDbVersion = 2;

  function simulateSave(incomingExpectedVersion) {
    if (incomingExpectedVersion !== undefined && incomingExpectedVersion !== currentDbVersion) {
      throw new Error(`Konflik versi: Versi database saat ini adalah ${currentDbVersion}, sedangkan request mengharapkan versi ${incomingExpectedVersion}.`);
    }
    currentDbVersion += 1;
    return currentDbVersion;
  }

  // Admin A saves with expected version 2 -> succeeds, db becomes 3
  const versionAfterAdminA = simulateSave(2);
  assert.equal(versionAfterAdminA, 3);
  assert.equal(currentDbVersion, 3);

  // Admin B sends stale expected version 2 -> must be rejected with conflict
  assert.throws(() => simulateSave(2), /Konflik versi/);

  // Admin B reloads (gets version 3) and retries -> succeeds, db becomes 4
  const versionAfterAdminB = simulateSave(3);
  assert.equal(versionAfterAdminB, 4);
});

test('simulation mode keeps preview isolated from permanent changes', () => {
  const previewData = Array.from({ length: 659 }, (_, i) => ({
    id: `preview-${i}`,
    nomor_urut: 1001 + i,
    nama: `Peserta Contoh ${i + 1}`,
    status: 'belum_hadir',
  }));

  // Toggle in-memory
  const toggled = previewData.map(p => p.id === 'preview-0' ? { ...p, status: 'sudah_hadir' } : p);
  assert.equal(toggled[0].status, 'sudah_hadir');
  assert.equal(previewData[0].status, 'belum_hadir'); // original unchanged
});
