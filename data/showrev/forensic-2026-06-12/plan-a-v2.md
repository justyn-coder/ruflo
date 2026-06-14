---
title: Plan A v2 — Judge-Revised Minimum Viable Hardening
date: 2026-06-13 (drafted)
status: DRAFT v2 for round-2 judge review
authored_by: Claude (Opus 4.7) — incorporating critiques from Gemini 2.5 Pro, GPT-5, Grok 4, DeepSeek
purpose: Hit KR1 with judge-verified rigor. v1 hold-vote was 3-of-4.
---

# Why v2

v1 went to a 4-judge panel. **3 of 4 said HOLD DON'T SHIP.** Median KR1 confidence: 30%.

Consensus critiques (3+ judges agreed on each):

1. **Judge loop must be BLOCKING** — advisory was the original failure mode.
2. **Plan A's 9-hour Day 0 budget is unrealistic** — minimum 14-16 hrs.
3. **End-to-end integration tests are mandatory** — seeded PROHIBITED rows in CI proving the gates fire.
4. **Manual independent audit of recomposed sample** — second human (not Tim) checks 30-50 samples for source provenance + inference before bulk release.
5. **Composer must operate in evidence-only mode** — explicit per-claim citation contract.
6. **DB-level constraints** (NOT NULL + CHECK) to prevent future PROHIBITED inserts.
7. **Check ALL evidence tables** — not just sr_company_evidence. sr_brain_substrate, vector cache, etc.
8. **Server-side hard gate** in orchestrator/composer/HS loader — NOT just portal UI.
9. **Cache/embedding purge** of contaminated content.
10. **URL canonicalization + subdomain/redirect matching** for PROHIBITED detection.
11. **Minimum evidence coverage threshold** — N T1/T2 claims required per email or refuse to ship.

Things to cut from v1:
- Portal display (was Change 6) — defer to Day 1+. UI is cosmetic; server-side gates are the protection.
- LLM judge for soft inference cases — regex only for T1.
- "Investigate why judge loop = 0" — root cause is clear (not wired). Wire it directly.

**Strategic shift from v1:** Plan A v1 patched symptoms. Plan A v2 makes the system **refuse to ship bad data** by design — DB constraints + server-side gates + composer contract + blocking judge. The system gets HONEST about what it knows; it does not get smarter at researching. Plan B owns "smarter."

---

# Goal (unchanged)

Hit KR1 — 0 PROHIBITED-source citations, <5% inference language, 95%+ T1-T5 provenance — across the 167-prospect re-composition and the next 500 emails over 7 days.

# Scope boundary (revised)

- **IN:** Code changes ≤12 files. DB migrations (NOT NULL + CHECK constraints). Composer prompt rewrite. Cache purge. Re-composition of contaminated cohort. CI/E2E tests. Independent audit. Daily monitoring.
- **OUT:** Portal UI changes (defer to Day 1+ after gates pass). Plan B work (sentence attribution, sr_claim_verifications table, Brain loop).

# Core principle change

**The composer operates in EVIDENCE-ONLY mode.** Every numeric/named claim in every shipped body must reference a `claim_id` pointing to a T1 or T2 source. If a prospect has fewer than {N} T1/T2 claims, the composer produces a generalized-mode body (industry framing only). If even that's not possible, the system refuses to ship the prospect.

That's the contract. Everything else enforces it.

---

# Sequenced changes (judge-revised order)

## Step 0 — Kill switch (15 min, must be FIRST)

Set `send_status = 'frozen'` on every `sr_engine_output` row that's currently `pending` or `flag`. New rows default to `frozen` until the gates pass. Operator manually unfreezes after audit.

```sql
UPDATE sr_engine_output SET send_status = 'frozen' WHERE send_status IN ('pending', 'flag');
```

## Step 1 — Schema hardening across ALL evidence tables (2 hrs)

