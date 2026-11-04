interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

interface WindowData {
  tokens: number[];
  lastCleanup: number;
}

// In-memory sliding window cache with automatic expiration
const windowMap = new Map<string, WindowData>();
const MAX_ENTRIES = 10000;

function cleanupOldEntries(now: number, windowMs: number) {
  if (windowMap.size > MAX_ENTRIES) {
    for (const [key, data] of windowMap.entries()) {
      if (now - data.lastCleanup > windowMs * 2) {
        windowMap.delete(key);
      }
    }
  }
}

/**
 * Extracts client IP address reliably from incoming request headers
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  
  // Cloudflare
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // Vercel / Standard reverse proxy
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Nginx / general reverse proxy
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}

/**
 * Serverless-compatible sliding window rate limiter.
 * Default: 20 requests per 10 seconds per client IP.
 */
export async function checkRateLimit(
  key: string,
  limit: number = 20,
  windowSeconds: number = 10
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Optional: Upstash Redis integration if configured in serverless environment
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const redisKey = `ratelimit:attendance:${key}`;
      // Execute Redis EVAL script or INCR with EXPIRE
      const response = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, windowSeconds],
        ]),
      });

      if (response.ok) {
        const results = await response.json();
        const count = results[0]?.result ?? 1;
        const remaining = Math.max(0, limit - count);
        return {
          success: count <= limit,
          limit,
          remaining,
          resetMs: windowMs,
        };
      }
    } catch (err) {
      console.warn('Upstash rate limit error, falling back to local window:', err);
    }
  }

  // Standard sliding window rate limiter
  cleanupOldEntries(now, windowMs);

  let data = windowMap.get(key);
  if (!data) {
    data = { tokens: [], lastCleanup: now };
    windowMap.set(key, data);
  }

  // Filter out tokens older than current window
  const windowStart = now - windowMs;
  data.tokens = data.tokens.filter(timestamp => timestamp > windowStart);
  data.lastCleanup = now;

  if (data.tokens.length >= limit) {
    const oldest = data.tokens[0] ?? now;
    const resetMs = Math.max(0, oldest + windowMs - now);
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    };
  }

  data.tokens.push(now);
  const remaining = limit - data.tokens.length;

  return {
    success: true,
    limit,
    remaining,
    resetMs: windowMs,
  };
}
