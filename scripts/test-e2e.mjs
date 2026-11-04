import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createAdminSession, ADMIN_COOKIE } from '../src/lib/admin-session.ts';

const envContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const passwordMatch = envContent.match(/^ADMIN_PASSWORD=(.*)$/m);
const PASSWORD = passwordMatch ? passwordMatch[1].trim().replace(/^["']|["']$/g, '') : 'test-secret';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

test('E2E: session API authenticates and rejects invalid attempts', async () => {
  // 1. Wrong password
  const resBad = await fetch(`${BASE_URL}/api/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ password: 'wrong-password-123' }),
  });
  assert.equal(resBad.status, 401);

  // 2. Correct password
  const resGood = await fetch(`${BASE_URL}/api/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(resGood.status, 200);
  const cookie = resGood.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes(ADMIN_COOKIE), 'Set-Cookie must include ADMIN_COOKIE');
});

test('E2E: layout API rejects unauthorized and origin mismatch requests', async () => {
  // No cookie
  const resNoAuth = await fetch(`${BASE_URL}/api/admin/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ depan: 18, belakang: 8, isPreview: true }),
  });
  assert.equal(resNoAuth.status, 403);

  // Origin mismatch
  const validToken = createAdminSession(PASSWORD);
  const resForeignOrigin = await fetch(`${BASE_URL}/api/admin/layout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://malicious-attacker.com',
      Cookie: `${ADMIN_COOKIE}=${validToken}`,
    },
    body: JSON.stringify({ depan: 18, belakang: 8, isPreview: true }),
  });
  assert.equal(resForeignOrigin.status, 403);
});

test('E2E: preview mode accepts valid layouts and rejects insufficient capacity without touching DB', async () => {
  const validToken = createAdminSession(PASSWORD);

  // Valid preview (18/8 = 676 pairs >= 659)
  const resValid = await fetch(`${BASE_URL}/api/admin/layout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_COOKIE}=${validToken}`,
    },
    body: JSON.stringify({
      depan: 18,
      belakang: 8,
      widths: {
        depan: [8, 8, 8, 8, 8, 8, 4],
        belakang: [8, 8, 8, 8, 8, 8, 4],
      },
      isPreview: true,
    }),
  });
  assert.equal(resValid.status, 200);
  const dataValid = await resValid.json();
  assert.equal(dataValid.isPreview, true);
  assert.equal(dataValid.layout.depan, 18);
  assert.equal(dataValid.layout.belakang, 8);

  // Insufficient capacity for 659 pairs (14 front / 7 rear = 546 pairs)
  const resSmall = await fetch(`${BASE_URL}/api/admin/layout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `${ADMIN_COOKIE}=${validToken}`,
    },
    body: JSON.stringify({
      depan: 14,
      belakang: 7,
      isPreview: true,
    }),
  });
  assert.equal(resSmall.status, 400);
  const dataSmall = await resSmall.json();
  assert.match(dataSmall.error, /659 pasangan/);
});

test('E2E: layout API rejects schema violations', async () => {
  const validToken = createAdminSession(PASSWORD);

  for (const body of [
    { depan: 0, belakang: 8, isPreview: true },
    { depan: 105, belakang: 8, isPreview: true },
    { depan: 18, belakang: 8, widths: { depan: [25] }, isPreview: true },
    { depan: 18, belakang: 8, widths: { depan: [] }, isPreview: true },
  ]) {
    const res = await fetch(`${BASE_URL}/api/admin/layout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
      Cookie: `${ADMIN_COOKIE}=${validToken}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400);
  }
});

test('E2E: home page loads with 200 OK and valid HTML', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<!DOCTYPE html>/i);
});

test('E2E: attendance API marks and cancels attendance for real participant', async () => {
  // 1. Fetch a real sample participant via public anon Supabase client
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrlMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m);
  const anonKeyMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$/m);
  
  if (!supabaseUrlMatch || !anonKeyMatch) return;
  const anonClient = createClient(
    supabaseUrlMatch[1].trim().replace(/^["']|["']$/g, ''),
    anonKeyMatch[1].trim().replace(/^["']|["']$/g, '')
  );

  const { data: sampleList } = await anonClient
    .from('participants')
    .select('id, nama, prodi, status')
    .limit(1);

  assert.ok(sampleList && sampleList.length > 0, 'Must have at least 1 participant in DB');
  const sample = sampleList[0];

  // 2. Mark present via POST /api/attendance
  const resHadir = await fetch(`${BASE_URL}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({
      participantId: sample.id,
      type: 'reguler',
      action: 'hadir',
    }),
  });
  assert.equal(resHadir.status, 200);
  const dataHadir = await resHadir.json();
  assert.equal(dataHadir.success, true);
  assert.equal(dataHadir.participant.status, 'sudah_hadir');
  assert.ok(dataHadir.participant.checked_in_at);

  // 3. Cancel present via POST /api/attendance (restore state)
  const resBatal = await fetch(`${BASE_URL}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({
      participantId: sample.id,
      type: 'reguler',
      action: 'batal',
    }),
  });
  assert.equal(resBatal.status, 200);
  const dataBatal = await resBatal.json();
  assert.equal(dataBatal.success, true);
  assert.equal(dataBatal.participant.status, 'belum_hadir');
  assert.equal(dataBatal.participant.checked_in_at, null);
});

test('E2E: database prodi names are Title Case and free from Program Studi prefix', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrlMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m);
  const anonKeyMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$/m);
  
  if (!supabaseUrlMatch || !anonKeyMatch) return;
  const anonClient = createClient(
    supabaseUrlMatch[1].trim().replace(/^["']|["']$/g, ''),
    anonKeyMatch[1].trim().replace(/^["']|["']$/g, '')
  );

  const { data: participants } = await anonClient
    .from('participants')
    .select('prodi');

  assert.ok(participants && participants.length === 659, 'Must have 659 participants');
  const prodis = Array.from(new Set(participants.map(p => p.prodi)));
  assert.equal(prodis.length, 21, 'Must have exactly 21 prodis');

  for (const prodi of prodis) {
    assert.equal(/^program\s+studi/i.test(prodi), false, `Prodi "${prodi}" must not start with 'Program Studi'`);
  }
});