Per GPT-5: contamination can leak via auxiliary tables. Audit and constrain:
- `sr_company_evidence` (known)
- `sr_brain_substrate` (chunks — has metadata.companies_mentioned)
- `sr_brain_citations` (need to inspect)
- `sr_brain_dossiers` (need to inspect)
- `sr_dossiers` (need to inspect)
- Any embeddings/vector cache table

For each:
```sql
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS domain_tier text;
ALTER TABLE <table> ADD CONSTRAINT <table>_domain_tier_check
  CHECK (domain_tier IN ('1','2','3','4','PROHIBITED'));
```

Backfill per the v1 SQL pattern, then enforce NOT NULL:
```sql
UPDATE <table> SET domain_tier = ... -- classifier
ALTER TABLE <table> ALTER COLUMN domain_tier SET NOT NULL;
```

Then ADD CONSTRAINT preventing PROHIBITED inserts:
```sql
ALTER TABLE <table> ADD CONSTRAINT no_prohibited
  CHECK (domain_tier != 'PROHIBITED');
```

This makes contamination structurally impossible at the DB layer.

## Step 2 — URL canonicalization + extended PROHIBITED detection (1.5 hrs)

`src/showrev/m1-email-find/evidence-tiering/url-canonicalize.ts` (NEW):
- Lowercase
- Strip `utm_*`, `gclid`, `fbclid`, `?ref=`, etc.
- Match subdomain wildcards (`*.zoominfo.com` not just `zoominfo.com`)
- Match known mirror/aggregator paths
- Resolve known redirects (e.g., `lnkd.in/*` → `linkedin.com`)
- Punycode-decode

`classifyDomainTier(url)`:
- T1: `*.gov`, `ntia.gov`, `fcc.gov`, `sec.gov`, `broadbandusa.gov`
- T2: lightreading, fiercenetwork, telecompetitor, bbcmag, geekwire, prnewswire, businesswire, globenewswire, reuters, bloomberg, nytimes, wsj
- T3: linkedin, glassdoor, indeed, wikipedia, themountainbuzz, inforum, *.coop self-published
- T4: any unknown domain — defaults to T4 (must be promoted to T1/T2 via manual review)
- PROHIBITED (20+ entries): zoominfo, leadiq, rocketreach, prospeo, hunter.io, lusha, snov, cognism, seamless, kaspr, cleanlist, contactout, mailmo, datanyze, salezshark, yelp, ratemyemployer, glassdoor-reviews, eluta, indeed-reviews

Tests: unit tests against 50+ fixture URLs. CI required.

## Step 3 — Wire verify-facts into substrate-query at READ and WRITE (1.5 hrs)

`substrate-query.ts`:
- `writeEvidence()`: call `classifyDomainTier()` on each row's citation. If PROHIBITED, REFUSE the insert (DB constraint will reject anyway, but app-level reject gives clearer error). Log dropped rows.
- `getCompanyEvidence()`: filter `domain_tier != 'PROHIBITED'`. Downgrade T3/T4 to USE_TO_SHAPE regardless of source_kind. Attach `domain_tier` to returned EvidenceRecord metadata.

## Step 4 — Cache and embedding purge (1 hr)

Per GPT-5. Identify rows in `sr_brain_substrate` (chunks) where metadata.source contains PROHIBITED domain references. Delete or mark filtered. Re-embed clean substrate only.

```sql
-- Find and delete contaminated chunks
DELETE FROM sr_brain_substrate
WHERE source ILIKE ANY(ARRAY['%zoominfo%','%leadiq%','%rocketreach%',
  '%prospeo%','%hunter.io%','%lusha%','%snov%','%cognism%','%seamless%',
  '%kaspr%','%cleanlist%','%contactout%','%mailmo%','%datanyze%',
  '%salezshark%','%yelp%']);
```

Then re-run embedding job on remaining substrate so vector index is clean.

## Step 5 — Composer contract: evidence-only mode (3 hrs)

