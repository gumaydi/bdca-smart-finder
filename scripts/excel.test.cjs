const assert = require('node:assert/strict');
const { test } = require('node:test');
const XLSX = require('xlsx');

test('Excel preserves names, NIM strings with leading zeros, and program names', () => {
  const rows = [{ nomor_urut: 1, nama: 'Peserta Contoh', nim: '001234', prodi: 'Program Contoh' }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Peserta');
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const restored = XLSX.read(data, { type: 'buffer' });
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Peserta), rows);
});
