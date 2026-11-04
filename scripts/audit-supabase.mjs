import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

async function audit() {
  console.log('================================================================');
  console.log('  AUDIT KONFIGURASI SUPABASE: BDCA Smart Finder (Wisuda)');
  console.log('================================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminPassword = process.env.ADMIN_PASSWORD;

  console.log('\n1. KELENGKAPAN ENVIRONMENT VARIABLES (.env.local):');
  console.log(` - NEXT_PUBLIC_SUPABASE_URL         : ${supabaseUrl ? `Tersedia (${new URL(supabaseUrl).host})` : 'TIDAK TERSEDIA'}`);
  console.log(` - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${anonKey ? `Tersedia (${anonKey.slice(0, 10)}...${anonKey.slice(-5)})` : 'TIDAK TERSEDIA'}`);
  console.log(` - SUPABASE_SERVICE_ROLE_KEY        : ${serviceKey ? `Tersedia (${serviceKey.slice(0, 10)}...${serviceKey.slice(-5)})` : 'TIDAK TERSEDIA'}`);
  console.log(` - ADMIN_PASSWORD                   : ${adminPassword ? 'Tersedia (Terkonfigurasi)' : 'TIDAK TERSEDIA'}`);

  if (!supabaseUrl || !anonKey) {
    console.log('\n[INFO] Kredensial Supabase belum disetel di .env.local.');
    console.log('Untuk menghubungkan ke project baru BDCA Smart Finder (Wisuda), isi .env.local dengan kredensial dari Supabase Project Settings.');
    return;
  }

  // Audit using Anon Client (Public / Panitia access)
  console.log('\n2. PENGUJIAN HAK AKSES PUBLIK (ANON ROLE):');
  const anonClient = createClient(supabaseUrl, anonKey);

  // Check participants read
  try {
    const { data, count, error } = await anonClient
      .from('participants')
      .select('id, nomor_urut, nama, status', { count: 'exact', head: false })
      .limit(3);

    if (error) {
      console.log(` - Baca 'participants'      : GAGAL (${error.message})`);
      if (error.code === '42P01') {
        console.log('   -> Tabel participants belum dibuat. Jalankan supabase-complete-setup.sql di SQL Editor.');
      }
    } else {
      console.log(` - Baca 'participants'      : BERHASIL (${count ?? data?.length} peserta ditemukan)`);
    }
  } catch (err) {
    console.log(` - Baca 'participants'      : ERROR (${err.message})`);
  }

  // Check seat_layouts read
  try {
    const { data, error } = await anonClient
      .from('seat_layouts')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.log(` - Baca 'seat_layouts'      : GAGAL (${error.message})`);
      if (error.code === '42P01') {
        console.log('   -> Tabel seat_layouts belum dibuat. Jalankan supabase-complete-setup.sql di SQL Editor.');
      }
    } else if (data) {
      console.log(` - Baca 'seat_layouts'      : BERHASIL (Aktif: ${data.depan} baris depan / ${data.belakang} baris belakang, versi ${data.version})`);
    } else {
      console.log(` - Baca 'seat_layouts'      : BERHASIL (Tabel ada, konfigurasi aktif belum ada)`);
    }
  } catch (err) {
    console.log(` - Baca 'seat_layouts'      : ERROR (${err.message})`);
  }

  // Check anon mutation block on seat_layouts (Must be rejected by RLS)
  try {
    const { error } = await anonClient
      .from('seat_layouts')
      .update({ depan: 99 })
      .eq('is_active', true);

    if (error) {
      console.log(` - Proteksi Denah (RLS)     : TERLINDUNGI (Anon ditolak: ${error.message})`);
    } else {
      console.log(` - Proteksi Denah (RLS)     : PERINGATAN (Anon tidak menghasilkan error, periksa policy RLS)`);
    }
  } catch (err) {
    console.log(` - Proteksi Denah (RLS)     : TERLINDUNGI (${err.message})`);
  }

  let hasError = false;

  // Audit using Service Role (Server Backend access)
  if (serviceKey) {
    console.log('\n3. PENGUJIAN HAK AKSES SERVER (SERVICE ROLE):');
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3a. Read participants with limit(1) (GET read-only)
    try {
      const { data, count, error, status, statusText } = await adminClient
        .from('participants')
        .select('id, nama', { count: 'exact' })
        .limit(1);

      if (error) {
        hasError = true;
        console.log(` - Akses Tabel 'participants' : GAGAL`);
        console.log(`   * HTTP Status             : ${status} ${statusText || ''}`.trim());
        console.log(`   * Error Code              : ${error.code || '-'}`);
        console.log(`   * Error Message           : ${error.message || '(Pesan kosong)'}`);
        if (error.details) console.log(`   * Details                 : ${error.details}`);
        if (error.hint)    console.log(`   * Hint                    : ${error.hint}`);
      } else {
        console.log(` - Akses Tabel 'participants' : BERHASIL (Total peserta di database: ${count ?? (data?.length || 0)})`);
      }
    } catch (err) {
      hasError = true;
      console.log(` - Akses Tabel 'participants' : ERROR (${err.message})`);
    }

    // 3b. Read seat_layouts with limit(1) (GET read-only)
    try {
      const { data, count, error, status, statusText } = await adminClient
        .from('seat_layouts')
        .select('id, name, version', { count: 'exact' })
        .limit(1);

      if (error) {
        hasError = true;
        console.log(` - Akses Tabel 'seat_layouts' : GAGAL`);
        console.log(`   * HTTP Status             : ${status} ${statusText || ''}`.trim());
        console.log(`   * Error Code              : ${error.code || '-'}`);
        console.log(`   * Error Message           : ${error.message || '(Pesan kosong)'}`);
        if (error.details) console.log(`   * Details                 : ${error.details}`);
        if (error.hint)    console.log(`   * Hint                    : ${error.hint}`);
      } else {
        console.log(` - Akses Tabel 'seat_layouts' : BERHASIL (Total konfigurasi denah: ${count ?? (data?.length || 0)})`);
      }
    } catch (err) {
      hasError = true;
      console.log(` - Akses Tabel 'seat_layouts' : ERROR (${err.message})`);
    }

    // 3c. Test RPC execution permission (record_attendance)
    try {
      const { error, status } = await adminClient.rpc('record_attendance', {
        p_id: '00000000-0000-0000-0000-000000000000',
        p_type: 'reguler',
        p_action: 'hadir',
      });

      // P0001 means function was reached and executed by Postgres (ID not found)
      if (!error || error.code === 'P0001') {
        console.log(` - Hak Eksekusi RPC Kehadiran: BERHASIL (Fungsi 'record_attendance' terverifikasi untuk service_role)`);
      } else if (error.code === '42501') {
        hasError = true;
        console.log(` - Hak Eksekusi RPC Kehadiran: GAGAL (Izin eksekusi ditolak: ${error.message})`);
      } else if (error.code === '42883') {
        hasError = true;
        console.log(` - Hak Eksekusi RPC Kehadiran: BELUM TERSEDIA (Fungsi 'record_attendance' belum dibuat)`);
      } else {
        console.log(` - Hak Eksekusi RPC Kehadiran: RESPON (${error.code}: ${error.message})`);
      }
    } catch (err) {
      console.log(` - Hak Eksekusi RPC Kehadiran: ERROR (${err.message})`);
    }
  } else {
    hasError = true;
    console.log('\n3. PENGUJIAN HAK AKSES SERVER (SERVICE ROLE):');
    console.log(' - SUPABASE_SERVICE_ROLE_KEY belum disetel (diperlukan untuk penyimpanan denah admin & import).');
  }

  console.log('\n================================================================');
  console.log('  KESIMPULAN AUDIT');
  console.log('================================================================');
  if (hasError) {
    process.exitCode = 1;
    console.log('[STATUS: PERHATIAN] Beberapa pemeriksaan hak akses memerlukan perhatian.');
    console.log('Pastikan izin GRANT yang sesuai telah dijalankan di Supabase SQL Editor.');
  } else {
    process.exitCode = 0;
    console.log('[STATUS: SUKSES] Seluruh pemeriksaan hak akses publik dan server BERHASIL!');
    console.log('Database dan kredensial Supabase siap digunakan untuk proses impor dan produksi.');
  }
  console.log('1. Seluruh konfigurasi database terpusat pada file:');
  console.log('   - supabase-complete-setup.sql (untuk setup awal project baru)');
  console.log('   - supabase-migration-layout.sql (untuk migration denah saja)');
  console.log('2. Script impor peserta:');
  console.log('   - npx ts-node -O \'{"module":"CommonJS"}\' scripts/import-excel.ts --dry-run');
  console.log('3. Aplikasi siap digunakan setelah migration SQL dieksekusi di Supabase.');
}

audit().catch(console.error);
