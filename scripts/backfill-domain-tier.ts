#!/usr/bin/env node
/**
 * scripts/backfill-domain-tier.ts — F3.d (fix-sprint-2026-06-13-v2)
 *
 * One-time backfill: classify the URL/citation of every existing row in
 * sr_company_evidence + sr_brain_substrate and write the result into
 * domain_tier + domain_tier_set_at.
 *
 * Idempotent — only touches rows where domain_tier IS NULL. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-domain-tier.ts                  # dry run (default)
 *   npx tsx scripts/backfill-domain-tier.ts --apply          # actually write
 *   npx tsx scripts/backfill-domain-tier.ts --apply --limit=200    # cap rows
 *   npx tsx scripts/backfill-domain-tier.ts --apply --evidence-only
 *   npx tsx scripts/backfill-domain-tier.ts --apply --substrate-only
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL (defaults to slttpknnuthbttjuzrnz)
 *   SUPABASE_SERVICE_ROLE_KEY (preferred; falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
// Load .env from m1-email-find (existing convention) THEN repo-root as fallback.
loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

import { classifyDomainTier } from '../src/showrev/m1-email-find/verify-facts.js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SB_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) not found in env.');
  console.error('       Looked in: <repo>/src/showrev/m1-email-find/.env and <repo>/.env');
  process.exit(2);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const EVIDENCE_ONLY = args.includes('--evidence-only');
const SUBSTRATE_ONLY = args.includes('--substrate-only');
const LIMIT = (() => {
  const a = args.find(s => s.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : 0;
})();
const CONCURRENCY = 20;
const PAGE_SIZE = 500;

console.log(`[backfill-domain-tier] APPLY=${APPLY} EVIDENCE_ONLY=${EVIDENCE_ONLY} SUBSTRATE_ONLY=${SUBSTRATE_ONLY} LIMIT=${LIMIT || 'none'}`);
console.log(`[backfill-domain-tier] target=${SB_URL}`);

interface EvidenceRow { id: string; source_citation: string | null }
interface SubstrateRow { id: string; url: string | null }

async function sbFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sbFetch ${res.status} ${res.statusText} ${path}: ${text.slice(0, 200)}`);
  }
  // PATCH/Prefer:return=minimal returns empty body
  const prefer = (init.headers as Record<string, string> | undefined)?.['Prefer'] || '';
  if (/return=minimal/i.test(prefer)) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Page through rows where domain_tier IS NULL. Returns a flat list of all
 * pending rows (capped by --limit if provided).
 */
async function fetchPending<T>(
  table: 'sr_company_evidence' | 'sr_brain_substrate',
  idColumn: 'id',
  urlColumn: 'source_citation' | 'url',
): Promise<Array<T & { id: string; _url: string | null }>> {
  const out: Array<T & { id: string; _url: string | null }> = [];
  let offset = 0;
  while (true) {
    const cap = LIMIT > 0 ? Math.min(PAGE_SIZE, LIMIT - out.length) : PAGE_SIZE;
    if (cap <= 0) break;
    const rows = await sbFetch<any[]>(
      `/rest/v1/${table}?select=${idColumn},${urlColumn}` +
        `&domain_tier=is.null` +
        `&limit=${cap}&offset=${offset}`,
    );
    if (!rows || rows.length === 0) break;
    for (const r of rows) out.push({ ...r, _url: r[urlColumn] ?? null });
    offset += rows.length;
    if (rows.length < cap) break;
    if (LIMIT > 0 && out.length >= LIMIT) break;
  }
  return out;
}

interface PerRowUpdate { id: string; tier: 'T1' | 'T2' | 'T3' | 'T4' | 'PROHIBITED'; url: string | null }

/**
 * Issue PATCH per row with concurrency control. Returns count of successful
 * updates + the failures.
 */
async function applyUpdates(
  table: 'sr_company_evidence' | 'sr_brain_substrate',
  updates: PerRowUpdate[],
): Promise<{ ok: number; failed: { id: string; err: string }[] }> {
  if (!APPLY) return { ok: 0, failed: [] };
  const now = new Date().toISOString();
  let ok = 0;
  const failed: { id: string; err: string }[] = [];

  const queue = [...updates];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) break;
      try {
        await sbFetch(
          `/rest/v1/${table}?id=eq.${encodeURIComponent(u.id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ domain_tier: u.tier, domain_tier_set_at: now }),
          },
        );
        ok++;
      } catch (e: any) {
        failed.push({ id: u.id, err: e.message?.slice(0, 200) || String(e) });
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

function summarize(updates: PerRowUpdate[]): Record<string, number> {
  const counts: Record<string, number> = { T1: 0, T2: 0, T3: 0, T4: 0, PROHIBITED: 0 };
  for (const u of updates) counts[u.tier] = (counts[u.tier] || 0) + 1;
  return counts;
}

async function backfillTable(
  label: string,
  table: 'sr_company_evidence' | 'sr_brain_substrate',
  urlColumn: 'source_citation' | 'url',
): Promise<void> {
  console.log(`\n[${label}] fetching pending rows (domain_tier IS NULL) ...`);
  const rows = await fetchPending<EvidenceRow | SubstrateRow>(table, 'id', urlColumn);
  console.log(`[${label}] pending rows: ${rows.length}`);

  if (rows.length === 0) return;

  const updates: PerRowUpdate[] = rows.map(r => ({
    id: r.id,
    url: r._url,
    tier: classifyDomainTier(r._url || ''),
  }));

  const counts = summarize(updates);
  console.log(`[${label}] classifier tally:`);
  for (const tier of ['T1', 'T2', 'T3', 'T4', 'PROHIBITED'] as const) {
    console.log(`           ${tier.padEnd(11)} ${counts[tier]}`);
  }

  // Show a sample of PROHIBITED rows for operator audit (always — even in dry run)
  const prohibited = updates.filter(u => u.tier === 'PROHIBITED');
  if (prohibited.length > 0) {
    console.log(`[${label}] PROHIBITED sample (up to 10):`);
    for (const p of prohibited.slice(0, 10)) {
      console.log(`           ${p.id}  ${p.url}`);
    }
  }

  if (!APPLY) {
    console.log(`[${label}] DRY RUN — no rows written. Pass --apply to mutate.`);
    return;
  }

  console.log(`[${label}] applying ${updates.length} PATCH updates (concurrency=${CONCURRENCY}) ...`);
  const t0 = Date.now();
  const { ok, failed } = await applyUpdates(table, updates);
  const t1 = Date.now();
  console.log(`[${label}] DONE in ${((t1 - t0) / 1000).toFixed(1)}s — ${ok} ok, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log(`[${label}] first 5 failures:`);
    for (const f of failed.slice(0, 5)) console.log(`           ${f.id} → ${f.err}`);
  }
}

(async () => {
  try {
    if (!SUBSTRATE_ONLY) {
      await backfillTable('sr_company_evidence', 'sr_company_evidence', 'source_citation');
    }
    if (!EVIDENCE_ONLY) {
      await backfillTable('sr_brain_substrate', 'sr_brain_substrate', 'url');
    }
    console.log('\n[backfill-domain-tier] complete.');
  } catch (e: any) {
    console.error('[backfill-domain-tier] FATAL:', e.message || e);
    process.exit(1);
  }
})();
