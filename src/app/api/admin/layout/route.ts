import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, validAdminSession } from '@/lib/admin-session';
import { layoutCapacity, layoutPairCapacity, validateLayout } from '@/lib/seat-generator';
import type { SeatLayout } from '@/lib/seat-generator';
import { getActiveLayoutServer, getRegularParticipantsCountServer, saveActiveLayoutServer } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== request.nextUrl.origin
  ) {
    return NextResponse.json({ error: 'Origin tidak diizinkan.' }, { status: 403 });
  }

  if (!validAdminSession(request.cookies.get(ADMIN_COOKIE)?.value, process.env.ADMIN_PASSWORD)) {
    return NextResponse.json({ error: 'Login admin diperlukan.' }, { status: 403 });
  }

  try {
    const config = await getActiveLayoutServer();
    return NextResponse.json({ config }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengambil konfigurasi aktif.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (
    request.headers.get('origin') !== request.nextUrl.origin ||
    !validAdminSession(request.cookies.get(ADMIN_COOKIE)?.value, process.env.ADMIN_PASSWORD)
  ) {
    return NextResponse.json({ error: 'Login admin diperlukan.' }, { status: 403 });
  }

  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== 'object') {
      throw new Error('Pengaturan tidak valid.');
    }

    const inputObj = input as Record<string, unknown>;
    const isPreview = inputObj.isPreview === true;
    const expectedVersion = typeof inputObj.version === 'number' ? inputObj.version : undefined;

    // Support both direct layout payload { depan, belakang, widths } and nested { layout: { ... } }
    const rawLayout = (inputObj.layout && typeof inputObj.layout === 'object' ? inputObj.layout : inputObj) as Record<string, unknown>;

    if (
      typeof rawLayout.depan !== 'number' ||
      typeof rawLayout.belakang !== 'number'
    ) {
      throw new Error('Jumlah baris depan dan belakang harus diisi.');
    }

    const layout: SeatLayout = {
      depan: rawLayout.depan,
      belakang: rawLayout.belakang,
    };

    if ('widths' in rawLayout && rawLayout.widths && typeof rawLayout.widths === 'object') {
      const widths = rawLayout.widths as Record<string, unknown>;
      if (
        !Array.isArray(widths.depan) ||
        !Array.isArray(widths.belakang) ||
        !widths.depan.every((n: unknown) => typeof n === 'number') ||
        !widths.belakang.every((n: unknown) => typeof n === 'number')
      ) {
        throw new Error('Lebar blok tidak valid.');
      }
      layout.widths = {
        depan: widths.depan as number[],
        belakang: widths.belakang as number[],
      };
    }

    validateLayout(layout);
    const pairCapacity = layoutPairCapacity(layout);

    // Simulation mode: validate against sample count without touching Supabase
    if (isPreview) {
      if (pairCapacity < 659) {
        throw new Error('Denah simulasi harus menampung 659 pasangan peserta.');
      }
      return NextResponse.json({ layout, isPreview: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Production mode: validate against actual database participant count
    let regularCount = 0;
    try {
      regularCount = await getRegularParticipantsCountServer();
    } catch (countErr: unknown) {
      console.warn('Could not query regular participant count for validation:', countErr);
    }

    if (regularCount > 0 && pairCapacity < regularCount) {
      return NextResponse.json(
        {
          error: `Tidak dapat diterapkan: Kapasitas denah (${pairCapacity} pasangan / ${pairCapacity * 2} kursi) tidak mencukupi untuk ${regularCount} peserta reguler di database.`,
        },
        { status: 400 }
      );
    }

    // Save atomically to Supabase with optimistic locking
    const savedConfig = await saveActiveLayoutServer(layout, expectedVersion, 'admin');

    return NextResponse.json(
      {
        layout,
        config: savedConfig,
        version: savedConfig.version,
        success: true,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const errorStatus = (err as { status?: number })?.status ?? 400;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pengaturan tidak valid.' },
      { status: errorStatus }
    );
  }
}