`src/showrev/m1-email-find/evidence-tiering/specific-composer.ts` + `generalized-composer.ts` system prompt rewrite:

```
EVIDENCE-ONLY MODE (NEW HARD CONSTRAINT):
You may include a numeric or named claim ONLY if it maps to a provided
EvidenceRecord with verdict=VERIFIED and domain_tier IN ('1','2').

For each sentence in the body, emit an AttributedSentence with claim_ids[]
pointing to the EvidenceRecord IDs the sentence draws from. Sentences
that are pure industry framing (no specific claim) emit claim_ids: [].

FORBIDDEN MODIFIERS (will be regex-blocked):
  active <noun> mode, full <noun> mode, final stretch,
  fresh <noun> strategy, aggressive <noun> strategy, signals a <noun>,
  appears to be, likely to be, real pressure, significant pressure,
  is poised to, on the cusp of

If the prospect has fewer than 3 EvidenceRecords with verdict=VERIFIED
and domain_tier IN ('1','2'), refuse to compose in specific mode.
Return: { mode: 'generalized', reason: 'insufficient_t1_t2_coverage' }
```

Few-shot examples in prompt: 2 good (claim_id every numeric), 2 bad (the actual ZoomInfo + "active M&A mode" failures, marked "DO NOT WRITE LIKE THIS").

## Step 6 — Inference-language detector (regex blocking gate, 1 hr)

`src/showrev/m1-email-find/evidence-tiering/inference-detector.ts` (NEW):
- 40+ regex patterns covering modifier phrases, hedge constructions, speculative cluasing
- Pure regex — no LLM. Block at composer output.
- Tests against the 9 known bad examples.

Output: list of matched phrases. If any, set `mechanical_check_failures` and reject from composer.

## Step 7 — Server-side hard gate at orchestrator + HS loader (1.5 hrs)

Per GPT-5: portal UI is not the gate. Server-side IS.

`orchestrator.ts` end of `orchestrateEvidence`:
```
// Hard gate before returning dossier
if (dossier.claims.company_fact.some(c => c.tier === 'PROHIBITED')) {
  throw new Error('PROHIBITED claim in dossier — refusing to compose');
}
const t1t2Count = countTier1Tier2(dossier);
if (t1t2Count < SPECIFIC_MODE_T1T2_THRESHOLD) {
  dossier.composer_mode = 'generalized';
  dossier.coverage_warning = `Only ${t1t2Count} T1/T2 claims; forcing generalized mode`;
}
```

`hubspot-loader.ts` before write:
```
const sources = await getProspectEvidenceSources(prospectId);
if (sources.some(s => s.domain_tier === 'PROHIBITED')) {
  throw new Error('HS load blocked: PROHIBITED evidence still linked');
}
const mechFailures = await getMechanicalCheckFailures(prospectId);
if (mechFailures?.length > 0) {
  throw new Error('HS load blocked: inference language detected');
}
const judgeResult = await getJudgeResult(prospectId);
if (judgeResult?.verdict !== 'pass') {
  throw new Error('HS load blocked: judge verdict != pass');
}
```

## Step 8 — Judge loop wired + blocking (3 hrs)

Investigation: 30 min to confirm the loop is just not wired (not a deeper bug). Confidence high based on field always = 0.

Wire from composer entry:
```
let composition = await composeBody(dossier);
let attempts = 0;
while (attempts < 2) {
  const judgeVerdict = await tieredJudge(composition, dossier);
  if (judgeVerdict.pass) break;
  composition = await composeBody(dossier, { excludeClaims: judgeVerdict.excludedClaimIds });
  attempts++;
}
if (!judgeVerdict.pass) {
  // FREEZE — do not write to sr_engine_output as pending
  await markFrozen(prospect, judgeVerdict.reasons);
  return null;
}
```

Judge criteria (per GPT-5, hard pass/fail):
- Every numeric/named claim in body must reference a claim_id with verdict=VERIFIED
- Inference detector returns clean
- Domain tier of every referenced claim is T1 or T2
- No mismatch between subject and body
- No matching prohibited modifier phrases

