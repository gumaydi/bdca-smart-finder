import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProdiName } from '../src/lib/formatters.ts';
import { parseExcelFile } from './import-excel.ts';

test('normalizeProdiName: strips prefix and converts ALL CAPS to Title Case while preserving degrees', () => {
  // Case 1: ALL CAPS with prefix and degree
  assert.equal(normalizeProdiName('PROGRAM STUDI BAHASA INDONESIA'), 'Bahasa Indonesia');
  assert.equal(normalizeProdiName('PROGRAM STUDI ILMU KOMUNIKASI - S2'), 'Ilmu Komunikasi - S2');
  assert.equal(normalizeProdiName('PROGRAM STUDI MANAJEMEN - S2'), 'Manajemen - S2');
  assert.equal(normalizeProdiName('PROGRAM STUDI PENDIDIKAN JASMANI - S2'), 'Pendidikan Jasmani - S2');
  assert.equal(normalizeProdiName('PROGRAM STUDI TEKNIK INDUSTRI'), 'Teknik Industri');
  assert.equal(normalizeProdiName('PROGRAM STUDI TEKNIK INFORMATIKA - S2'), 'Teknik Informatika - S2');
  assert.equal(normalizeProdiName('PROGRAM STUDI TEKNIK SIPIL - S2'), 'Teknik Sipil - S2');

  // Case 2: Title Case with prefix and degree
  assert.equal(normalizeProdiName('Program Studi Administrasi Bisnis (DIII)'), 'Administrasi Bisnis (DIII)');
  assert.equal(normalizeProdiName('Program Studi Akuntansi (S1)'), 'Akuntansi (S1)');
  assert.equal(normalizeProdiName('Program Studi Pengelolaan Perhotelan (D IV)'), 'Pengelolaan Perhotelan (D IV)');
  assert.equal(normalizeProdiName('Program Studi Sistem Informasi (S1)'), 'Sistem Informasi (S1)');
  assert.equal(normalizeProdiName('Program Studi Teknik Komputer (DIII)'), 'Teknik Komputer (DIII)');
  assert.equal(normalizeProdiName('Program Studi Teknik Sipil (S1)'), 'Teknik Sipil (S1)');

  // Case 3: Punctuation separators
  assert.equal(normalizeProdiName('Program Studi : Teknik Informatika'), 'Teknik Informatika');
  assert.equal(normalizeProdiName('Program Studi - Sistem Informasi'), 'Sistem Informasi');

  // Case 4: Already clean or empty
  assert.equal(normalizeProdiName(''), '');
  assert.equal(normalizeProdiName(null), '');
  assert.equal(normalizeProdiName('Teknik Mesin (S1)'), 'Teknik Mesin (S1)');
});

test('Excel parser with normalization produces exactly 21 unique prodis and 659 wisudawan', () => {
  const participants = parseExcelFile('./DAFTAR PANGGIL DAN NOMOR KURSI.xlsx');
  assert.equal(participants.length, 659);

  const uniqueProdis = Array.from(new Set(participants.map(p => p.prodi)));
  assert.equal(uniqueProdis.length, 21);

  // Ensure no prodi starts with 'Program Studi'
  for (const prodi of uniqueProdis) {
    assert.equal(/^program\s+studi/i.test(prodi), false, `Prodi "${prodi}" must not start with 'Program Studi'`);
  }

  // Ensure different degrees are not merged
  assert.ok(uniqueProdis.includes('Teknik Sipil (S1)'));
  assert.ok(uniqueProdis.includes('Teknik Sipil - S2'));
  assert.ok(uniqueProdis.includes('Manajemen (S1)'));
  assert.ok(uniqueProdis.includes('Manajemen - S2'));
  assert.ok(uniqueProdis.includes('Ilmu Komunikasi (S1)'));
  assert.ok(uniqueProdis.includes('Ilmu Komunikasi - S2'));
  assert.ok(uniqueProdis.includes('Teknik Informatika (S1)'));
  assert.ok(uniqueProdis.includes('Teknik Informatika - S2'));
});
