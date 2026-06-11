/**
 * HubSpot API client wrapper — proactive throttling + 429 decision tree.
 *
 * Foundation for spec v6 Components 1, 2, 5, 6. Replaces raw `fetch` in
 * hubspot-loader.ts + watcher.ts. Records rate-limit headers after every
 * call to sr_hs_api_calls for observability. Distinguishes burst-limit
 * 429s (wait + retry) from daily-limit 429s (defer).
 *
 * Reference: docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md Q1, Q15.
 */

const HS_API_BASE = 'https://api.hubapi.com';
const PROACTIVE_THROTTLE_THRESHOLD = 30; // sleep if remaining < this
const PROACTIVE_THROTTLE_SLEEP_MS = 2000;
const MAX_RETRIES = 5;

export interface RateLimitInfo {
  remaining: number | null;
  max: number | null;
  intervalMs: number | null;
  dailyRemaining: number | null;
}

export interface HsApiResponse<T = unknown> {
  status: number;
  data: T;
  rateLimits: RateLimitInfo;
}

export class HsDailyLimitError extends Error {
  rateLimits: RateLimitInfo;
  policyName: string;
  constructor(message: string, rateLimits: RateLimitInfo, policyName: string) {
    super(message);
    this.name = 'HsDailyLimitError';
    this.rateLimits = rateLimits;
    this.policyName = policyName;
  }
}

export class HsApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'HsApiError';
    this.status = status;
    this.body = body;
  }
}

function getToken(): string {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not set');
  return token;
}

function parseInt_(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function extractRateLimits(headers: Headers): RateLimitInfo {
  return {
    remaining: parseInt_(headers.get('X-HubSpot-RateLimit-Remaining')),
    max: parseInt_(headers.get('X-HubSpot-RateLimit-Max')),
    intervalMs: parseInt_(headers.get('X-HubSpot-RateLimit-Interval-Milliseconds')),
    dailyRemaining: parseInt_(headers.get('X-HubSpot-RateLimit-Daily-Remaining')),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// In-memory cache of last-seen rate limit (refreshed every API call).
// Used to proactively throttle BEFORE issuing the next request.
let lastSeenRemaining: number | null = null;

async function logApiCall(args: {
  endpoint: string;
  method: string;
  status: number;
  rateLimits: RateLimitInfo;
  retryCount: number;
  policyHit: string | null;
}): Promise<void> {
  // Fire-and-forget — don't block API calls on logging failures.
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!sbUrl || !sbKey) return;
    await fetch(`${sbUrl}/rest/v1/sr_hs_api_calls`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        endpoint: args.endpoint,
        method: args.method,
        status_code: args.status,
        rate_limit_remaining: args.rateLimits.remaining,
        rate_limit_max: args.rateLimits.max,
        rate_limit_interval_ms: args.rateLimits.intervalMs,
        daily_remaining: args.rateLimits.dailyRemaining,
        retry_count: args.retryCount,
        policy_hit: args.policyHit,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Make a HubSpot API call with rate-limit-aware retry.
 *
 * @throws HsDailyLimitError if the daily limit is exhausted. Caller must
 *   defer until midnight portal time zone (US/Eastern).
 * @throws HsApiError on non-429 non-2xx responses. Includes status + body.
 */
export async function hsApi<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<HsApiResponse<T>> {
  // Proactive throttle: if last call returned low remaining, sleep first.
  if (lastSeenRemaining !== null && lastSeenRemaining < PROACTIVE_THROTTLE_THRESHOLD) {
    await sleep(PROACTIVE_THROTTLE_SLEEP_MS);
  }

  const url = `${HS_API_BASE}${path}`;
  const token = getToken();
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const rateLimits = extractRateLimits(res.headers);
    lastSeenRemaining = rateLimits.remaining;

    // Some endpoints (404 on missing resources, etc.) return HTML or empty
    // bodies. Guard the JSON parse so we don't throw on text responses.
    const contentType = res.headers.get('Content-Type') || '';
    let data: unknown = null;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      data = text ? { __nonJsonBody: text.slice(0, 500) } : null;
    }

    if (res.status === 429) {
      const dataAny = data as { policyName?: string; message?: string } | null;
      const policyName = dataAny?.policyName || dataAny?.message || '';
      const isDaily = /daily/i.test(policyName);
      const policyHit = isDaily ? 'daily' : 'burst';
      await logApiCall({ endpoint: path, method, status: 429, rateLimits, retryCount, policyHit });

      if (isDaily) {
        throw new HsDailyLimitError(
          `HubSpot daily limit hit on ${path}: ${policyName}`,
          rateLimits,
          policyName,
        );
      }

      // Burst: wait window + jitter, retry
      const baseWait = rateLimits.intervalMs ?? 10000;
      const jitter = 250 + Math.floor(Math.random() * 750);
      const waitMs = baseWait + jitter + retryCount * 1000; // mild backoff on repeats
      await sleep(waitMs);
      retryCount++;
      continue;
    }

    await logApiCall({ endpoint: path, method, status: res.status, rateLimits, retryCount, policyHit: null });

    if (!res.ok) {
      throw new HsApiError(
        `HubSpot ${method} ${path}: ${res.status}`,
        res.status,
        data,
      );
    }

    return { status: res.status, data: data as T, rateLimits };
  }

  throw new HsApiError(`HubSpot ${method} ${path}: 429 retry limit (${MAX_RETRIES}) exceeded`, 429, null);
}

/**
 * Read the last-seen rate limit remaining (for monitoring widgets, etc.).
 * null if no call has been made yet.
 */
export function getLastSeenRemaining(): number | null {
  return lastSeenRemaining;
}

/**
 * Reset the in-memory rate-limit cache (test utility — not for production).
 */
export function _resetRateLimitCache(): void {
  lastSeenRemaining = null;
}
