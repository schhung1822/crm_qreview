/**
 * In-memory sliding-window rate limiter for API route handlers.
 *
 * Scope: one process. Behind several instances (PM2 cluster, autoscaled
 * containers, serverless) each instance keeps its own counters, so the
 * effective limit is `limit * instances`. That is still a hard ceiling on
 * abuse and needs no extra infrastructure. If you later move to multiple
 * instances and want an exact global limit, swap the store for Redis and
 * keep this signature.
 */

type Bucket = {
  hits: number[];
  blockedUntil: number;
};

const buckets = new Map<string, Bucket>();

// Stop the map from growing without bound when many distinct IPs hit the API.
const MAX_TRACKED_KEYS = 20_000;

export type RateLimitOptions = {
  /** Bucket name, so different endpoints do not share a budget. */
  name: string;
  /** Maximum number of requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * How long to keep rejecting once the limit is hit. Defaults to windowMs.
   * A longer value makes brute-force / flood attempts much more expensive.
   */
  blockMs?: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds the caller should wait before retrying. */
  retryAfter: number;
};

function pruneIfNeeded(now: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) {
    return;
  }

  // Array.from keeps this compatible with the project's es5 tsconfig target.
  for (const [key, bucket] of Array.from(buckets.entries())) {
    const lastHit = bucket.hits[bucket.hits.length - 1] ?? 0;

    if (bucket.blockedUntil < now && lastHit < now - 3_600_000) {
      buckets.delete(key);
    }
  }

  // Still oversized (a real flood): drop the oldest entries outright.
  if (buckets.size > MAX_TRACKED_KEYS) {
    const excess = buckets.size - MAX_TRACKED_KEYS;
    const keys = Array.from(buckets.keys());

    for (let index = 0; index < excess && index < keys.length; index += 1) {
      buckets.delete(keys[index]);
    }
  }
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const key = `${options.name}:${identifier}`;

  pruneIfNeeded(now);

  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((timestamp) => timestamp > windowStart);

  if (bucket.hits.length >= options.limit) {
    bucket.blockedUntil = now + (options.blockMs ?? options.windowMs);
    buckets.set(key, bucket);

    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    ok: true,
    remaining: options.limit - bucket.hits.length,
    retryAfter: 0,
  };
}
