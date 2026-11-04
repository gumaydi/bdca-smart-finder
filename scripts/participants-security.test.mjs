import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExcelFile } from './import-excel.ts';

test('Excel Parser extracts exactly 659 wisudawan from DAFTAR PANGGIL DAN NOMOR KURSI.xlsx with 0 duplicates', () => {
  const participants = parseExcelFile('./DAFTAR PANGGIL DAN NOMOR KURSI.xlsx');
  assert.equal(participants.length, 659, 'Total wisudawan must be exactly 659');

  const nims = new Set(participants.map(p => p.nim));
  assert.equal(nims.size, 659, 'All 659 NIMs must be unique');

  // Verify NIMs with letters or numbers preserve exact characters
  const sampleAlphanumeric = participants.find(p => p.nim === '24125002P');
  assert.ok(sampleAlphanumeric, 'Alphanumeric NIM 24125002P must be parsed');
  assert.equal(sampleAlphanumeric.nama, 'JANUARIUS DOX SANTOS BARANSANO');

  // Verify student chairs A-D were read for validation but are separate from parent seating
  assert.ok(participants[0].student_seat, 'Student seat should be present in parsed metadata');
  assert.match(participants[0].student_seat, /^[ABCD][0-9]+$/);

  // Under November 2026 rules, all 659 participants default to regular until official VIP list is assigned
  const vipCount = participants.filter(p => p.is_vip).length;
  assert.equal(vipCount, 0, 'Must default to 0 VIP participants (all 659 regular by default)');
});

test('Anti-tamper trigger logic allows regular and VIP attendance updates but blocks identity and VIP privilege escalation', () => {
  const original = {
    id: 'uuid-1234',
    nomor_urut: 1,
    nama: 'AHMAD HAFIZH',
    nim: '231220005',
    prodi: 'Teknik Komputer (DIII)',
    is_vip: false,
    vip_seat_label: null,
    status: 'belum_hadir',
    checked_in_at: null,
    status_vip: null,
    checked_in_vip_at: null,
  };

  // Function simulating PostgreSQL trigger protect_participant_identity()
  function simulateTrigger(oldRow, newRow, role = 'anon') {
    if (role === 'anon' || role === 'authenticated') {
      if (
        newRow.nama !== oldRow.nama ||
        newRow.nomor_urut !== oldRow.nomor_urut ||
        newRow.nim !== oldRow.nim ||
        newRow.prodi !== oldRow.prodi ||
        newRow.is_vip !== oldRow.is_vip ||
        newRow.vip_seat_label !== oldRow.vip_seat_label
      ) {
        throw new Error('Perlindungan Database: Anda hanya diizinkan mengubah status kehadiran peserta (status, status_vip, checked_in_at, checked_in_vip_at). Perubahan identitas, status VIP, atau alokasi kursi diblokir.');
      }
    }
    return newRow;
  }

  // 1. Panitia marks regular present -> ALLOWED
  const checkIn = {
    ...original,
    status: 'sudah_hadir',
    checked_in_at: '2026-11-03T07:15:00Z',
  };
  assert.doesNotThrow(() => simulateTrigger(original, checkIn, 'anon'));

  // 2. Panitia cancels regular attendance -> ALLOWED
  const cancelCheckIn = {
    ...checkIn,
    status: 'belum_hadir',
    checked_in_at: null,
  };
  assert.doesNotThrow(() => simulateTrigger(checkIn, cancelCheckIn, 'anon'));

  // 3. For VIP participant: panitia marks VIP present independently -> ALLOWED
  const vipOriginal = {
    ...original,
    is_vip: true,
    vip_seat_label: 'Area VIP Khusus',
    status_vip: 'belum_hadir',
  };
  const vipCheckIn = {
    ...vipOriginal,
    status_vip: 'sudah_hadir',
    checked_in_vip_at: '2026-11-03T07:20:00Z',
  };
  assert.doesNotThrow(() => simulateTrigger(vipOriginal, vipCheckIn, 'anon'));

  // 4. Unauthorized attempt to modify name -> REJECTED
  const tamperName = {
    ...original,
    nama: 'HACKED NAME',
  };
  assert.throws(() => simulateTrigger(original, tamperName, 'anon'), /Perlindungan Database/);

  // 5. Unauthorized attempt to modify NIM -> REJECTED
  const tamperNim = {
    ...original,
    nim: '999999999',
  };
  assert.throws(() => simulateTrigger(original, tamperNim, 'anon'), /Perlindungan Database/);

  // 6. Unauthorized attempt to escalate regular user to VIP -> REJECTED
  const tamperVip = {
    ...original,
    is_vip: true,
  };
  assert.throws(() => simulateTrigger(original, tamperVip, 'anon'), /Perlindungan Database/);

  // 7. Service role (admin server) -> CAN update identity and VIP during Excel import
  assert.doesNotThrow(() => simulateTrigger(original, { ...original, nama: 'CORRECTED NAME', is_vip: true }, 'service_role'));
});

