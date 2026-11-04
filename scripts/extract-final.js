const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Denah - Daftar Peserta Wisudawan Mei 2026.xlsx');

function extract() {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets['Peserta Wisudawan'];
  const rawData = XLSX.utils.sheet_to_json(sheet);
  
  let currentProdi = '';
  const participants = rawData.map(row => {
    if (row['__EMPTY']) {
      currentProdi = row['__EMPTY'];
    }
    
    return {
      nomor_urut: row['No'],
      nama: row['Nama']?.trim(),
      nim: String(row['NIM'] || '').trim(),
      prodi: currentProdi
    };
  }).filter(p => p.nomor_urut && p.nama);
  
  console.log(JSON.stringify(participants));
}

extract();
