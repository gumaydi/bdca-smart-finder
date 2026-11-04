const fs = require('fs');

const VIP_LIST = [
  { nomor_urut: 10, nama: 'Luh Hari Susanti' },
  { nomor_urut: 50, nama: 'Maya Anggita' },
  { nomor_urut: 83, nama: 'Nabila Shalasyifa' },
  { nomor_urut: 97, nama: 'Natasa Otivanka' },
  { nomor_urut: 124, nama: 'Fitri Yaldo' },
  { nomor_urut: 164, nama: 'Muhammad Asywat' },
  { nomor_urut: 196, nama: 'Fina Junianti' },
];

function isVip(p) {
  return VIP_LIST.some(v => v.nomor_urut === p.nomor_urut || v.nama.toLowerCase() === p.nama.toLowerCase());
}

const participants = JSON.parse(fs.readFileSync('participants.json', 'utf8'));
const sortedParticipants = [...participants].sort((a, b) => a.nomor_urut - b.nomor_urut);

let regularSeatIndex = 0;
const allocated = [];

for (const p of sortedParticipants) {
  const vip = isVip(p);
  if (vip) {
    allocated.push({
      ...p,
      is_vip: true,
      seat_block: null,
      seat_row: null,
      seat_start: null,
      seat_end: null,
      seat_label: 'Area VIP'
    });
  } else {
    const block = Math.floor(regularSeatIndex / 30) + 1;
    const indexInBlock = regularSeatIndex % 30;
    const row = Math.floor(indexInBlock / 3) + 1;
    const pairIndex = indexInBlock % 3;
    const seatStart = pairIndex * 2 + 1;
    const seatEnd = seatStart + 1;

    allocated.push({
      ...p,
      is_vip: false,
      seat_block: block,
      seat_row: row,
      seat_start: seatStart,
      seat_end: seatEnd,
      seat_label: `Blok ${block} - Baris ${row} - Kursi ${seatStart}-${seatEnd}`
    });
    regularSeatIndex++;
  }
}

let sql = 'DELETE FROM participants; INSERT INTO participants (nomor_urut, nama, nim, prodi, is_vip, seat_block, seat_row, seat_start, seat_end, seat_label, status) VALUES\n';

const values = allocated.map(p => {
  const escape = (val) => (val === null || val === undefined) ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
  return `(${p.nomor_urut}, ${escape(p.nama)}, ${escape(p.nim)}, ${escape(p.prodi)}, ${p.is_vip}, ${p.seat_block || 'NULL'}, ${p.seat_row || 'NULL'}, ${p.seat_start || 'NULL'}, ${p.seat_end || 'NULL'}, ${escape(p.seat_label)}, 'belum_hadir')`;
});

sql += values.join(',\n') + ';';

fs.writeFileSync('seed_data.sql', sql);
console.log('Generated seed_data.sql with ' + allocated.length + ' entries.');
