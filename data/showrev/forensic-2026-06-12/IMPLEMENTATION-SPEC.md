---
title: Plan A v5 — File-by-File Implementation Spec
date: 2026-06-13
status: READY FOR EXECUTION
authored_by: Claude (Opus 4.7) — post 5-round judge convergence
purpose: Specific files + diffs + tests + sequencing to land Plan A v5 in the codebase
---

# Sequencing (execution-order)

Day 0 (kill state + DB hardening):
- Step 0 — kill switch
- Step 1A — schema migration (online, additive)
- Step 1B — backfill domain_tier + snapshot rows

Day 0/1 (gates):
- Step 2 — URL canonicalizer + classifier
- Step 3 — wire substrate-query
- Step 4 — cache purge
- Step 5 — composer evidence-only contract + per-span schema
- Step 6 — atomic-fact extractor (server-side)
- Step 7 — inference detector
- Step 8 — negation + antonym checks
- Step 9 — server-side hard gate
- Step 10 — judge loop activation
- Step 11 — CI/E2E test suite
- Step 12 — daily audit cron + statistical sampler

Day 1/2 (re-compose):
- Step 13 — coverage analysis
- Step 14 — re-compose 167 cohort through new gates
- Step 15 — 50-sample independent audit (then 100 if any catches)
- Step 16 — HS load gate + first 15 ready

# File-by-file changes

## Migration 0042 — schema hardening

**File:** `migrations/0042_plan_a_v5_hardening.sql` (NEW)

```sql
-- 1. Add domain_tier + snapshot columns
ALTER TABLE sr_company_evidence
  ADD COLUMN IF NOT EXISTS domain_tier text,
  ADD COLUMN IF NOT EXISTS snapshot_url text,
  ADD COLUMN IF NOT EXISTS supporting_quote text,
  ADD COLUMN IF NOT EXISTS quote_hash text,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz;

-- 2. Same for sr_brain_substrate
ALTER TABLE sr_brain_substrate
  ADD COLUMN IF NOT EXISTS domain_tier text;

-- 3. Source domain allowlist
CREATE TABLE IF NOT EXISTS sr_source_domains (
  domain_etld1 text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('1','2','3','4','PROHIBITED')),
  match_wildcards text[],
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  notes text
);

-- 4. Pending classification queue
CREATE TABLE IF NOT EXISTS sr_pending_domain_classification (
  domain_etld1 text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  prospect_count int DEFAULT 1,
  affected_prospect_ids text[],
  sla_target timestamptz GENERATED ALWAYS AS (first_seen_at + interval '4 hours') STORED,
  classified_tier text,
  classified_at timestamptz
);

-- 5. Backfill domain_tier (one-shot)
WITH classified AS (
  SELECT id,
    CASE
      WHEN source_citation ~* '(zoominfo|leadiq|rocketreach|prospeo|hunter\.io|lusha|snov|cognism|seamless\.ai|kaspr|cleanlist|contactout|mailmo|datanyze|salezshark|yelp)' THEN 'PROHIBITED'
      WHEN source_citation ~* '(\.gov|ntia\.gov|fcc\.gov|sec\.gov|broadbandusa)' THEN '1'
      WHEN source_citation ~* '(lightreading|fiercenetwork|telecompetitor|bbcmag|geekwire|prnewswire|businesswire|globenewswire|reuters|bloomberg|nytimes|wsj)' THEN '2'
      WHEN source_citation ~* '(linkedin|glassdoor|indeed|wikipedia|themountainbuzz|inforum|grandforksherald|inforum|wfmz)' THEN '3'
      ELSE '4'
    END AS new_tier
  FROM sr_company_evidence
)
UPDATE sr_company_evidence ev
SET domain_tier = c.new_tier
FROM classified c
WHERE ev.id = c.id;

-- 6. Backfill seed allowlist
INSERT INTO sr_source_domains (domain_etld1, tier) VALUES
  ('ntia.gov','1'), ('fcc.gov','1'), ('sec.gov','1'), ('broadbandusa.gov','1'),
  ('telecompetitor.com','2'), ('lightreading.com','2'), ('prnewswire.com','2'),
  ('businesswire.com','2'), ('globenewswire.com','2'), ('reuters.com','2'),
  ('bloomberg.com','2'), ('nytimes.com','2'), ('wsj.com','2'),
  ('linkedin.com','3'), ('themountainbuzz.com','3'), ('inforum.com','3'),
  ('zoominfo.com','PROHIBITED'), ('leadiq.com','PROHIBITED'),
  ('rocketreach.co','PROHIBITED'), ('prospeo.io','PROHIBITED'),
  ('hunter.io','PROHIBITED'), ('lusha.com','PROHIBITED'),
  ('snov.io','PROHIBITED'), ('cognism.com','PROHIBITED'),
  ('seamless.ai','PROHIBITED'), ('kaspr.io','PROHIBITED'),
  ('cleanlist.com','PROHIBITED'), ('contactout.com','PROHIBITED'),
  ('mailmo.io','PROHIBITED'), ('datanyze.com','PROHIBITED'),
  ('salezshark.com','PROHIBITED'), ('yelp.com','PROHIBITED')
ON CONFLICT (domain_etld1) DO NOTHING;

-- 7. Freeze contaminated rows
ALTER TABLE sr_engine_output
  ADD COLUMN IF NOT EXISTS freeze_reason text,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

UPDATE sr_engine_output eo
SET send_status = 'frozen',
    freeze_reason = 'plan_a_v5_pre_hardening',
    frozen_at = now()
WHERE send_status IN ('pending', 'flag')
  AND eo.company IN (
    SELECT DISTINCT company_name FROM sr_company_evidence
    WHERE domain_tier = 'PROHIBITED'
  );

-- 8. After backfill verified, add constraints (DO NOT RUN UNTIL VERIFIED)
-- ALTER TABLE sr_company_evidence
--   ALTER COLUMN domain_tier SET NOT NULL,
--   ADD CONSTRAINT no_prohibited_evidence CHECK (domain_tier != 'PROHIBITED');
```

