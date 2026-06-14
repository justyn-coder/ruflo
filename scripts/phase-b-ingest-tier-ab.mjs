#!/usr/bin/env node
// Phase B — ingest internal Inorsa-AE + Chris + Nick + deck + booth substrate
// as Tier A/B rows in sr_brain_substrate.
//
// Per data-strategy-synthesis-2026-06-14.md (judge panel 98.6/100) §5.1 step 2
// + handoff §"Architectural finding": internal substrate lives in canonical
// FILES, not in DB. This script materializes them into the DB so the composer's
// FTS retrieval path can find them.
//
// Idempotent on `url`. Re-running updates content + metadata in place.
//
// Usage:
//   node scripts/phase-b-ingest-tier-ab.mjs --dry-run
//   node scripts/phase-b-ingest-tier-ab.mjs --apply

import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SB_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.');
  process.exit(2);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const MANIFEST_PATH = resolve(__dirname, '../data/showrev/forensic-2026-06-13-claude/phase-b-tier-ab-manifest.json');

console.log(`[phase-b] APPLY=${APPLY} DRY_RUN=${DRY_RUN}`);
console.log(`[phase-b] manifest=${MANIFEST_PATH}`);
console.log(`[phase-b] target=${SB_URL}`);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const entries = manifest.entries;
console.log(`[phase-b] entries=${entries.length}`);

async function sbFetch(path, init = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`sbFetch ${res.status} ${path}: ${txt.slice(0, 250)}`);
  }
  const prefer = (init.headers || {})['Prefer'] || '';
  if (/return=minimal/i.test(prefer)) return null;
  return res.json();
}

function buildRow(entry) {
  const now = new Date().toISOString();
  return {
    source: entry.source,
    title: entry.title,
    url: entry.url,
    content: entry.content,
    char_count: entry.content.length,
    metadata: entry.metadata || {},
    inorsa_scope_tier: entry.tier,
    inorsa_scope_tier_method: 'phase-b-ingest',
    inorsa_scope_tier_rationale: `phase-b-ingest 2026-06-14: ${entry.title}`,
    inorsa_scope_tier_set_at: now,
  };
}

async function findExisting(url) {
  const path = `/rest/v1/sr_brain_substrate?url=eq.${encodeURIComponent(url)}&select=id`;
  const rows = await sbFetch(path);
  return rows && rows[0] ? rows[0].id : null;
}

async function insertRow(row) {
  await sbFetch('/rest/v1/sr_brain_substrate', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
}

async function updateRow(id, row) {
  await sbFetch(`/rest/v1/sr_brain_substrate?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      title: row.title,
      content: row.content,
      char_count: row.char_count,
      metadata: row.metadata,
      inorsa_scope_tier: row.inorsa_scope_tier,
      inorsa_scope_tier_method: row.inorsa_scope_tier_method,
      inorsa_scope_tier_rationale: row.inorsa_scope_tier_rationale,
      inorsa_scope_tier_set_at: row.inorsa_scope_tier_set_at,
    }),
  });
}

async function main() {
  const counts = { A: 0, B: 0, inserted: 0, updated: 0, skipped: 0 };
  const bySource = new Map();

  for (const entry of entries) {
    const row = buildRow(entry);
    counts[entry.tier]++;
    bySource.set(entry.source, (bySource.get(entry.source) || 0) + 1);

    if (DRY_RUN) {
      counts.skipped++;
      continue;
    }

    const existing = await findExisting(entry.url);
    if (existing) {
      await updateRow(existing, row);
      counts.updated++;
    } else {
      await insertRow(row);
      counts.inserted++;
    }
  }

  console.log('\n[phase-b] === SUMMARY ===');
  console.log(`[phase-b] Tier A=${counts.A}  Tier B=${counts.B}`);
  console.log(`[phase-b] inserted=${counts.inserted}  updated=${counts.updated}  skipped(dry-run)=${counts.skipped}`);
  console.log('[phase-b] by source:');
  for (const [k, v] of [...bySource.entries()].sort()) console.log(`         ${k}: ${v}`);

  if (DRY_RUN) {
    console.log('\n[phase-b] DRY_RUN — re-run with --apply to write.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