## Step 9 — CI/E2E tests (2 hrs)

Required tests:
1. **Seeded PROHIBITED row test:** insert a ZoomInfo row into sr_company_evidence. Run end-to-end pipeline on its prospect. Assert: composition is null (frozen) AND DB constraint rejected the insert.
2. **Seeded inference-pattern test:** mock composer outputting "active M&A mode". Assert: inference detector matches, judge fails, composition is frozen.
3. **Minimum coverage test:** prospect with 2 T1/T2 + 4 T3 substrate. Assert: composer_mode auto-switches to generalized.
4. **URL canonicalization test:** 50 fixture URLs (subdomains, redirects, trackers). Assert: classified correctly.
5. **HS load gate test:** mock prospect with PROHIBITED evidence still linked. Assert: hubspot-loader throws.

All tests in CI. Plan A is not "done" until green.

## Step 10 — Daily audit job + monitoring (45 min)

Cron daily 5am ET:
```sql
SELECT COUNT(*) FROM sr_company_evidence WHERE domain_tier = 'PROHIBITED';
SELECT COUNT(*) FROM sr_engine_output
  WHERE send_status = 'pending' AND mechanical_check_failures IS NOT NULL;
SELECT COUNT(*) FROM sr_engine_output
  WHERE send_status = 'pending' AND judge_feedback_loop_attempts = 0;
```

Alert (Slack/email) on any > 0. The constraint can't be bypassed at DB level, but the audit catches application-layer regressions.

## Step 11 — Substrate coverage analysis (per Grok) (45 min)

Before re-composition, run:
```sql
SELECT
  company_normalized,
  COUNT(*) FILTER (WHERE domain_tier IN ('1','2')) AS t1_t2_count,
  COUNT(*) FILTER (WHERE domain_tier IN ('3','4')) AS t3_t4_count,
  COUNT(*) FILTER (WHERE domain_tier = 'PROHIBITED') AS prohibited_count
FROM sr_company_evidence
GROUP BY company_normalized
ORDER BY t1_t2_count;
```

Operator + I see which prospects have enough clean substrate for specific-mode and which need either re-research or generalized-mode fallback. This answers Grok's question: "How many of the 800 targets have ANY T1/T2 rows at all after PROHIBITED rows are dropped?"

# Re-composition process (rewritten)

After Steps 0-11 land:

1. Identify cohort: every prospect with `send_status = 'frozen'` from the 182.
2. Per prospect, run new pipeline: orchestrator → composer (evidence-only) → judge (blocking) → inference detector → mechanical checks.
3. If judge passes: composition lands as `pending`. Otherwise frozen.
4. **Independent audit:** I (or a second operator session, not Tim) reviews **50 randomly-sampled emails** for source provenance + inference language. If any audit-flagged issue, fix detection, re-audit. Repeat until 0 issues.
5. Only after audit passes, operator releases batch to HS.
6. Tim re-approves craft on the cleaned batch.

## Acceptance criteria (revised, judge-aligned)

- [ ] DB CHECK constraints prevent PROHIBITED inserts (tested with seeded insert)
- [ ] `getCompanyEvidence()` returns 0 PROHIBITED rows (tested in CI)
- [ ] URL canonicalization handles 50+ edge cases (tested in CI)
- [ ] Cache/embedding store has 0 PROHIBITED references (verified by query)
- [ ] Composer system prompt requires `claim_ids` per sentence (verified by output schema)
- [ ] Inference detector blocks all 9 known bad patterns + extends to 40+ patterns (CI tested)
- [ ] Server-side hard gate in orchestrator + HS loader (tested with seeded contamination)
- [ ] Judge loop fires at least once on every new composition AND blocks on fail (`judge_feedback_loop_attempts >= 1` on every new row)
- [ ] CI tests all green for 5 scenarios
- [ ] Daily audit job running + alerting
- [ ] Coverage analysis run — % of 182 cohort with ≥3 T1/T2 claims known
- [ ] 50-sample independent audit on first re-composed batch: 0 PROHIBITED, ≤2 minor inference catches max
- [ ] **First 15 emails (smoke) clean and ready for AE fire**