**Verification:**
```sql
SELECT domain_tier, COUNT(*) FROM sr_company_evidence GROUP BY domain_tier ORDER BY domain_tier;
SELECT freeze_reason, COUNT(*) FROM sr_engine_output GROUP BY freeze_reason;
```

## URL canonicalizer

**File:** `src/showrev/m1-email-find/evidence-tiering/url-canonicalize.ts` (NEW)

Exports `canonicalize(url): { canonicalUrl, etld1, hash }` and `classifyDomainTier(url): tier`.

Behaviors:
- Lowercase, strip `utm_*`, `gclid`, `fbclid`, `?ref=`, `#fragment`
- NFKC Unicode normalize host
- IDN/punycode decode + re-encode (catches homograph)
- Match subdomain wildcards
- SHA256 hash of final canonical URL for dedup

Database-backed classifier (`classifyDomainTier`):
1. Look up `etld1` in `sr_source_domains`
2. Match `etld1` against any row's `match_wildcards`
3. If found → return tier
4. If not found → enqueue in `sr_pending_domain_classification`, return `'PENDING'`

Tests: `src/showrev/m1-email-find/evidence-tiering/__tests__/url-canonicalize.test.ts`
- 50+ fixture URLs covering: tracking params, IDN/punycode, redirects, case sensitivity, subdomain wildcards, eTLD+1 vs subdomain

## Substrate-query wiring

**File:** `src/showrev/m1-email-find/evidence-tiering/substrate-query.ts` (MODIFY)

Change `writeEvidence`:
```typescript
import { classifyDomainTier } from './url-canonicalize.js';

export async function writeEvidence(records) {
  const filtered = [];
  for (const r of records) {
    const tier = await classifyDomainTier(r.source_citation);
    if (tier === 'PROHIBITED') {
      console.warn(`[substrate-query] DROPPED PROHIBITED: ${r.source_citation}`);
      continue;
    }
    filtered.push({ ...r, domain_tier: tier });
  }
  // Insert filtered with domain_tier populated
  // ...
}
```

Change `getCompanyEvidence`:
```typescript
// Add to URL query string:
const path = `/rest/v1/sr_company_evidence?company_normalized=eq.${...}` +
  `&domain_tier=neq.PROHIBITED&limit=${limit}`;

// For T3/T4 rows, force tier downgrade in returned EvidenceRecord:
if (row.domain_tier === '3' || row.domain_tier === '4') {
  evidence.tier = 'USE_TO_SHAPE';  // override source_kind-based tier
}
```

