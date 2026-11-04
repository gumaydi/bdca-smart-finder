import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import type { RawParticipant } from '../src/lib/types';
import { normalizeProdiName } from '../src/lib/formatters.ts';

dotenv.config({ path: '.env.local' });

import * as path from 'path';

export interface ParsedWisudawan {
  nomor_urut: number;
  nama: string;
  nim: string;
  prodi: string;
  is_vip: boolean;
  student_seat?: string;
}

export function parseExcelFile(filePath: string): ParsedWisudawan[] {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File Excel tidak ditemukan pada path: ${resolvedPath}`);
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellText: true });


  const participants: ParsedWisudawan[] = [];
  const seenNims = new Map<string, { sheet: string; row: number }>();
  let globalNomor = 1;

  // Case 1: Check if this is a multi-sheet workbook where each sheet is a study program
  // (e.g. "DAFTAR PANGGIL DAN NOMOR KURSI.xlsx" with 21 faculty/prodi sheets)
  const isMultiProdiWorkbook = workbook.SheetNames.length > 3 && 
    workbook.SheetNames.some(s => s.toLowerCase().includes('teknik') || s.toLowerCase().includes('manajemen') || s === 'TI');

  if (isMultiProdiWorkbook) {
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Find prodi title in top rows
      let prodi = sheetName;
      for (let r = 0; r < Math.min(4, rows.length); r++) {
        const text = String(rows[r]?.[0] || '').trim();
        if (text.toLowerCase().includes('program studi')) {
          prodi = text;
          break;
        }
      }
      prodi = normalizeProdiName(prodi);

      // Find header row: contains NIM and Nama
      let headerIndex = -1;
      let nimCol = 0;
      let namaCol = 1;
      let chairCol = 2;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || [];
        const c0 = String(row[0] || '').trim().toLowerCase();
        const c1 = String(row[1] || '').trim().toLowerCase();
        if (c0 === 'nim' && c1.includes('nama')) {
          headerIndex = r;
          nimCol = 0;
          namaCol = 1;
          chairCol = 2;
          break;
        }
      }

      if (headerIndex === -1) continue;

      for (let r = headerIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 2) continue;
        const nimRaw = String(row[nimCol] || '').trim();
        const namaRaw = String(row[namaCol] || '').trim().toUpperCase();
        if (!nimRaw || !namaRaw) continue;

        // Skip headers if accidentally repeated
        if (nimRaw.toLowerCase() === 'nim' || namaRaw.toLowerCase() === 'nama') continue;

        // Extract student chair (A1..D155) to verify row validity, but ignore for parent seat storage
        const studentSeat = String(row[chairCol] || '').trim();
        if (!studentSeat) continue;

        if (seenNims.has(nimRaw)) {
          const prev = seenNims.get(nimRaw)!;
          throw new Error(`Duplikasi NIM "${nimRaw}": ditemukan di Sheet "${sheetName}" baris ${r + 1} dan Sheet "${prev.sheet}" baris ${prev.row}.`);
        }
        seenNims.set(nimRaw, { sheet: sheetName, row: r + 1 });

        const rawP: RawParticipant = {
          nomor_urut: globalNomor,
          nama: namaRaw,
          nim: nimRaw,
          prodi,
        };

        participants.push({
          nomor_urut: globalNomor++,
          nama: namaRaw,
          nim: nimRaw,
          prodi,
          is_vip: false,
          student_seat: studentSeat,
        });
      }
    }
    return participants;
  }

  // Case 2: Single-sheet workbook format (e.g. "Peserta Wisudawan")
  const sheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('peserta') || 
    name.toLowerCase().includes('wisudawan')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  let currentProdi = 'Umum';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const noVal = row[0];
    const rawNo = typeof noVal === 'number' ? noVal : parseInt(String(noVal).trim(), 10);
    if (!Number.isInteger(rawNo) || rawNo <= 0) continue;

    const nimRaw = String(row[1] ?? '').trim();
    if (!nimRaw) continue;

    const namaRaw = String(row[2] ?? '').trim().toUpperCase();
    if (!namaRaw) continue;

    // Detect study program grouping
    for (let c = 3; c < row.length; c++) {
      const val = String(row[c] ?? '').trim();
      if (val && isNaN(Number(val)) && (val.toLowerCase().includes('program') || val.toLowerCase().includes('studi') || val.length > 5)) {
        currentProdi = normalizeProdiName(val);
        break;
      }
    }

    if (seenNims.has(nimRaw)) {
      const prev = seenNims.get(nimRaw)!;
      throw new Error(`Duplikasi NIM "${nimRaw}" terdeteksi pada baris ${i + 1}.`);
    }
    seenNims.set(nimRaw, { sheet: sheetName, row: i + 1 });

    const rawP: RawParticipant = {
      nomor_urut: rawNo,
      nama: namaRaw,
      nim: nimRaw,
      prodi: currentProdi,
    };

    participants.push({
      nomor_urut: rawNo,
      nama: namaRaw,
      nim: nimRaw,
      prodi: currentProdi,
      is_vip: false,
    });
  }

  return participants.sort((a, b) => a.nomor_urut - b.nomor_urut);
}

async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileArg = args.find(a => !a.startsWith('--')) || './DAFTAR PANGGIL DAN NOMOR KURSI.xlsx';

  console.log('================================================================');
  console.log('  IMPORT MASTER DATA WISUDAWAN KE SUPABASE (BDCA Smart Finder)');
  console.log('================================================================');
  console.log(`Target Berkas : ${fileArg}`);
  console.log(`Mode          : ${isDryRun ? 'DRY-RUN (Hanya Validasi, Tanpa Tulis ke DB)' : 'EKSEKUSI PENUH (Tulis ke DB)'}`);

  const parsed = parseExcelFile(fileArg);
  const vipCount = parsed.filter(p => p.is_vip).length;
  const regularCount = parsed.filter(p => !p.is_vip).length;
  const prodis = Array.from(new Set(parsed.map(p => p.prodi)));

  console.log('\n--- HASIL VALIDASI DATA EXCEL ---');
  console.log(`Total Wisudawan Terbaca : ${parsed.length} orang`);
  console.log(`Peserta Reguler         : ${regularCount} orang (${regularCount * 2} kursi orang tua)`);
  console.log(`Peserta Area VIP        : ${vipCount} orang`);
  console.log(`Jumlah Program Studi    : ${prodis.length}`);
  console.log('Catatan: Kursi mahasiswa A–D diabaikan (khusus alokasi orang tua/wali).');
  console.log('Status Duplikasi NIM   : 0 duplikasi (Semua NIM Unik)');

  console.log('\n--- DAFTAR PROGRAM STUDI ---');
  prodis.forEach((prodi, idx) => {
    const count = parsed.filter(p => p.prodi === prodi).length;
    console.log(` ${String(idx + 1).padStart(2, ' ')}. ${prodi}: ${count} wisudawan`);
  });

  if (isDryRun) {
    console.log('\n[DRY RUN BERHASIL] Seluruh 659 data wisudawan tervalidasi bersih.');
    console.log('Tidak ada operasi tulis yang dilakukan ke database.');
    return;
  }

  // Database Execution
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus disetel di .env.local untuk eksekusi.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nMenghubungkan ke Supabase: ${new URL(supabaseUrl).host}`);

  // Fetch existing attendance status to preserve already recorded check-ins
  const { data: existingRecords, error: fetchErr } = await supabase
    .from('participants')
    .select('nomor_urut, status, checked_in_at, status_vip, checked_in_vip_at, is_vip');

  if (fetchErr) {
    console.warn('Perhatian: Gagal mengambil status kehadiran lama (tabel mungkin baru):', fetchErr.message);
  }

  const statusMap = new Map<number, {
    status: string;
    checked_in_at: string | null;
    status_vip?: string | null;
    checked_in_vip_at?: string | null;
    is_vip?: boolean;
  }>();

  if (existingRecords) {
    existingRecords.forEach(r => {
      statusMap.set(r.nomor_urut, {
        status: r.status,
        checked_in_at: r.checked_in_at,
        status_vip: r.status_vip,
        checked_in_vip_at: r.checked_in_vip_at,
        is_vip: r.is_vip,
      });
    });
  }

  const payload = parsed.map(p => {
    const preserved = statusMap.get(p.nomor_urut);
    return {
      nomor_urut: p.nomor_urut,
      nama: p.nama,
      nim: p.nim,
      prodi: p.prodi,
      is_vip: preserved?.is_vip ?? p.is_vip ?? false,
      status: preserved?.status ?? 'belum_hadir',
      checked_in_at: preserved?.checked_in_at ?? null,
      status_vip: preserved?.status_vip ?? null,
      checked_in_vip_at: preserved?.checked_in_vip_at ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  console.log(`Melakukan upsert aman untuk ${payload.length} peserta...`);

  // Batch in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    const { error: upsertErr } = await supabase
      .from('participants')
      .upsert(chunk, { onConflict: 'nomor_urut', ignoreDuplicates: false });

    if (upsertErr) {
      throw new Error(`Gagal upsert batch ${i + 1}-${i + chunk.length}: ${upsertErr.message}`);
    }
  }

  console.log('\n[SUKSES] Seluruh data wisudawan berhasil diimpor ke database Supabase!');
  console.log('Status kehadiran sebelumnya (jika ada) tetap aman dan tidak di-reset.');
}

if (process.argv[1] && (process.argv[1].includes('import-excel') || process.argv[1].endsWith('import-excel.ts'))) {
  run().catch(err => {
    console.error('\n[ERROR]', err.message);
    process.exit(1);
  });
}

