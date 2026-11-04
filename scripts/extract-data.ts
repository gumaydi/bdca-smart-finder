import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'Denah - Daftar Peserta Wisudawan Mei 2026.xlsx');

function parseExcel() {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error reading excel:', error);
    process.exit(1);
  }
}

parseExcel();
