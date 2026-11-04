import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSession, validAdminSession, passwordMatches, SESSION_SECONDS } from '../src/lib/admin-session.ts';

const fixture = 'test-only-password-fixture';
const now = 1800000000000;
test('only matching passwords authenticate and absent configuration fails closed', () => {
  assert.equal(passwordMatches(fixture, fixture), true);
  for (const input of ['wrong', '', null, {}, 42, 'x'.repeat(1025)]) assert.equal(passwordMatches(input, fixture), false);
  assert.equal(passwordMatches('', ''), false);
  assert.equal(validAdminSession(undefined, fixture, now), false);
  assert.equal(validAdminSession(createAdminSession(fixture, now), undefined, now), false);
});
test('signed sessions expire, reject tampering, and are invalidated by password rotation', () => {
  const token = createAdminSession(fixture, now);
  assert.equal(validAdminSession(token, fixture, now), true);
  assert.equal(validAdminSession(token, fixture, now + SESSION_SECONDS * 1000), false);
  assert.equal(validAdminSession(`${token}extra`, fixture, now), false);
  assert.equal(validAdminSession(`${token}.extra`, fixture, now), false);
  assert.equal(validAdminSession(token, 'different-test-fixture', now), false);
  assert.equal(validAdminSession(createAdminSession(fixture, now + 100000), fixture, now), false);
  for (const malformed of ['', 'undefined', 'NaN.signature', '1.signature', '.']) assert.equal(validAdminSession(malformed, fixture, now), false);
});
