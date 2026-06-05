/**
 * million-verifier.ts
 *
 * MillionVerifier API wrapper for final email verification before HubSpot load.
 * Single-email and batch verification.
 *
 * API: https://api.millionverifier.com/api/v3/
 * Pricing: pay-per-verification (no monthly fee).
 */

export interface MillionVerifierResult {
  email: string;
  quality: 'good' | 'catch_all' | 'unknown' | 'bad' | 'disposable';
  result: string;
  free: boolean;
  role: boolean;
  subresult: string;
  didYouMean: string | null;
}

export interface MillionVerifierOptions {
  apiKey: string;
  timeoutMs?: number;
}

const MV_SINGLE_URL = 'https://api.millionverifier.com/api/v3/';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Verify a single email address via MillionVerifier API.
 */
export async function verifyEmailMV(
  email: string,
  options?: MillionVerifierOptions,
): Promise<MillionVerifierResult> {
  const apiKey = options?.apiKey || process.env.MILLIONVERIFIER_API_KEY;
  if (!apiKey) {
    return {
      email,
      quality: 'unknown',
      result: 'no-api-key',
      free: false,
      role: false,
      subresult: 'missing_key',
      didYouMean: null,
    };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const url = `${MV_SINGLE_URL}?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;

    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.log(`[million-verifier] API error ${res.status}: ${errText.slice(0, 200)}`);
      return {
        email,
        quality: 'unknown',
        result: `http-${res.status}`,
        free: false,
        role: false,
        subresult: errText.slice(0, 100),
        didYouMean: null,
      };
    }

    const data = await res.json() as any;

    const quality = mapQuality(data.quality || data.result);
    console.log(`[million-verifier] ${email}: quality=${quality}, result=${data.result}, subresult=${data.subresult || 'n/a'}`);

    return {
      email,
      quality,
      result: data.result || 'unknown',
      free: data.free === true,
      role: data.role === true,
      subresult: data.subresult || '',
      didYouMean: data.did_you_mean || null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[million-verifier] Error for ${email}: ${msg}`);
    return {
      email,
      quality: 'unknown',
      result: 'error',
      free: false,
      role: false,
      subresult: msg.slice(0, 100),
      didYouMean: null,
    };
  }
}

function mapQuality(raw: string): MillionVerifierResult['quality'] {
  const lower = (raw || '').toLowerCase();
  if (lower === 'good' || lower === 'ok') return 'good';
  if (lower === 'catch_all' || lower === 'catch-all') return 'catch_all';
  if (lower === 'bad' || lower === 'invalid') return 'bad';
  if (lower === 'disposable') return 'disposable';
  return 'unknown';
}

/**
 * Verify a batch of emails. Runs sequentially with a small delay to respect rate limits.
 */
export async function verifyBatchMV(
  emails: string[],
  options?: MillionVerifierOptions & { delayMs?: number },
): Promise<MillionVerifierResult[]> {
  const delayMs = options?.delayMs ?? 500;
  const results: MillionVerifierResult[] = [];

  for (let i = 0; i < emails.length; i++) {
    const result = await verifyEmailMV(emails[i], options);
    results.push(result);

    if (i < emails.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Summarize batch verification results.
 */
export function summarizeMVResults(results: MillionVerifierResult[]): {
  total: number;
  good: number;
  catchAll: number;
  bad: number;
  unknown: number;
  disposable: number;
  deliverableRate: string;
} {
  let good = 0, catchAll = 0, bad = 0, unknown = 0, disposable = 0;
  for (const r of results) {
    switch (r.quality) {
      case 'good': good++; break;
      case 'catch_all': catchAll++; break;
      case 'bad': bad++; break;
      case 'disposable': disposable++; break;
      default: unknown++; break;
    }
  }
  const total = results.length;
  const deliverable = good + catchAll;
  const rate = total > 0 ? ((deliverable / total) * 100).toFixed(1) : '0.0';
  return { total, good, catchAll, bad, unknown, disposable, deliverableRate: `${rate}%` };
}
