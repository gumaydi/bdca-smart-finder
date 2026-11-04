import { getAdminSupabaseClient } from '../../../lib/supabase/admin.ts';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limiter.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    // 1. Origin / CSRF verification
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return Response.json({ error: 'Origin mismatch: Forbidden' }, { status: 403 });
        }
      } catch {
        return Response.json({ error: 'Invalid origin header' }, { status: 403 });
      }
    }

    // 2. Serverless Rate Limiting (Abuse & Bot Protection)
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(clientIp, 25, 10); // 25 requests per 10s
    if (!rateLimit.success) {
      return Response.json(
        { error: 'Terlalu banyak permintaan. Silakan tunggu beberapa detik.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    }

    // 3. Strict Payload Parsing & Single-Item Validation
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Format JSON tidak valid' }, { status: 400 });
    }

    // Explicitly reject arrays or batch requests to prevent mass updates
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Permintaan harus berupa objek tunggal untuk satu peserta (pembaruan massal dilarang)' },
        { status: 400 }
      );
    }

    const { participantId, type, action } = body as Record<string, unknown>;

    // Validate single participantId
    if (typeof participantId !== 'string' || !UUID_REGEX.test(participantId)) {
      return Response.json(
        { error: 'ID peserta (participantId) harus berupa format UUID yang valid' },
        { status: 400 }
      );
    }

    // Validate invitation type
    if (type !== 'reguler' && type !== 'vip') {
      return Response.json(
        { error: "Jenis undangan (type) tidak valid. Harus 'reguler' atau 'vip'." },
        { status: 400 }
      );
    }

    // Validate attendance action
    if (action !== 'hadir' && action !== 'batal') {
      return Response.json(
        { error: "Tindakan kehadiran (action) tidak valid. Harus 'hadir' atau 'batal'." },
        { status: 400 }
      );
    }

    // 4. Server Execution using Service Role Key
    const supabase = getAdminSupabaseClient();

    // Call database stored function record_attendance
    const { data: rpcData, error: rpcError } = await supabase.rpc('record_attendance', {
      p_id: participantId,
      p_type: type,
      p_action: action,
    });

    if (!rpcError && rpcData) {
      return Response.json({
        success: true,
        participant: rpcData,
      });
    }

    // If RPC function is not yet present on remote DB (fallback to direct service-role mutation)
    if (rpcError && (rpcError.code === '42883' || rpcError.message.includes('does not exist'))) {
      const { data: participant, error: fetchErr } = await supabase
        .from('participants')
        .select('*')
        .eq('id', participantId)
        .maybeSingle();

      if (fetchErr || !participant) {
        return Response.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
      }

      if (type === 'vip' && !participant.is_vip) {
        return Response.json(
          { error: 'Peserta bukan VIP. Kehadiran VIP hanya untuk peserta berstatus VIP.' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const updateData = type === 'vip'
        ? {
            status_vip: action === 'hadir' ? 'sudah_hadir' : 'belum_hadir',
            checked_in_vip_at: action === 'hadir' ? now : null,
          }
        : {
            status: action === 'hadir' ? 'sudah_hadir' : 'belum_hadir',
            checked_in_at: action === 'hadir' ? now : null,
          };

      const { data: updated, error: updateErr } = await supabase
        .from('participants')
        .update(updateData)
        .eq('id', participantId)
        .select()
        .single();

      if (updateErr) {
        return Response.json({ error: updateErr.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        participant: updated,
      });
    }

    if (rpcError) {
      const isClientError = rpcError.message.includes('bukan VIP') || rpcError.message.includes('tidak ditemukan');
      return Response.json(
        { error: rpcError.message },
        { status: isClientError ? 400 : 500 }
      );
    }

    return Response.json({ success: true, participant: rpcData });
  } catch (err) {
    console.error('Attendance API Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