## Cache purge (one-shot)

**File:** `scripts/purge-contaminated-substrate.sql` (NEW)

```sql
-- 1. Identify chunks referencing PROHIBITED domains
WITH bad_chunks AS (
  SELECT id FROM sr_brain_substrate
  WHERE source ILIKE ANY(ARRAY[
    '%zoominfo%','%leadiq%','%rocketreach%','%prospeo%',
    '%hunter.io%','%lusha%','%snov%','%cognism%','%seamless%',
    '%kaspr%','%cleanlist%','%contactout%','%mailmo%',
    '%datanyze%','%salezshark%','%yelp%'])
)
DELETE FROM sr_brain_substrate WHERE id IN (SELECT id FROM bad_chunks);

-- 2. Schedule re-embed of remaining (Supabase edge function trigger or job)
SELECT pg_notify('substrate_reembed', '{}');
```

## Composer contract (evidence-only mode + per-span schema)

**File:** `src/showrev/m1-email-find/evidence-tiering/specific-composer.ts` (MODIFY)

Update output schema to:
```typescript
interface ComposerOutput {
  subject: string;
  body: string;
  spans: Array<{
    start: number;  // char offset in body
    end: number;
    claim_id: string;
    asserted_terms: string[];
  }>;
  ps: string;
  composer_mode: 'specific' | 'generalized';
}
```

System prompt additions (entire block):
```
EVIDENCE-ONLY MODE (HARD CONSTRAINT):
You may include a numeric or named claim ONLY if you bind it to a specific
EvidenceRecord via a span in your output.

For every body sentence:
1. Identify each numeric, dated, or named-entity span
2. Emit a `spans` entry mapping char_start..char_end to a `claim_id`
3. List asserted_terms for that span (composer's claim of what's asserted)

The server will independently extract atomic facts from your body text and
verify each fact appears (after normalization) in the bound claim's
supporting_quote. Composer-declared asserted_terms are advisory only —
the server overrides.

FORBIDDEN MODIFIERS (regex-blocked):
  active <noun> mode, full <noun> mode, final stretch,
  fresh <noun> strategy, aggressive <noun> strategy, signals a <noun>,
  appears to be, likely to be, real pressure, significant pressure,
  is poised to, on the cusp of, materially larger, materially smaller

CLAIM POLARITY:
  When you reference a claim, mirror the polarity of the supporting_quote.
  If the quote says "did not raise $100M", your body must NOT say "raised $100M".

If the prospect has fewer than 3 EvidenceRecords with verdict=VERIFIED
and domain_tier IN ('1','2'), return:
  { mode: 'generalized', reason: 'insufficient_t1_t2_coverage' }
```

Few-shot: 2 good (per-span mapping with all claims bound), 2 bad (the actual ZoomInfo + "active M&A mode" failures, marked DO NOT WRITE LIKE THIS).

## Atomic-fact extractor (server-side)

**File:** `src/showrev/m1-email-find/evidence-tiering/atomic-fact-matcher.ts` (NEW)

```typescript
import nlp from 'compromise';  // or spaCy via worker

export interface AtomicFact {
  text: string;           // raw text
  normalized: string;     // NFKC + numeral canonical + lowercase
  type: 'numeral' | 'date' | 'currency' | 'percent' | 'entity' | 'verb';
  start: number;
  end: number;
}

export function extractAtomicFacts(text: string): AtomicFact[];

export function normalizeForCompare(text: string): string;
// NFKC, lowercase, collapse whitespace, normalize numerals,
// canonical date format, currency unit normalization

export function checkSpanAgainstClaim(
  span: { start, end, asserted_terms[] },
  bodyText: string,
  claimQuote: string
): { matched: boolean; mismatchedFacts: AtomicFact[] };
// For each atomic fact in the span: must appear in claimQuote (normalized).
// Returns mismatches for diagnostic.

export function checkNegationPolarity(
  span: { start, end },
  bodyText: string,
  claimQuote: string
): { polarityMatch: boolean; reason?: string };
// 5-token window negation cue detection in body span.
// 5-token window negation cue detection in claimQuote around the matched fact.
// If polarities differ → polarityMatch = false.

export function checkPredicateAntonym(
  span: { start, end },
  bodyText: string,
  claimQuote: string
): { antonym_found: boolean; pair?: [string, string] };
// Antonym table (~50 pairs for fiber + B2B SaaS).
// Look at verbs in span + verbs in claimQuote.
// If antonym pair detected → flag.
```

