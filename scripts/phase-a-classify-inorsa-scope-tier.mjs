#!/usr/bin/env node
// Phase A — classify existing 6,512 external substrate rows by inorsa_scope_tier
// Per data-strategy-synthesis-2026-06-14.md (ratified 98.6/100 by 4-judge cross-family panel).
//
// External substrate (community-broadband-bits / dawson-pots-and-pans / fiber-for-breakfast
// / cartesian-cost-report / ntia-bead-subgrantees) can be Tier C or D ONLY.
// Tier A/B is reserved for internal Inorsa-AE substrate (Phase B job).
//
// Hybrid classifier: rule-based first pass + Gemini 2.5 Flash on ambiguous middle.
//
// Per judge-panel-data-strategy-round-1.md dissent #3 (Gemini + GPT-5):
// Run a manual 25-per-tier QA spot-check AFTER this backfill. If misclassification
// rate >10% on the sample → halt + refine.
//
// Usage:
//   node scripts/phase-a-classify-inorsa-scope-tier.mjs --dry-run        # rule-only sample
//   node scripts/phase-a-classify-inorsa-scope-tier.mjs --rule-only      # apply rules, skip LLM
//   node scripts/phase-a-classify-inorsa-scope-tier.mjs --apply          # full hybrid + write

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SB_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) not in env');
  process.exit(2);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RULE_ONLY = args.includes('--rule-only');
