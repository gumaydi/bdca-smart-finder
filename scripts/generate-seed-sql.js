const fs = require('fs');
const participants = JSON.parse(fs.readFileSync('participants.json', 'utf8'));

const { generateSeatAllocation } = require('./src/lib/seat-generator');

// The generateSeatAllocation expects RawParticipant (nomor_urut, nama, nim, prodi)
// participants.json already has these fields.

const allocated = generateSeatAllocation(participants);

let sql = 'INSERT INTO participants (nomor_urut, nama, nim, prodi, is_vip, seat_block, seat_row, seat_start, seat_end, seat_label, status) VALUES\n';

const values = allocated.map(p => {
  const escape = (val) => val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
  return `(${p.nomor_urut}, ${escape(p.nama)}, ${escape(p.nim)}, ${escape(p.prodi)}, ${p.is_vip}, ${p.seat_block || 'NULL'}, ${p.seat_row || 'NULL'}, ${p.seat_start || 'NULL'}, ${p.seat_end || 'NULL'}, ${escape(p.seat_label)}, 'belum_hadir')`;
});

sql += values.join(',\n') + ';';

fs.writeFileSync('seed_data.sql', sql);