Tests in `__tests__/atomic-fact-matcher.test.ts`:
- 30+ adversarial fixtures: spelled-out numbers, dates in various formats, currency variants, negation patterns, antonym pairs, Unicode edge cases

## Inference detector

**File:** `src/showrev/m1-email-find/evidence-tiering/inference-detector.ts` (NEW)

```typescript
export interface InferenceMatch {
  pattern: string;
  matched_text: string;
  position: number;
}

export function detectInferenceLanguage(text: string): InferenceMatch[];
```

40+ regex patterns. Tests against the 9 known bad examples + variants.

## Server-side hard gate

**Files:** modify orchestrator + hubspot-loader

`orchestrator.ts` end of orchestrateEvidence:
```typescript
const t1t2Count = countTier1Tier2(dossier);
if (dossier.claims.company_fact.some(c => c.tier === 'PROHIBITED')) {
  throw new Error('PROHIBITED claim in dossier — refusing to compose');
}
if (t1t2Count < SPECIFIC_MODE_T1T2_THRESHOLD) {
  dossier.composer_mode = 'generalized';
  dossier.coverage_warning = `Only ${t1t2Count} T1/T2 claims`;
}
```

`hubspot-loader.ts` before any HS write:
```typescript
const sources = await getProspectEvidenceSources(prospectId);
if (sources.some(s => s.domain_tier === 'PROHIBITED')) {
  throw new Error('HS load blocked: PROHIBITED evidence');
}
const judge = await getJudgeResult(prospectId);
if (judge?.verdict !== 'pass') {
  throw new Error('HS load blocked: judge != pass');
}
const inference = await getInferenceMatches(prospectId);
if (inference?.length > 0) {
  throw new Error('HS load blocked: inference matches');
}
```

## Judge loop activation

**File:** `src/showrev/m1-email-find/evidence-tiering/tiered-judge.ts` (MODIFY)

Wire from composer entry point:
```typescript
async function composeWithJudgeLoop(dossier) {
  let attempts = 0;
  let composition = null;
  let excludedClaimIds = [];
  while (attempts < 2) {
    composition = await composeBody(dossier, { excludeClaimIds: excludedClaimIds });
    const verdict = await tieredJudge(composition, dossier);
    if (verdict.pass) {
      await persistJudgeResult({ ...verdict, attempts: attempts + 1 });
      return composition;
    }
    excludedClaimIds = [...excludedClaimIds, ...verdict.excludedClaimIds];
    attempts++;
  }
  // Failed after 2 attempts
  await markFrozen(dossier.prospect, 'judge_loop_exhausted');
  return null;
}
```

Judge criteria (hard pass/fail):
- Every numeric/named atomic fact extracted from body has bound claim_id with VERIFIED status
- atomic-fact-matcher returns matched=true for every span
- negation polarity check passes for every span
- predicate antonym check passes for every span
- inference-detector returns 0 matches
- domain_tier of every claim is '1' or '2'
- composer_mode appropriate for evidence count

## CI/E2E tests

**File:** `src/showrev/m1-email-find/evidence-tiering/__tests__/plan-a-v5-e2e.test.ts` (NEW)

