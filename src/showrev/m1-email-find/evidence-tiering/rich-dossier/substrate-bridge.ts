/**
 * Substrate Bridge — single timeout-capped call into the search-substrate
 * edge function.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §4 step 11,
 * §6 (Edge cases: substrate >1.5s or 5xx → log warn, substrate=[], dossier
 * still returned).
 *
 * WHY a separate bridge module from substrate-query.ts:
 * substrate-query.ts has its own swallow-errors pattern but mixes industry +
 * company evidence retrieval. Phase A only needs ONE call per dossier for
 * generalized framing. Isolating it lets us enforce the 1.5s cap +
 * `empty_reason='timeout'` propagation cleanly.
 */

interface SubstrateRow {
  id: string;
  source: string;
  title: string;
  content: string;
  similarity?: number;
}

const TIMEOUT_MS = 1500; // §6: 1.5s cap

function supabaseConfig(): { url: string; key: string } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://slttpknnuthbttjuzrnz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

/**
 * Fetch industry/framing chunks from substrate.
 *
 * Returns `{ rows, timedOut }` so the orchestrator can set `empty_reason='timeout'`
 * IF substrate timed out AND no DB rows survived (§4 step 11 fallback).
 *
 * `externalSignal` (audit issue E): when the orchestrator's parallel DB query
 * fails, it aborts this in-flight fetch via a shared controller instead of
 * leaving it dangling for the full 1.5s.
 */
export async function fetchSubstrate(
  query: string,
  limit = 6,
  externalSignal?: AbortSignal,
): Promise<{ rows: SubstrateRow[]; timedOut: boolean }> {
  const { url, key } = supabaseConfig();
  if (!key) {
    return { rows: [], timedOut: false };
  }

  // AbortController gives a real 1.5s cap, not a "try to be nice" timeout.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Wire the external signal in too — if the orchestrator aborts (DB error),
  // we abort here as well.
  let externalAbortListener: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalAbortListener = () => controller.abort();
      externalSignal.addEventListener('abort', externalAbortListener);
    }
  }

  try {
    const res = await fetch(`${url}/functions/v1/search-substrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
    if (!res.ok) {
      console.warn(`[substrate-bridge] non-OK ${res.status} ${res.statusText} — degrading to empty`);
      return { rows: [], timedOut: false };
    }
    const data = (await res.json()) as { results?: SubstrateRow[] };
    return { rows: data.results || [], timedOut: false };
  } catch (err) {
    clearTimeout(t);
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
    const isAbort = (err as Error)?.name === 'AbortError';
    if (isAbort) {
      // Distinguish "we aborted internally" (true timeout) from "external
      // abort fired" (DB error race). The latter should not be reported as
      // a timeout.
      const externallyAborted = externalSignal?.aborted === true;
      if (!externallyAborted) {
        console.warn(`[substrate-bridge] timed out after ${TIMEOUT_MS}ms — degrading to empty`);
        return { rows: [], timedOut: true };
      }
      return { rows: [], timedOut: false };
    }
    console.warn(`[substrate-bridge] error: ${(err as Error).message} — degrading to empty`);
    return { rows: [], timedOut: false };
  }
}
