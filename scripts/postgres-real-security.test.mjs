import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL WASM Engine: Verify RLS, GRANTs, Constraints, and Anti-Tamper Triggers', async (t) => {
  const db = new PGlite();

  // 1. Prepare Supabase standard roles
  await db.exec(`
    do $$
    begin
      if not exists (select from pg_roles where rolname = 'anon') then
        create role anon;
      end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
      if not exists (select from pg_roles where rolname = 'service_role') then
        create role service_role;
      end if;
    end $$;
  `);

  try {
    await db.exec('create publication supabase_realtime;');
  } catch (e) {
    // Publication might already exist or mock
  }

  // 2. Execute exact supabase-complete-setup.sql migration script
  const migrationSql = fs.readFileSync('supabase-complete-setup.sql', 'utf8');
  await db.exec(migrationSql);

  // 3. Seed test participants
  await db.exec(`
    insert into participants (nomor_urut, nama, nim, prodi, is_vip)
    values (1, 'Budi Santoso (Reguler)', 'NIM001', 'Teknik Informatika', false);

    insert into participants (nomor_urut, nama, nim, prodi, is_vip, status_vip, vip_seat_label)
    values (2, 'Dewi Lestari (VIP)', 'NIM002', 'Sistem Informasi', true, 'belum_hadir', 'Area VIP Khusus');
  `);

  const initialRows = await db.query('select * from participants order by nomor_urut');
  const regParticipant = initialRows.rows[0];
  const vipParticipant = initialRows.rows[1];
  const initialUpdatedAt = regParticipant.updated_at;

  await t.test('1. Direct UPDATE on participants by anon is completely blocked (permission denied)', async () => {
    await db.exec('set role anon;');
    try {
      await db.exec("update participants set status = 'sudah_hadir'");
      assert.fail('Anon direct UPDATE must be blocked');
    } catch (err) {
      assert.match(err.message, /permission denied/i);
    } finally {
      await db.exec('reset role;');
    }
  });

  await t.test('2. Direct EXECUTE of record_attendance() by anon is rejected (permission denied)', async () => {
    await db.exec('set role anon;');
    try {
      await db.query("select record_attendance($1, 'reguler', 'hadir')", [regParticipant.id]);
      assert.fail('Anon RPC call must be rejected');
    } catch (err) {
      assert.match(err.message, /permission denied for function record_attendance/i);
    } finally {
      await db.exec('reset role;');
    }
  });

  await t.test('3. Service role can execute record_attendance() for regular check-in and auto-updates updated_at', async () => {
    await db.exec('set role service_role;');
    const res = await db.query("select record_attendance($1, 'reguler', 'hadir')", [regParticipant.id]);
    const updated = res.rows[0].record_attendance;
    
    assert.equal(updated.status, 'sudah_hadir');
    assert.ok(updated.checked_in_at);
    assert.notEqual(updated.updated_at, initialUpdatedAt);
    await db.exec('reset role;');
  });

  await t.test('4. VIP check-in succeeds for VIP participant', async () => {
    await db.exec('set role service_role;');
    const res = await db.query("select record_attendance($1, 'vip', 'hadir')", [vipParticipant.id]);
    const updated = res.rows[0].record_attendance;

    assert.equal(updated.status_vip, 'sudah_hadir');
    assert.ok(updated.checked_in_vip_at);
    await db.exec('reset role;');
  });

  await t.test('5. Regular and VIP attendance statuses are strictly independent', async () => {
    const res = await db.query('select status, status_vip from participants where id = $1', [vipParticipant.id]);
    const row = res.rows[0];
    
    // Regular invitation for VIP remains 'belum_hadir'
    assert.equal(row.status, 'belum_hadir');
    // VIP invitation for VIP is 'sudah_hadir'
    assert.equal(row.status_vip, 'sudah_hadir');

    // Now check in regular ticket for VIP
    await db.exec('set role service_role;');
    await db.query("select record_attendance($1, 'reguler', 'hadir')", [vipParticipant.id]);
    await db.exec('reset role;');

    const resBoth = await db.query('select status, status_vip from participants where id = $1', [vipParticipant.id]);
    assert.equal(resBoth.rows[0].status, 'sudah_hadir');
    assert.equal(resBoth.rows[0].status_vip, 'sudah_hadir');

    // Cancel VIP ticket only
    await db.exec('set role service_role;');
    await db.query("select record_attendance($1, 'vip', 'batal')", [vipParticipant.id]);
    await db.exec('reset role;');

    const resVipCancelled = await db.query('select status, status_vip from participants where id = $1', [vipParticipant.id]);
    assert.equal(resVipCancelled.rows[0].status, 'sudah_hadir'); // regular unaffected!
    assert.equal(resVipCancelled.rows[0].status_vip, 'belum_hadir');
  });

  await t.test('6. VIP check-in on non-VIP participant is strictly rejected', async () => {
    await db.exec('set role service_role;');
    try {
      await db.query("select record_attendance($1, 'vip', 'hadir')", [regParticipant.id]);
      assert.fail('VIP check-in on non-VIP must be rejected');
    } catch (err) {
      assert.match(err.message, /Peserta bukan VIP/i);
    } finally {
      await db.exec('reset role;');
    }
  });

  await t.test('7. Database CHECK constraint rejects non-VIP having active VIP attendance', async () => {
    try {
      // Direct insertion/update violating consistency
      await db.exec(`
        insert into participants (nomor_urut, nama, is_vip, status_vip)
        values (99, 'Hacker Fake VIP', false, 'sudah_hadir');
      `);
      assert.fail('CHECK constraint must reject active VIP status on non-VIP');
    } catch (err) {
      assert.match(err.message, /chk_vip_attendance_consistency/i);
    }
  });

  await t.test('8. Admin promoting participant to VIP automatically initializes status_vip without altering regular status', async () => {
    // Budi has status = 'sudah_hadir'
    await db.query('update participants set is_vip = true where id = $1', [regParticipant.id]);
    
    const res = await db.query('select is_vip, status, status_vip, vip_seat_label from participants where id = $1', [regParticipant.id]);
    const row = res.rows[0];

    assert.equal(row.is_vip, true);
    assert.equal(row.status, 'sudah_hadir'); // regular status preserved!
    assert.equal(row.status_vip, 'belum_hadir'); // initialized!
    assert.equal(row.vip_seat_label, 'Area VIP Khusus');
  });

  await t.test('9. Re-importing Excel data preserves existing attendance status', async () => {
    const existing = await db.query('select nomor_urut, status, checked_in_at, status_vip, checked_in_vip_at, is_vip from participants');
    const statusMap = new Map();
    existing.rows.forEach(r => statusMap.set(r.nomor_urut, r));

    const reimportPayload = [
      { nomor_urut: 1, nama: 'Budi Santoso M.Kom (Nama Dikoreksi)', nim: 'NIM001', prodi: 'TI' },
    ];

    for (const p of reimportPayload) {
      const prev = statusMap.get(p.nomor_urut);
      await db.query(`
        insert into participants (nomor_urut, nama, nim, prodi, is_vip, status, checked_in_at, status_vip, checked_in_vip_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (nomor_urut) do update
        set nama = excluded.nama,
            prodi = excluded.prodi,
            updated_at = now()
      `, [
        p.nomor_urut, p.nama, p.nim, p.prodi,
        prev.is_vip, prev.status, prev.checked_in_at, prev.status_vip, prev.checked_in_vip_at
      ]);
    }

    const res = await db.query('select nomor_urut, nama, status, status_vip, is_vip from participants where nomor_urut = 1');
    assert.equal(res.rows[0].nama, 'Budi Santoso M.Kom (Nama Dikoreksi)');
    assert.equal(res.rows[0].status, 'sudah_hadir'); // preserved!
    assert.equal(res.rows[0].status_vip, 'belum_hadir'); // preserved!
  });
});