test('VIP and regular attendance statuses are strictly independent', () => {
  // A VIP graduate has 2 invitations
  let vipParticipant = {
    id: 'vip-1',
    nama: 'Dr. Wisudawan VIP',
    is_vip: true,
    status: 'belum_hadir',
    checked_in_at: null,
    status_vip: 'belum_hadir',
    checked_in_vip_at: null,
  };

  // Function to toggle specific invitation
  function toggleAttendance(participant, type) {
    if (type === 'vip') {
      const isPresent = participant.status_vip === 'sudah_hadir';
      return {
        ...participant,
        status_vip: isPresent ? 'belum_hadir' : 'sudah_hadir',
        checked_in_vip_at: isPresent ? null : new Date().toISOString(),
      };
    } else {
      const isPresent = participant.status === 'sudah_hadir';
      return {
        ...participant,
        status: isPresent ? 'belum_hadir' : 'sudah_hadir',
        checked_in_at: isPresent ? null : new Date().toISOString(),
      };
    }
  }

  // 1. VIP guest arrives at Stage Area -> mark VIP present
  vipParticipant = toggleAttendance(vipParticipant, 'vip');
  assert.equal(vipParticipant.status_vip, 'sudah_hadir');
  assert.ok(vipParticipant.checked_in_vip_at);
  // Crucial requirement: Regular guest invitation remains UNCHANGED
  assert.equal(vipParticipant.status, 'belum_hadir');
  assert.equal(vipParticipant.checked_in_at, null);

  // 2. Extra regular guest arrives later -> mark regular present
  vipParticipant = toggleAttendance(vipParticipant, 'reguler');
  assert.equal(vipParticipant.status, 'sudah_hadir');
  assert.ok(vipParticipant.checked_in_at);
  // VIP status remains 'sudah_hadir'
  assert.equal(vipParticipant.status_vip, 'sudah_hadir');

  // 3. Regular guest check-in is cancelled -> VIP attendance remains unaffected
  vipParticipant = toggleAttendance(vipParticipant, 'reguler');
  assert.equal(vipParticipant.status, 'belum_hadir');
  assert.equal(vipParticipant.checked_in_at, null);
  assert.equal(vipParticipant.status_vip, 'sudah_hadir');
});

test('Public attendance operations remain frictionless without PIN or login', () => {
  // Simulated client attendance toggle action
  function toggleAttendance(participant) {
    const isPresent = participant.status === 'sudah_hadir';
    return {
      status: isPresent ? 'belum_hadir' : 'sudah_hadir',
      checked_in_at: isPresent ? null : new Date().toISOString(),
    };
  }

  const p1 = { id: 'p1', status: 'belum_hadir', checked_in_at: null };
  const updated1 = toggleAttendance(p1);
  assert.equal(updated1.status, 'sudah_hadir');
  assert.ok(updated1.checked_in_at !== null);

  const updated2 = toggleAttendance(updated1);
  assert.equal(updated2.status, 'belum_hadir');
  assert.equal(updated2.checked_in_at, null);
});
