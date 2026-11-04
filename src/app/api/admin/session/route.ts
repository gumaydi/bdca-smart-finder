import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_SECONDS, createAdminSession, passwordMatches, validAdminSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; until: number }>();
const options = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  return response({ authenticated: validAdminSession(request.cookies.get(ADMIN_COOKIE)?.value, process.env.ADMIN_PASSWORD), configured: Boolean(process.env.ADMIN_PASSWORD) });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return response({ error: 'Origin tidak diizinkan.' }, 403);
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return response({ error: 'ADMIN_PASSWORD belum diatur pada environment server.' }, 503);
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  attempts.forEach((entry, ip) => { if (entry.until <= now) attempts.delete(ip); });
  if (attempts.size > 10000 || (attempts.get(key)?.count ?? 0) >= 5) return response({ error: 'Terlalu banyak percobaan. Coba lagi setelah 15 menit.' }, 429);
  let input: unknown;
  try { input = await request.json(); } catch { return response({ error: 'Permintaan tidak valid.' }, 400); }
  const submitted = input && typeof input === 'object' && 'password' in input ? input.password : undefined;
  if (!passwordMatches(submitted, password)) {
    const current = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(key, { ...current, count: current.count + 1 });
    return response({ error: 'Password salah.' }, 401);
  }
  attempts.delete(key);
  const result = response({ authenticated: true });
  result.cookies.set(ADMIN_COOKIE, createAdminSession(password), { ...options, maxAge: SESSION_SECONDS });
  return result;
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return response({ error: 'Origin tidak diizinkan.' }, 403);
  const result = response({ authenticated: false });
  result.cookies.set(ADMIN_COOKIE, '', { ...options, maxAge: 0 });
  return result;
}