15 scenarios from v3 + v4 + v5 plus negation tests:
1. Seeded PROHIBITED → DB rejects insert
2. Seeded inference → detector blocks, judge fails, frozen
3. Coverage threshold → composer_mode auto-switches to generalized
4. URL canonicalize (50 fixture URLs)
5. HS load gate (mock prospect with PROHIBITED still linked)
6. Atomic-fact matcher (30 adversarial fixtures)
7. Per-span mapping (composer omits claim_id → reject)
8. Negation polarity (5 patterns)
9. Predicate antonym (10 pairs)
10. Snapshot capture fallback chain
11. Async classification queue
12. Freeze dedup (single prospect retry doesn't cascade)
13. Circuit breaker thresholds
14. Statistical audit sampling
15. Migration safety (online add, backfill, NOT NULL last)

## Daily audit + statistical sampler

**File:** `scripts/daily-quality-audit.ts` (NEW)

```typescript
// Cron at 5am ET
async function dailyAudit() {
  // Audit constraints
  const prohibited = await db.query(
    "SELECT COUNT(*) FROM sr_company_evidence WHERE domain_tier = 'PROHIBITED'"
  );
  if (prohibited > 0) alert(`PROHIBITED rows: ${prohibited}`);

  const ungatedComp = await db.query(
    "SELECT COUNT(*) FROM sr_engine_output WHERE send_status='pending' AND judge_feedback_loop_attempts = 0"
  );
  if (ungatedComp > 0) alert(`Compositions without judge run: ${ungatedComp}`);

  // Statistical sampling
  const samples = await sequentialSample({
    table: 'sr_engine_output',
    where: "send_status='pending' AND created_at > NOW() - INTERVAL '24 hours'",
    targetDefectRate: 0.01,
    alpha: 0.05, beta: 0.05,
  });
  const defects = samples.filter(needsManualAudit);
  if (defects.length > 0) alert(`Audit found ${defects.length} defects in ${samples.length} samples`);
}
```

# Re-composition execution plan

After Steps 1-16 land + CI green:

1. **Coverage analysis report** generated per cohort. Operator sees what % of 167 has ≥3 T1/T2 claims.
2. For each cohort prospect:
   - Trigger `evidence-tiering/orchestrator.orchestrateEvidence`
   - Composer runs in evidence-only mode through judge loop
   - On success: composition lands as `pending` (not yet `send`)
   - On freeze: surfaces to operator queue
3. **50-sample independent audit** (me, in a fresh session, or operator) — random selection from re-composed batch. Check each manually for:
   - Source provenance (every claim has a verifiable URL)
   - Inference language (none beyond regex catches)
   - Negation polarity (none)
   - Predicate accuracy (no antonyms slipped)
4. If 0 issues: release batch to HS load.
5. If any issue: freeze batch, fix detection/composer prompt, re-compose, re-audit.

Acceptance: 0 issues on 50-sample, 0 issues on Day-2 100-sample, daily statistical sampling clean.

# Time estimate

| Step | Hours |
|---|---|
| Migration + backfill + freeze + verification | 3 |
| URL canonicalize + classifier + tests | 2.5 |
| Substrate-query wiring + tests | 1.5 |
| Cache purge + re-embed | 1.5 |
| Composer contract change + few-shot | 3 |
| Atomic-fact extractor + tests | 4 |
| Inference detector + tests | 1.5 |
| Negation + antonym checks | 3 |
| Server-side hard gate | 1.5 |
| Judge loop wiring | 3 |
| 15 CI scenarios | 2.5 |
| Daily audit + statistical sampler | 1.5 |
| **Code total** | **28.5 hrs** |
| Re-compose 15 smoke + 50-sample audit | 4 |
| **First 15 ready** | **Day 2-3** |
| Re-compose 167 + 100-sample audit + iterate | 8 hrs over Days 3-5 |
| **500 shippable** | **Day 7-10** |

# Risk register (final)

| Risk | Mitigation |
|---|---|
| Atomic-fact matcher false-positives reject valid composer output | Composer regenerates with feedback; if persistent → escalate to operator portal |
| Negation detection misses long-range cues | Plan B Phase 1 (dependency parse). Daily audit catches escapes |
| Antonym table coverage gaps | Add to Plan B Phase 1. Audit catches |
| Snapshot capture fails for many sources | Fallback chain (Wayback → archive.is → headless). If all fail, tier downgraded |
| Operator classification queue backs up | SLA alert + escalation. Could parallel-classify with second operator session |
| DB migration breaks active queries | Online migration order: ADD nullable → backfill → ADD NOT NULL last; rollback flag |
| Re-composition produces mostly generalized bodies | Expected. Operator + Tim review craft. Reply rate measured against this baseline |

# Plan B Phase 1 promotion

Per round 5 GPT-5/Grok/Gemini critiques:

**Promote to immediate Plan B Phase 1:**
- Dependency-parse-based negation scope detection (spaCy)
- Predicate-argument role resolution
- Tense/modality classification

Time estimate: 2-3 weeks. **Strong Fable 5 candidate** — autonomous NLP system build with clear verification gate (adversarial CI corpus).

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 02:45 | Claude (Opus 4.7) | Initial v5 implementation spec. Ready for execution. |
