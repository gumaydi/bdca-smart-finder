import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_LAYOUT,
  configToSeatLayout,
  generateSeatAllocation,
  layoutCapacity,
  layoutPairCapacity,
  seatAt,
} from '../src/lib/seat-generator.ts';
import type { SeatLayout } from '../src/lib/seat-generator.ts';
import type { Participant, RawParticipant, SeatLayoutConfig } from '../src/lib/types.ts';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminPassword = process.env.ADMIN_PASSWORD!;

interface TestResult {
  scenario: string;
  status: 'PASS' | 'FAIL';
  details: string;
  evidence: Record<string, unknown>;
}

const results: TestResult[] = [];

function recordResult(scenario: string, status: 'PASS' | 'FAIL', details: string, evidence: Record<string, unknown> = {}) {
  results.push({ scenario, status, details, evidence });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${status}] ${scenario}: ${details}`);
}

async function runUAT() {
  console.log('================================================================');
  console.log('  PENGUJIAN OPERASIONAL & UAT LENGKAP: BDCA SMART FINDER');
  console.log('  Wisuda November 2026 - Supabase Remote (Data Riil)');
  console.log('================================================================\n');

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(supabaseUrl, anonKey);

  // --------------------------------------------------------------------------
  // UAT 1: Integritas Data 659 Peserta & Zero Collision Alokasi Kursi
  // --------------------------------------------------------------------------
  console.log('--- 1. UAT ALOKASI KURSI & ZERO COLLISION ---');
  try {
    const { data: participants, error: pErr, count } = await adminClient
      .from('participants')
      .select('id, nomor_urut, nama, nim, prodi, status, is_vip', { count: 'exact' })
      .order('nomor_urut', { ascending: true });

    if (pErr || !participants || participants.length !== 659) {
      recordResult(
        'Integritas Data 659 Peserta',
        'FAIL',
        `Ditemukan ${participants?.length ?? 0} peserta, diharapkan 659: ${pErr?.message}`,
        { count, error: pErr?.message }
      );
    } else {
      recordResult(
        'Integritas Data 659 Peserta',
        'PASS',
        `Tepat 659 wisudawan tersimpan di Supabase`,
        { total: participants.length }
      );
    }

    // Ambil denah aktif
    const { data: layoutConfig, error: lErr } = await adminClient
      .from('seat_layouts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (lErr || !layoutConfig) {
      recordResult(
        'Denah Aktif Supabase',
        'FAIL',
        `Gagal membaca denah aktif: ${lErr?.message}`,
        { error: lErr?.message }
      );
    } else {
      const seatLayout = configToSeatLayout(layoutConfig as SeatLayoutConfig);
      const totalPairs = layoutPairCapacity(seatLayout);
      const totalSeats = layoutCapacity(seatLayout);

      const allocations = generateSeatAllocation(
        (participants || []).map(p => ({
          nomor_urut: p.nomor_urut,
          nama: p.nama,
          nim: p.nim ?? undefined,
          prodi: p.prodi ?? undefined,
        })),
        seatLayout
      );

      // Verifikasi collision
      const seatSet = new Set<string>();
      let collisions = 0;
      let studentSeatsCount = 0;

      for (let i = 0; i < allocations.length; i++) {
        const alloc = allocations[i];
        const label = alloc.seat_label;
        if (!label) {
          collisions++;
          continue;
        }
        if (seatSet.has(label)) {
          collisions++;
        }
        seatSet.add(label);

        // Periksa apakah format kursi mahasiswa (A1-D155) terpakai
        if (/^[A-D](?![\d]+-)\d+/.test(label)) {
          studentSeatsCount++;
        }
      }

      if (collisions === 0 && studentSeatsCount === 0 && allocations.length === 659) {
        recordResult(
          'Zero Collision & Alokasi 1.318 Kursi Orang Tua',
          'PASS',
          `659 pasangan kursi (1.318 kursi) teralokasi 100% unik tanpa tabrakan dari kapasitas ${totalSeats} kursi`,
          {
            kapasitasFisik: totalSeats,
            kapasitasPasang: totalPairs,
            kursiDibutuhkan: 1318,
            pasangDibutuhkan: 659,
            tabrakan: collisions,
            kursiMahasiswaTerpakai: studentSeatsCount,
          }
        );
      } else {
        recordResult(
          'Zero Collision & Alokasi 1.318 Kursi Orang Tua',
          'FAIL',
          `Ditemukan ${collisions} tabrakan kursi atau ${studentSeatsCount} kursi mahasiswa`,
          { collisions, studentSeatsCount }
        );
      }
    }
  } catch (err: unknown) {
    recordResult('Integritas Kursi', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // UAT 2: Mutasi Kehadiran Terkendali & Pemulihan Instan (Rollback)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. UAT MUTASI KEHADIRAN & ROLLBACK KETAT ---');
  try {
    // Ambil sampel wisudawan nomor_urut 1
    const { data: sampleList, error: sErr } = await adminClient
      .from('participants')
      .select('id, nomor_urut, nama, status, checked_in_at')
      .eq('nomor_urut', 1)
      .limit(1);

    if (sErr || !sampleList || sampleList.length === 0) {
      throw new Error(`Gagal mengambil peserta sampel nomor_urut 1: ${sErr?.message}`);
    }

    const sample = sampleList[0];
    const initialStatus = sample.status;
    const initialCheckedInAt = sample.checked_in_at;

    console.log(`Peserta Uji: #${sample.nomor_urut} ${sample.nama} (ID: ${sample.id})`);
    console.log(`Status Awal: ${initialStatus} (checked_in_at: ${initialCheckedInAt})`);

    let checkInSucceeded = false;
    let rollbackSucceeded = false;

    try {
      // 2a. Tandai hadir via POST /api/attendance
      const resHadir = await fetch(`${BASE_URL}/api/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
        body: JSON.stringify({
          participantId: sample.id,
          type: 'reguler',
          action: 'hadir',
        }),
      });

      const dataHadir = (await resHadir.json()) as { success: boolean; participant: Participant };
      if (resHadir.status === 200 && dataHadir.success && dataHadir.participant.status === 'sudah_hadir') {
        checkInSucceeded = true;
        console.log(`-> Berhasil ditandai hadir via /api/attendance: ${dataHadir.participant.status} pada ${dataHadir.participant.checked_in_at}`);
      } else {
        throw new Error(`Respon tandai hadir gagal: HTTP ${resHadir.status}`);
      }
    } finally {
      // 2b. Pemulihan status semula (Wajib dieksekusi walau error)
      const resBatal = await fetch(`${BASE_URL}/api/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
        body: JSON.stringify({
          participantId: sample.id,
          type: 'reguler',
          action: 'batal',
        }),
      });

      const dataBatal = (await resBatal.json()) as { success: boolean; participant: Participant };
      if (resBatal.status === 200 && dataBatal.success && dataBatal.participant.status === 'belum_hadir') {
        rollbackSucceeded = true;
        console.log(`-> Berhasil dibatalkan/dipulihkan via /api/attendance: ${dataBatal.participant.status}`);
      }
    }

    // Verifikasi langsung ke database
    const { data: verifiedSample } = await adminClient
      .from('participants')
      .select('status, checked_in_at')
      .eq('id', sample.id)
      .single();

    if (checkInSucceeded && rollbackSucceeded && verifiedSample?.status === 'belum_hadir') {
      recordResult(
        'Mutasi Kehadiran & Rollback Ketat',
        'PASS',
        `Pencatatan hadir dan pembatalan via /api/attendance berhasil 100%, status kembali bersih`,
        {
          sampleId: sample.id,
          statusSebelum: initialStatus,
          statusSetelahRollback: verifiedSample.status,
          checkedInAtSetelahRollback: verifiedSample.checked_in_at,
        }
      );
    } else {
      recordResult(
        'Mutasi Kehadiran & Rollback Ketat',
        'FAIL',
        `Pemulihan status kehadiran gagal atau tidak sesuai! Status sekarang: ${verifiedSample?.status}`,
        { verifiedSample }
      );
    }
  } catch (err: unknown) {
    recordResult('Mutasi Kehadiran & Rollback Ketat', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // UAT 3: Sinkronisasi Realtime Dua Subscriber Independen (Client A & Client B)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. UAT SINKRONISASI REALTIME 2 SUBSCRIBER ---');
  try {
    const subscriberA = createClient(supabaseUrl, anonKey);
    const subscriberB = createClient(supabaseUrl, anonKey);

    const { data: sampleList } = await adminClient
      .from('participants')
      .select('id, nama')
      .eq('nomor_urut', 2)
      .limit(1);

    const sample = sampleList![0];

    let eventA: { status: string; receivedAt: number } | null = null;
    let eventB: { status: string; receivedAt: number } | null = null;

    const channelA = subscriberA.channel('uat-subscriber-a').on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'participants', filter: `id=eq.${sample.id}` },
      payload => {
        eventA = { status: (payload.new as Participant).status, receivedAt: Date.now() };
      }
    ).subscribe();

    const channelB = subscriberB.channel('uat-subscriber-b').on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'participants', filter: `id=eq.${sample.id}` },
      payload => {
        eventB = { status: (payload.new as Participant).status, receivedAt: Date.now() };
      }
    ).subscribe();

    // Tunggu koneksi WebSocket stabil
    await new Promise(r => setTimeout(r, 2500));

    const triggerTime = Date.now();
    console.log(`Mengirim perubahan kehadiran pada #${sample.id}...`);
    await adminClient.rpc('record_attendance', { p_id: sample.id, p_type: 'reguler', p_action: 'hadir' });

    // Tunggu penerimaan event hingga 4 detik
    for (let i = 0; i < 20; i++) {
      if (eventA && eventB) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // Revert status seketika
    await adminClient.rpc('record_attendance', { p_id: sample.id, p_type: 'reguler', p_action: 'batal' });

    await subscriberA.removeChannel(channelA);
    await subscriberB.removeChannel(channelB);

    const finalEventA = eventA as { status: string; receivedAt: number } | null;
    const finalEventB = eventB as { status: string; receivedAt: number } | null;
    if (finalEventA && finalEventB) {
      const latencyA = finalEventA.receivedAt - triggerTime;
      const latencyB = finalEventB.receivedAt - triggerTime;
      recordResult(
        'Sinkronisasi Realtime Dua Subscriber',
        'PASS',
        `Kedua subscriber independen menerima pembaruan seketika (Latensi A: ${latencyA}ms, Latensi B: ${latencyB}ms)`,
        { latencyA, latencyB, statusA: finalEventA.status, statusB: finalEventB.status }
      );
    } else {
      recordResult(
        'Sinkronisasi Realtime Dua Subscriber',
        'FAIL',
        `Salah satu atau kedua subscriber tidak menerima event realtime (Event A: ${Boolean(finalEventA)}, Event B: ${Boolean(finalEventB)})`
      );
    }
  } catch (err: unknown) {
    recordResult('Sinkronisasi Realtime Dua Subscriber', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // UAT 4: Autentikasi Admin & Pratinjau Denah Non-Destruktif
  // --------------------------------------------------------------------------
  console.log('\n--- 4. UAT AUTENTIKASI ADMIN & SIMULASI DENAH ---');
  try {
    // 4a. Coba password salah
    const resBad = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ password: 'password-salah-123' }),
    });
    const passRejection = resBad.status === 401;

    // 4b. Login dengan ADMIN_PASSWORD
    const resGood = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ password: adminPassword }),
    });
    const cookie = resGood.headers.get('set-cookie') || '';
    const passLogin = resGood.status === 200 && cookie.includes('admin_session');

    // 4c. Simulasi Denah Baru (isPreview: true)
    const resSim = await fetch(`${BASE_URL}/api/admin/layout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Cookie: cookie.split(';')[0],
      },
      body: JSON.stringify({
        depan: 20,
        belakang: 8,
        widths: {
          depan: [8, 8, 8, 8, 8, 8, 4],
          belakang: [8, 8, 8, 8, 8, 8, 4],
        },
        isPreview: true,
      }),
    });
    const dataSim = (await resSim.json()) as { isPreview: boolean; layout: { depan: number; belakang: number } };
    const passSim = resSim.status === 200 && dataSim.isPreview === true && dataSim.layout.depan === 20;

    // 4d. Verifikasi database remote: denah aktif TIDAK BERUBAH (tetap 18 depan)
    const { data: dbLayout } = await adminClient
      .from('seat_layouts')
      .select('depan, belakang, version, is_active')
      .eq('is_active', true)
      .single();

    const dbUnchanged = dbLayout?.depan === 18 && dbLayout?.version === 1;

    if (passRejection && passLogin && passSim && dbUnchanged) {
      recordResult(
        'Autentikasi Admin & Simulasi Non-Destruktif',
        'PASS',
        `Login admin terverifikasi aman dan simulasi denah (20 baris) tidak mengubah database aktif (tetap 18 baris)`,
        { dbLayoutAktif: dbLayout }
      );
    } else {
      recordResult(
        'Autentikasi Admin & Simulasi Non-Destruktif',
        'FAIL',
        `Kegagalan pada salah satu verifikasi admin: login=${passLogin}, sim=${passSim}, dbUnchanged=${dbUnchanged}`
      );
    }
  } catch (err: unknown) {
    recordResult('Autentikasi Admin & Simulasi Non-Destruktif', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // UAT 5: Fungsionalitas Pencarian Nama, NIM, dan Prodi
  // --------------------------------------------------------------------------
  console.log('\n--- 5. UAT PENCARIAN & FILTER PRODI ---');
  try {
    // 5a. Cari nama "Muhammad"
    const { data: resName } = await anonClient
      .from('participants')
      .select('nama, prodi')
      .ilike('nama', '%MUHAMMAD%')
      .limit(5);

    // 5b. Cari NIM tepat
    const { data: resNim } = await anonClient
      .from('participants')
      .select('nama, nim, prodi')
      .eq('nim', '24172029P')
      .single();

    // 5c. Cari Prodi ternormalisasi "Teknik Informatika"
    const { data: resProdi } = await anonClient
      .from('participants')
      .select('nama, prodi')
      .ilike('prodi', '%Teknik Informatika%')
      .limit(5);

    const namePass = (resName?.length || 0) > 0;
    const nimPass = resNim && resNim.nama.includes('MUHAMMAD FAUZY GYMNASTIAR');
    const prodiPass = (resProdi?.length || 0) > 0 && resProdi?.[0]?.prodi.includes('Teknik Informatika');

    if (namePass && nimPass && prodiPass) {
      recordResult(
        'Pencarian Nama, NIM & Prodi',
        'PASS',
        `Pencarian publik berfungsi presisi pada seluruh atribut identitas`,
        {
          contohHasilNama: resName?.[0]?.nama,
          contohHasilNIM: `${resNim?.nim} (${resNim?.nama})`,
          contohHasilProdi: resProdi?.[0]?.prodi,
        }
      );
    } else {
      recordResult('Pencarian Nama, NIM & Prodi', 'FAIL', `Hasil pencarian tidak lengkap: name=${namePass}, nim=${nimPass}, prodi=${prodiPass}`);
    }
  } catch (err: unknown) {
    recordResult('Pencarian Nama, NIM & Prodi', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // UAT 6: Verifikasi Akhir Integritas 659 Wisudawan (Post-UAT Audit)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. UAT AUDIT KEBERSIHAN AKHIR DATABASE ---');
  try {
    const { data: finalRows, count: finalCount } = await adminClient
      .from('participants')
      .select('id, nomor_urut, status, is_vip, status_vip', { count: 'exact' });

    const totalClean = finalCount === 659;
    const allBelumHadir = finalRows?.every(p => p.status === 'belum_hadir') === true;
    const allVipClean = finalRows?.every(p => !p.is_vip && p.status_vip === null) === true;

    if (totalClean && allBelumHadir && allVipClean) {
      recordResult(
        'Verifikasi Akhir Kebersihan Data Pasca-UAT',
        'PASS',
        `Seluruh 659 peserta 100% berada dalam status 'belum_hadir' (database siap pakai)`,
        { totalPeserta: finalCount, belumHadir: finalRows?.length }
      );
    } else {
      recordResult(
        'Verifikasi Akhir Kebersihan Data Pasca-UAT',
        'FAIL',
        `Terdapat peserta yang statusnya belum pulih! Total: ${finalCount}, AllBelumHadir: ${allBelumHadir}`
      );
    }
  } catch (err: unknown) {
    recordResult('Verifikasi Akhir Kebersihan Data Pasca-UAT', 'FAIL', `Exception: ${(err as Error).message}`);
  }

  // --------------------------------------------------------------------------
  // REKAPITULASI UAT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  REKAPITULASI HASIL UAT OTOMATIS');
  console.log('================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;

  console.log(`Total Pengujian : ${results.length}`);
  console.log(`Lulus (PASS)    : ${passCount}`);
  console.log(`Gagal (FAIL)    : ${failCount}`);

  if (failCount > 0) {
    process.exitCode = 1;
    console.log('\n[PERHATIAN] Terdapat pengujian UAT yang GAGAL. Periksa log detail di atas.');
  } else {
    process.exitCode = 0;
    console.log('\n[SUKSES LENGKAP] Seluruh pengujian UAT otomatis LULUS 100%!');
  }

  // Export JSON report for documentation
  fs.writeFileSync(
    'scripts/uat-results.json',
    JSON.stringify({ timestamp: new Date().toISOString(), passCount, failCount, results }, null, 2)
  );

  process.exit(failCount > 0 ? 1 : 0);
}

runUAT().catch(err => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
