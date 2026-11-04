import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeProdiName } from '../src/lib/formatters.ts';

dotenv.config({ path: '.env.local' });

async function run() {
  console.log('================================================================');
  console.log('  NORMALISASI NAMA PROGRAM STUDI DI SUPABASE REMOTE');
  console.log('================================================================');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Kredensial Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) belum terkonfigurasi.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nMenghubungkan ke Supabase: ${new URL(supabaseUrl).host}`);

  // 1. Fetch current participants
  const { data: participants, error: fetchErr } = await supabase
    .from('participants')
    .select('id, nomor_urut, nama, nim, prodi, status, checked_in_at, is_vip, status_vip, checked_in_vip_at');

  if (fetchErr || !participants) {
    throw new Error(`Gagal mengambil data peserta: ${fetchErr?.message}`);
  }

  console.log(`Total peserta saat ini: ${participants.length} orang.`);
  if (participants.length !== 659) {
    throw new Error(`Jumlah peserta tidak sesuai: diharapkan 659, ditemukan ${participants.length}.`);
  }

  // 2. Identify distinct raw prodis
  const rawProdis = Array.from(new Set(participants.map(p => p.prodi).filter(Boolean))) as string[];
  console.log(`Ditemukan ${rawProdis.length} program studi unik.\n`);

  let totalUpdated = 0;
  let prodiCount = 0;

  for (const raw of rawProdis.sort()) {
    const clean = normalizeProdiName(raw);
    const affectedCount = participants.filter(p => p.prodi === raw).length;

    if (clean !== raw) {
      prodiCount++;
      console.log(`[${prodiCount}/21] Memperbarui: "${raw}" -> "${clean}" (${affectedCount} wisudawan)`);

      const { error: updateErr } = await supabase
        .from('participants')
        .update({ prodi: clean })
        .eq('prodi', raw);

      if (updateErr) {
        throw new Error(`Gagal update prodi "${raw}": ${updateErr.message}`);
      }

      totalUpdated += affectedCount;
    } else {
      console.log(`[OK] Sudah ternormalisasi: "${clean}" (${affectedCount} wisudawan)`);
    }
  }

  console.log(`\nSelesai memperbarui: ${totalUpdated} dari ${participants.length} peserta pada ${prodiCount} prodi.`);

  // 3. Verification directly from DB
  const { data: updatedParticipants, error: verifyErr } = await supabase
    .from('participants')
    .select('id, nomor_urut, nama, nim, prodi, status, is_vip');

  if (verifyErr || !updatedParticipants) {
    throw new Error(`Gagal verifikasi data pasca-update: ${verifyErr?.message}`);
  }

  const newProdis = Array.from(new Set(updatedParticipants.map(p => p.prodi)));
  const stillHasPrefix = newProdis.filter(p => /^program\s+studi/i.test(p || ''));

  console.log('\n--- HASIL VERIFIKASI PASCA-NORMALISASI ---');
  console.log(`Total Peserta Database    : ${updatedParticipants.length} orang (Diharapkan: 659)`);
  console.log(`Jumlah Program Studi Unik : ${newProdis.length} prodi (Diharapkan: 21)`);
  console.log(`Sisa Awalan 'Program Studi': ${stillHasPrefix.length} (Diharapkan: 0)`);

  if (stillHasPrefix.length > 0) {
    throw new Error(`Masih ditemukan prodi dengan awalan 'Program Studi': ${stillHasPrefix.join(', ')}`);
  }

  if (updatedParticipants.length !== 659 || newProdis.length !== 21) {
    throw new Error('Hasil verifikasi tidak sesuai ketentuan 659 peserta dan 21 prodi.');
  }

  console.log('\n[SUKSES] Seluruh 21 nama program studi berhasil dinormalisasi ke Title Case!');
}

run().catch((err) => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});