const DRY_RUN = args.includes('--dry-run') || (!APPLY && !RULE_ONLY);
const LIMIT = (() => {
  const a = args.find(s => s.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : 0;
})();

if (!RULE_ONLY && !DRY_RUN && !GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY missing — required for ambiguous-row LLM pass.');
  console.error('       Use --rule-only to skip LLM classification.');
  process.exit(2);
}

console.log(`[phase-a] APPLY=${APPLY} RULE_ONLY=${RULE_ONLY} DRY_RUN=${DRY_RUN} LIMIT=${LIMIT || 'all'}`);
console.log(`[phase-a] target=${SB_URL}`);

// ─── Rule-based classifier ──────────────────────────────────────────────────

// Strong Tier D signals: construction-labor, $/ft, tower, splicer/bore, dig-once.
// Lower-cased; matched as case-insensitive substring on lowercased content.
const D_SIGNALS = [
  'tower',                       // any tower mention — fiber-only default
  'tower tech', 'tower climber',
  'splicer', 'splice tech', 'splice crew',
  'bore operator', 'directional bore', 'directional drill',
  '$/ft', '$ /ft', '$ per foot', 'cost per foot', 'cost per linear foot', 'per linear foot',
  'underground installation cost', 'aerial installation cost',
  'dig-once', 'dig once', 'street cut',
  'construction labor', 'labor productivity', 'labor cost',
  'fiber tech shortage', 'fiber technician shortage', 'tech shortage',
  'workforce gap', 'workforce shortage', 'workforce study',
  '$18/ft', '$18 per foot',      // cartesian core data points
];

// Strong Tier C signals: permitting, regulatory, BEAD policy/grants,
// speed-to-construction mandate, capacity framing.
const C_SIGNALS = [
  'permit', 'permitting', 'permit reform',
  'shot-clock', 'shot clock', 'h.r. 2289', 'hr 2289', 'hr2289',
  'regulatory', 'reform',
  'bead grant', 'bead award', 'bead deadline', 'bead funding', 'bead policy',
  'bead subgrantee', 'sub-grantee',
  'reconnect',                   // NTIA program
  'speed-to-construction', 'speed to construction',
  'fba ceo', 'gary bolton',      // FBA quotes are Tier C bridge
  'rejection rate', 'first pass', 'kickback',
  'jurisdiction', 'multi-jurisdiction', 'multi state', 'multi-state',
  'engineering capacity', 'design capacity', 'drafting capacity',
  'right-of-way', 'right of way',
  'cycle time', 'turnaround time',
  'standardize', 'standardization',
];

// Fiber-rescue terms: explicit fiber scope. Rescues a chunk that has D signals
// into Tier C if and only if the chunk also contains explicit fiber language.
const FIBER_RESCUE = [
  'fiber drafter', 'fiber drafters',
  'fiber operator', 'fiber operators',
  'ftth', 'fttx', 'fttp', 'fttn',
  'gis-to-cad', 'gis to cad', 'gis→cad',
  'fiber permit', 'fiber permits',
  'bead fiber',
  'fiber design', 'fiber designs',
  'fiber drawing', 'fiber drawings',
  ' lld ', ' lld,', ' lld.',     // word-boundary "LLD" (avoid matching "all_lldap" garbage)
  'low-level design',
  'fiber engineering', 'fiber engineer',
  'fiber a&e', 'fiber a & e',
];

function countMatches(haystack, needles) {
  let n = 0;
  for (const needle of needles) if (haystack.includes(needle)) n++;
  return n;
}

function classifyByRule(row) {
  const source = row.source;
  const content = (row.content || '').toLowerCase();

  // ntia-bead-subgrantees: regulatory-authority data for program_leverage × JTBD 7 path.
  // All Tier C. (Per synthesis v2 §5.1.9 Grok-dissent absorbed.)
  if (source === 'ntia-bead-subgrantees') {
    return { tier: 'C', method: 'rule', rationale: 'ntia subgrantee → regulatory authority' };
  }

  // cartesian-cost-report: cost-of-construction reports. Default Tier D unless rescued.
  if (source === 'cartesian-cost-report') {
    const rescue = countMatches(content, FIBER_RESCUE);
    if (rescue >= 1) {
      return { tier: 'C', method: 'rule', rationale: `cartesian fiber-rescue (rescue=${rescue})` };
    }
    return { tier: 'D', method: 'rule', rationale: 'cartesian construction-cost' };
  }

  const dHits = countMatches(content, D_SIGNALS);
  const cHits = countMatches(content, C_SIGNALS);
  const rescueHits = countMatches(content, FIBER_RESCUE);

  // Clear D: strong D signals AND no fiber-rescue
  if (dHits >= 2 && rescueHits === 0) {
    return { tier: 'D', method: 'rule', rationale: `D-signals=${dHits} no-rescue` };
  }

  // Fiber-rescue: D signals present BUT explicit fiber-scope language wins
  if (dHits >= 1 && rescueHits >= 1) {
    return { tier: 'C', method: 'rule', rationale: `fiber-rescue d=${dHits} rescue=${rescueHits}` };
  }

  // Clear C: strong C signals + zero D signals
  if (cHits >= 2 && dHits === 0) {
    return { tier: 'C', method: 'rule', rationale: `C-signals=${cHits}` };
  }

  // C-with-mild-rescue: 1 C signal + fiber-rescue present
  if (cHits >= 1 && rescueHits >= 1 && dHits === 0) {
    return { tier: 'C', method: 'rule', rationale: `C+rescue c=${cHits} rescue=${rescueHits}` };
  }

  // Mixed or low-signal → ambiguous, send to LLM
  return { tier: 'AMBIGUOUS', method: 'rule', rationale: `d=${dHits} c=${cHits} rescue=${rescueHits}` };
}

// ─── LLM classifier (Gemini 2.5 Flash) for ambiguous rows ───────────────────

const LLM_PROMPT_BASE = `You are classifying a substrate chunk by its relevance to Inorsa's product scope. Inorsa is a fiber-drawing-automation product: it converts GIS and LLD data into construction and permit drawings, accelerating DRAFTING throughput. Inorsa does NOT impact construction labor, $/ft installation cost, field crew availability, fiber-tech/splicer/bore-operator shortages, or tower-side anything.

Output exactly one of two tiers:

- "C" (Tier C — industry-research aligned to Inorsa's scope): permit-reform regulatory context (H.R. 2289 shot-clock), BEAD policy / speed-to-construction mandate, NTIA/FBA framing of design+permitting pressure, FBA CEO Gary Bolton industry-mandate quotes, fiber-permitting rejection-rate context, jurisdictional standardization pressure, engineering-capacity framing for BEAD bids. Used as BRIDGING CONTEXT in emails, never as the LEAD claim (unless persona=program_leverage AND primary_jtbd=7 — regulatory-authority exception).

- "D" (Tier D — industry-research NOT aligned, BANNED from every email): construction-labor cost, $/ft installation cost, dig-once construction efficiency, fiber-splicer / fiber-tech / bore-operator workforce stats, tower-related content, any content that could plausibly be tower not fiber.

HARD RULE — fiber-only safety default: when uncertain whether a chunk is fiber-scope vs tower-scope vs construction-scope, assume the OUT-OF-SCOPE option (Tier D). Don't reframe ambiguous content as fiber.

FIBER-RESCUE EXCEPTION: a chunk is eligible for Tier C even if surrounding context mentions construction or tower IF the chunk itself contains EXPLICIT fiber-scope language ("fiber drafter" / "fiber operator" / "FTTH" / "FTTX" / "GIS-to-CAD" / "fiber permit" / "BEAD fiber" / "fiber design" / "fiber drawing" / "LLD" / "low-level design" / "fiber engineering" / "fiber A&E").

Return ONLY a single JSON object with no prose: {"tier":"C"|"D","rationale":"<≤120 chars: cite the specific signal that drove the decision>"}

Chunk source: {SOURCE}
Chunk content:
<<<
{CONTENT}
>>>`;

async function classifyByLLM(row) {
  const prompt = LLM_PROMPT_BASE
    .replace('{SOURCE}', row.source)
    .replace('{CONTENT}', (row.content || '').slice(0, 4000));

  // Gemini 2.5 Flash — fast + cheap
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1500,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                tier: { type: 'STRING', enum: ['C', 'D'] },
                rationale: { type: 'STRING' },
              },
              required: ['tier', 'rationale'],
            },
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Lenient parse: Gemini sometimes wraps in prose ("Here is the JSON: …")
      // or markdown fences. Find the first {…} block.
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*?\}/);
        if (!m) throw new Error(`no JSON in response: ${text.slice(0, 200)}`);
        parsed = JSON.parse(m[0]);
      }
      const tier = parsed.tier === 'C' || parsed.tier === 'D' ? parsed.tier : 'D';
      const rationale = (parsed.rationale || '').slice(0, 250);
      return { tier, method: 'llm', rationale };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  // 3 attempts failed → conservative default per fiber-only safety: assume tower / out-of-scope
  return { tier: 'D', method: 'llm', rationale: `LLM-failed-default-D: ${String(lastErr).slice(0, 100)}` };
}

