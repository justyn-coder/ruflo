#!/usr/bin/env node
/**
 * scripts/backfill-source-date.ts — F4 (fix-sprint-2026-06-13-v2)
 *
 * Backfills sr_company_evidence.source_date for rows where it's NULL but the
 * source_citation URL carries a parseable date (YYYY/MM/DD or YYYY-MM-DD).
 *
 * Conservative scope: URL-extracted dates only (avoids false-precision risk
 * from claim-text regex extraction). Plan v2 estimated 30-50% of 1,288 null
 * rows have a URL-embedded date; this run measures the actual yield.
 *
 * Idempotent — only touches rows where source_date IS NULL. Safe to re-run.
 *
 * Audit: every UPDATE also sets source_date_backfilled_at = NOW(). Rollback
 * targets only those rows:
 *   UPDATE sr_company_evidence SET source_date=NULL, source_date_backfilled_at=NULL
 *   WHERE source_date_backfilled_at IS NOT NULL AND source_date_backfilled_at > '<run_ts>';
 *
 * Usage:
 *   npx tsx scripts/backfill-source-date.ts                 # dry run (default)
 *   npx tsx scripts/backfill-source-date.ts --apply         # actually write
 *   npx tsx scripts/backfill-source-date.ts --apply --limit=200
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SB_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) missing');
  process.exit(2);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = (() => {
  const a = args.find(s => s.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : 0;
})();
const CONCURRENCY = 20;
const PAGE_SIZE = 500;

console.log(`[backfill-source-date] APPLY=${APPLY} LIMIT=${LIMIT || 'none'}`);

interface Row { id: string; source_citation: string | null }

async function sbFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sbFetch ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  const prefer = (init.headers as Record<string, string> | undefined)?.['Prefer'] || '';
  if (/return=minimal/i.test(prefer)) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Extract a date from a URL's path. Common patterns:
 *   /2024/03/15/article-slug   → 2024-03-15
 *   /2024-03-15/foo            → 2024-03-15
 *   /2024/03/article-slug      → 2024-03-01 (month-only, day defaults to 01)
 *   /press-release/2024/foo    → 2024-01-01 (year-only)
 *   /news/2024-03/foo          → 2024-03-01
 *
 * Years are constrained to 2000-2099 to avoid false positives on numeric IDs.
 * Returns ISO timestamp (UTC) at midnight of the resolved day, or null if
 * no plausible date is found.
 */
export function extractDateFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  // YYYY/MM/DD or YYYY-MM-DD (most specific)
  const dmy = url.match(/(?<![\d])(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})(?![\d])/);
  if (dmy) {
    const [, y, m, d] = dmy;
    const yi = parseInt(y), mi = parseInt(m), di = parseInt(d);
    if (mi >= 1 && mi <= 12 && di >= 1 && di <= 31) {
      const iso = `${yi}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}T00:00:00Z`;
      return iso;
    }
  }

  // YYYY/MM or YYYY-MM
  const ym = url.match(/(?<![\d])(20\d{2})[\/\-](\d{1,2})(?![\d\/])/);
  if (ym) {
    const [, y, m] = ym;
    const yi = parseInt(y), mi = parseInt(m);
    if (mi >= 1 && mi <= 12) {
      return `${yi}-${String(mi).padStart(2, '0')}-01T00:00:00Z`;
    }
  }

  // /YYYY/ — bare year segment in path
  const yOnly = url.match(/\/(20\d{2})\//);
  if (yOnly) {
    const yi = parseInt(yOnly[1]);
    if (yi >= 2000 && yi <= 2099) return `${yi}-01-01T00:00:00Z`;
  }

  return null;
}

async function fetchPending(): Promise<Row[]> {
  const out: Row[] = [];
  let offset = 0;
  while (true) {
    const cap = LIMIT > 0 ? Math.min(PAGE_SIZE, LIMIT - out.length) : PAGE_SIZE;
    if (cap <= 0) break;
    const rows = await sbFetch<Row[]>(
      `/rest/v1/sr_company_evidence?select=id,source_citation` +
        `&source_date=is.null` +
        `&limit=${cap}&offset=${offset}`,
    );
    if (!rows || rows.length === 0) break;
    out.push(...rows);
    offset += rows.length;
    if (rows.length < cap) break;
    if (LIMIT > 0 && out.length >= LIMIT) break;
  }
  return out;
}

interface Update { id: string; date: string; precision: 'D' | 'M' | 'Y' }

async function applyUpdates(updates: Update[]): Promise<{ ok: number; failed: number }> {
  if (!APPLY || updates.length === 0) return { ok: 0, failed: 0 };
  const now = new Date().toISOString();
  let ok = 0, failed = 0;
  const queue = [...updates];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) break;
      try {
        await sbFetch(
          `/rest/v1/sr_company_evidence?id=eq.${encodeURIComponent(u.id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ source_date: u.date, source_date_backfilled_at: now }),
          },
        );
        ok++;
      } catch {
        failed++;
      }
    }
  }));
  return { ok, failed };
}

(async () => {
  try {
    const pending = await fetchPending();
    console.log(`[backfill-source-date] pending (source_date IS NULL): ${pending.length}`);

    const updates: Update[] = [];
    let urlWithDate = 0, urlWithMonth = 0, urlWithYear = 0, urlNoDate = 0;
    for (const r of pending) {
      const citation = r.source_citation || '';
      if (!/^https?:\/\//i.test(citation)) {
        urlNoDate++;
        continue;
      }
      const dateIso = extractDateFromUrl(citation);
      if (!dateIso) {
        urlNoDate++;
        continue;
      }
      // Classify precision by the trailing segments
      const precision: 'D' | 'M' | 'Y' =
        /^20\d{2}-\d{2}-\d{2}T00:00:00Z$/.test(dateIso) && !dateIso.endsWith('-01-01T00:00:00Z') && !dateIso.endsWith('-01T00:00:00Z')
          ? 'D'
          : dateIso.endsWith('-01T00:00:00Z') && !dateIso.endsWith('-01-01T00:00:00Z')
          ? 'M'
          : 'Y';
      updates.push({ id: r.id, date: dateIso, precision });
      if (precision === 'D') urlWithDate++;
      else if (precision === 'M') urlWithMonth++;
      else urlWithYear++;
    }

    console.log(`[backfill-source-date] extractable: ${updates.length} of ${pending.length} (${(updates.length / Math.max(1, pending.length) * 100).toFixed(1)}%)`);
    console.log(`  day-precision:   ${urlWithDate}`);
    console.log(`  month-precision: ${urlWithMonth}`);
    console.log(`  year-only:       ${urlWithYear}`);
    console.log(`  no-date / non-URL: ${urlNoDate}`);

    // Sample
    if (updates.length > 0) {
      console.log(`[backfill-source-date] sample (first 8):`);
      for (const u of updates.slice(0, 8)) {
        console.log(`  ${u.id}  ${u.precision}  ${u.date}`);
      }
    }

    if (!APPLY) {
      console.log(`[backfill-source-date] DRY RUN — no rows written. Pass --apply.`);
      return;
    }

    console.log(`[backfill-source-date] applying ${updates.length} PATCH updates ...`);
    const t0 = Date.now();
    const { ok, failed } = await applyUpdates(updates);
    const t1 = Date.now();
    console.log(`[backfill-source-date] DONE in ${((t1 - t0) / 1000).toFixed(1)}s — ${ok} ok, ${failed} failed`);
  } catch (e: any) {
    console.error('[backfill-source-date] FATAL:', e.message || e);
    process.exit(1);
  }
})();
