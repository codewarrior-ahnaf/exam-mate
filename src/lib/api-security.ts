import "server-only";

const isProduction = process.env.NODE_ENV === "production";

function getAllowedOrigins(): Set<string> {
  const configuredOrigins = isProduction
    ? [
        process.env.BETTER_AUTH_URL,
        process.env.FRONTEND_ORIGIN,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL,
      ]
    : [
        process.env.BETTER_AUTH_URL,
        process.env.FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];

  return new Set(
    configuredOrigins.flatMap((value) => {
      if (!value) return [];
      try {
        const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        return [new URL(normalized).origin];
      } catch {
        return [];
      }
    })
  );
}

/** Reject cross-site browser requests before they reach authenticated mutations. */
export function isTrustedMutationRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      return getAllowedOrigins().has(new URL(originHeader).origin);
    } catch {
      return false;
    }
  }

  // Fallback to Referer header if origin is not present
  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      return getAllowedOrigins().has(new URL(refererHeader).origin);
    } catch {
      return false;
    }
  }

  return false;
}

/** Extract client IP address for logging and rate-limiting */
export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  return "127.0.0.1";
}

type RateLimitRecord = {
  timestamps: number[];
};

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * In-memory sliding-window rate limiter.
 * Automatically evicts old entries to preserve memory.
 */
export function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60 * 1000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Remove timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((t) => t > cutoff);

  if (record.timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.timestamps.push(now);
  return { allowed: true, remaining: limit - record.timestamps.length };
}

// Cleanup stale keys every 5 minutes
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > now - 5 * 60 * 1000);
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}