// ─── Supabase helpers ───────────────────────────────────────────────────────

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
    throw new Error(`sbFetch ${res.status} ${path}: ${txt.slice(0, 200)}`);
  }
  const prefer = (init.headers || {})['Prefer'] || '';
  if (/return=minimal/i.test(prefer)) return null;
  return res.json();
}

async function fetchUnclassifiedBatch(offset, pageSize) {
  const limitClause = LIMIT && offset + pageSize > LIMIT
    ? `&limit=${LIMIT - offset}`
    : `&limit=${pageSize}`;
  const path = `/rest/v1/sr_brain_substrate?select=id,source,content&inorsa_scope_tier=is.null&order=id&offset=${offset}${limitClause}`;
  return sbFetch(path);
}

async function patchRow(id, tier, method, rationale) {
  await sbFetch(`/rest/v1/sr_brain_substrate?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      inorsa_scope_tier: tier,
      inorsa_scope_tier_method: method,
      inorsa_scope_tier_rationale: rationale,
      inorsa_scope_tier_set_at: new Date().toISOString(),
    }),
  });
}

// ─── Main loop ──────────────────────────────────────────────────────────────

async function runBatchedLLM(ambiguousRows, concurrency = 8) {
  const results = [];
  let i = 0;
  while (i < ambiguousRows.length) {
    const slice = ambiguousRows.slice(i, i + concurrency);
    const sliceResults = await Promise.all(slice.map(row => classifyByLLM(row).then(r => ({ row, ...r }))));
    results.push(...sliceResults);
    i += concurrency;
    if (i % 200 === 0 || i >= ambiguousRows.length) {
      console.log(`[phase-a] LLM progress: ${Math.min(i, ambiguousRows.length)}/${ambiguousRows.length}`);
    }
  }
  return results;
}

async function main() {
  const PAGE = 500;
  const counts = { A: 0, B: 0, C: 0, D: 0, AMBIGUOUS: 0 };
  const bySourceXtier = new Map(); // 'source|tier' → count
  const ambiguousQueue = [];
  let offset = 0;
  let processedRule = 0;

  // PASS 1: rule-based on every unclassified row
  while (true) {
    const rows = await fetchUnclassifiedBatch(offset, PAGE);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const result = classifyByRule(row);
      counts[result.tier]++;
      const key = `${row.source}|${result.tier}`;
      bySourceXtier.set(key, (bySourceXtier.get(key) || 0) + 1);
      processedRule++;

      if (result.tier === 'AMBIGUOUS') {
        ambiguousQueue.push(row);
        continue;
      }

      if (APPLY) await patchRow(row.id, result.tier, result.method, result.rationale);
    }

    offset += rows.length;
    if (LIMIT && offset >= LIMIT) break;
    console.log(`[phase-a] rule pass: ${offset} processed, ${ambiguousQueue.length} ambiguous queued`);
  }

  console.log('\n[phase-a] === RULE PASS COMPLETE ===');
  console.log(`[phase-a] total rule-processed: ${processedRule}`);
  console.log(`[phase-a] rule-distribution: C=${counts.C} D=${counts.D} AMBIGUOUS=${counts.AMBIGUOUS}`);
  console.log('[phase-a] by source × rule-tier:');
  for (const [k, v] of [...bySourceXtier.entries()].sort()) console.log(`         ${k}: ${v}`);

  // PASS 2: LLM on ambiguous middle
  if (RULE_ONLY) {
    console.log(`\n[phase-a] --rule-only set, skipping LLM on ${ambiguousQueue.length} ambiguous rows`);
    if (APPLY) {
      console.log('[phase-a] ambiguous rows left with inorsa_scope_tier=NULL for now');
    }
    return;
  }

  if (ambiguousQueue.length === 0) {
    console.log('\n[phase-a] no ambiguous rows — rule-pass was decisive on every row');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[phase-a] DRY_RUN — would LLM-classify ${ambiguousQueue.length} ambiguous rows. Re-run with --apply.`);
    // Show 5 sample ambiguous rows for sanity
    console.log('[phase-a] sample ambiguous rows:');
    for (const r of ambiguousQueue.slice(0, 5)) {
      console.log(`         ${r.source}: ${(r.content || '').slice(0, 120).replace(/\n/g, ' ')}…`);
    }
    return;
  }

  console.log(`\n[phase-a] LLM pass on ${ambiguousQueue.length} ambiguous rows…`);
  const llmResults = await runBatchedLLM(ambiguousQueue);

  for (const { row, tier, method, rationale } of llmResults) {
    counts[tier]++;
    counts.AMBIGUOUS--;
    const key = `${row.source}|${tier}`;
    bySourceXtier.set(key, (bySourceXtier.get(key) || 0) + 1);
    if (APPLY) await patchRow(row.id, tier, method, rationale);
  }

  console.log('\n[phase-a] === FINAL ===');
  console.log(`[phase-a] final-distribution: C=${counts.C} D=${counts.D}`);
  console.log('[phase-a] by source × final-tier:');
  for (const [k, v] of [...bySourceXtier.entries()].sort()) console.log(`         ${k}: ${v}`);
}

main().catch(err => { console.error(err); process.exit(1); });