# Time budget (judge-revised)

| Step | Hours | Notes |
|---|---|---|
| Step 0 kill switch | 0.25 | Trivial SQL |
| Step 1 schema hardening | 2 | Multi-table, careful with constraints |
| Step 2 URL canonicalize | 1.5 | New file + tests |
| Step 3 wire verify-facts | 1.5 | Read + write path |
| Step 4 cache/embedding purge | 1 | SQL + re-embed trigger |
| Step 5 composer contract | 3 | Prompt rewrite + few-shot + schema |
| Step 6 inference detector | 1 | Regex + tests |
| Step 7 server-side gate | 1.5 | 2 files |
| Step 8 judge loop wiring | 3 | Investigation 0.5 + wire 2.5 |
| Step 9 CI/E2E tests | 2 | 5 scenarios |
| Step 10 daily audit | 0.75 | Cron + alert |
| Step 11 coverage analysis | 0.75 | SQL + report |
| **Total Day 0 code** | **~18 hrs** | Aligned with judge feedback |
| Re-composition + 50-sample audit | 4-6 hrs | Day 1 |
| First 15 ready | EOD Day 1 | |
| 167 cohort ready (modulo coverage) | Days 2-3 | |
| **Total to 500 shippable** | **5-7 days** | Honest |

# What v2 explicitly does NOT do (deferred to Plan B)

- Portal UI changes (defer post-gates)
- `sr_claim_verifications` table (Plan B B1)
- Full sentence-level attribution end-to-end (Plan B B2)
- Composer state machine refactor (Plan B B3)
- Brain learning loop (Plan B B4)
- Cross-source corroboration (Plan B B5)
- FCC BDC bulk ingest (Plan B B6)
- AI-tell hardening (Plan B B7)
- Sender reputation defense (Plan B B8)

# Answers to judge sharp questions

**Grok:** "If the existing 11 checkpoints caught zero contamination, what evidence shows the six new changes will catch it on the next 500 prospects?"
- DB CHECK constraints make PROHIBITED inserts structurally impossible. CI tests prove the gates fire. Independent audit on first 50 catches what tests miss.

**DeepSeek:** "What specific, observable, testable condition will prove the judge loop is policing every new composition?"
- `judge_feedback_loop_attempts >= 1` on every new sr_engine_output row, monitored daily. Plus CI test: seed a known-bad composition, assert judge_feedback_loop_attempts > 0 AND send_status = 'frozen'.

**GPT-5:** "What exact measurable claim-level evidence coverage threshold will we enforce as a hard pre-send gate, and how is it programmatically verified end-to-end?"
- SPECIFIC_MODE_T1T2_THRESHOLD = 3. Enforced at orchestrator (forces generalized mode) AND at composer (refuses specific output). CI test asserts the switch fires on prospect with 2 T1/T2 + 4 T3.

**Gemini:** "How are we changing our fundamental research and composition strategy to generate genuine insight now that shortcuts are removed?"
- Plan A v2 doesn't. Plan A v2 makes the system HONEST about what it knows; if T1/T2 evidence is thin, the email goes generalized. Plan B is the strategy for genuine insight at scale (Brain learning loop, cross-source corroboration, FCC BDC). Accepting the Plan A trade-off: smaller specific footprint, larger generalized footprint, until Plan B compounds.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:05 | Claude (Opus 4.7) | Initial Plan A. Held 3-1 by judge panel. |
| v2 | 2026-06-13 00:55 | Claude (Opus 4.7) | Judge-revised. DB constraints, evidence-only composer, blocking judge, CI tests, 50-sample audit, 18-hr Day 0. |
