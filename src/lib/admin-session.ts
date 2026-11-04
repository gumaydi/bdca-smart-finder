import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'seat_admin_session';
export const SESSION_SECONDS = 3600;

function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function passwordMatches(input: unknown, password: string) {
  if (typeof input !== 'string' || input.length > 1024 || !password) return false;
  const digest = (value: string) => createHmac('sha256', password).update(value).digest('hex');
  return same(digest(input), digest(password));
}

export function createAdminSession(password: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const signature = createHmac('sha256', password).update(`seat-admin:${expires}`).digest('hex');
  return `${expires}.${signature}`;
}

export function validAdminSession(token: string | undefined, password: string | undefined, now = Date.now()) {
  if (!token || !password) return false;
  const [expires, signature, extra] = token.split('.');
  const seconds = Number(expires);
  if (extra || !signature || !Number.isInteger(seconds) || seconds <= Math.floor(now / 1000) || seconds > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  const expected = createHmac('sha256', password).update(`seat-admin:${expires}`).digest('hex');
  return same(signature, expected);
}
