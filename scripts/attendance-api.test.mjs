import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/attendance/route.ts';

function makeRequest(body, headers = {}) {
  return new Request('http://localhost:3000/api/attendance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: 'localhost:3000',
      Origin: 'http://localhost:3000',
      'X-Forwarded-For': '192.168.1.100',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('Attendance API: Input validation and security checks', async (t) => {
  await t.test('1. Rejects batch/array payload (mass UPDATE prevention)', async () => {
    const req = makeRequest([
      { participantId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', type: 'reguler', action: 'hadir' },
    ]);
    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /pembaruan massal dilarang/i);
  });

  await t.test('2. Rejects non-UUID participantId', async () => {
    const req = makeRequest({
      participantId: 'not-a-valid-uuid-1234',
      type: 'reguler',
      action: 'hadir',
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /format UUID yang valid/i);
  });

  await t.test('3. Rejects invalid invitation type', async () => {
    const req = makeRequest({
      participantId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      type: 'vvip_extra',
      action: 'hadir',
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Harus 'reguler' atau 'vip'/i);
  });

  await t.test('4. Rejects invalid action', async () => {
    const req = makeRequest({
      participantId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      type: 'reguler',
      action: 'hapus_peserta',
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Harus 'hadir' atau 'batal'/i);
  });

  await t.test('5. Rejects Origin mismatch (CSRF protection)', async () => {
    const req = makeRequest(
      {
        participantId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        type: 'reguler',
        action: 'hadir',
      },
      {
        Origin: 'https://evil-attacker-website.com',
      }
    );
    const res = await POST(req);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Origin mismatch/i);
  });

  await t.test('6. Rate limiting enforces single-IP abuse prevention and returns 429', async () => {
    const floodIp = '10.0.0.99';
    let hitRateLimit = false;

    // Suppress expected backend connection logs during rate limit flooding test
    const origError = console.error;
    console.error = () => {};

    try {
      // Send 30 rapid requests (threshold is 25 per 10s)
      for (let i = 0; i < 30; i++) {
        const req = makeRequest(
          {
            participantId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
            type: 'reguler',
            action: 'hadir',
          },
          {
            'X-Forwarded-For': floodIp,
          }
        );
        const res = await POST(req);
        if (res.status === 429) {
          hitRateLimit = true;
          const retryAfter = res.headers.get('Retry-After');
          assert.ok(retryAfter, '429 response must include Retry-After header');
          break;
        }
      }
    } finally {
      console.error = origError;
    }

    assert.equal(hitRateLimit, true, 'Rate limiter must trigger 429 after exceeding 25 requests');
  });
});
