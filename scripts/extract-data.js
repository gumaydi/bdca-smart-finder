const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(process.cwd(), 'Denah - Daftar Peserta Wisudawan Mei 2026.xlsx');

function parseExcel() {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(JSON.stringify(data));
  } catch (error) {
    console.error('Error reading excel:', error);
    process.exit(1);
  }
}

parseExcel();
