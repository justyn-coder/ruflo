---
title: Plan A — Minimum Viable Hardening for 500-Email T1 P2 Wave
date: 2026-06-12
status: DRAFT for operator + judge panel
authored_by: Claude (Opus 4.7)
purpose: Ship ~500 clean cold emails over the next week. Targeted code edits, not architectural rewrite. Plan B continues in parallel.
---

# Goal

Unblock the 182 Tim-approved cohort + scale to 500 emails over the next 7 days, with **zero PROHIBITED-source citations** in any shipped body and **inference language reduced to <5%** of bodies, hitting the KR1 quality bar.

# Scope boundary

- IN: code changes contained to ≤8 files. Data backfill via SQL. Re-composition of contaminated prospects. Pre-load + portal gating.
- OUT: schema migrations (no new tables), Brain learning loop activation, sentence-level click-trace, full architectural rewrite. Those live in Plan B.

# 6 changes, sequenced

## Change 1 — Wire `verify-facts.ts` domain classifier into the substrate read path

**Why first:** smallest change, biggest impact. Closes the contamination at the read boundary so contaminated rows already in the DB can't reach the composer.

**Where:** `src/showrev/m1-email-find/evidence-tiering/substrate-query.ts`

**What changes:**
- Add `classifyDomainTier(citation: string): 1 | 2 | 3 | 4 | 'PROHIBITED'` — adapted from `verify-facts.ts` lines 208-213, extended with:
  - PROHIBITED list (zoominfo, leadiq, rocketreach, prospeo, hunter, cleanlist, contactout, mailmo, snov, kaspr, lusha, salezshark, datanyze, cognism, seamless, yelp)
  - Tier 1 (.gov), Tier 2 (named trade press + prnewswire/businesswire/globenewswire), Tier 3 (linkedin/glassdoor/indeed/wikipedia), Tier 4 (default)
- Modify `getCompanyEvidence()` to:
  - For every returned `EvidenceRecord`, compute `domainTier = classifyDomainTier(record.source.citation)`
  - If `domainTier === 'PROHIBITED'`: **drop the record entirely**, log `[substrate-query] DROPPED PROHIBITED domain: <url>`
  - If `domainTier === 3 || 4`: **force tier downgrade to USE_TO_SHAPE** regardless of source_kind
  - Attach `domainTier` to returned record metadata so downstream can see it
- Modify `writeEvidence()` to:
  - Same check at write time — refuse to insert PROHIBITED rows
  - Log dropped rows to a new console line so we can audit upstream agent behavior

**Test plan:** unit test against 12 fixture URLs (zoominfo + leadiq + yelp + rocketreach in PROHIBITED; t-mobile.com + lytefiber.com in Tier 1; telecompetitor + prnewswire in Tier 2).

## Change 2 — Backfill PROHIBITED-row mark on existing `sr_company_evidence`

**Why:** the DB has 12+ confirmed PROHIBITED rows across the 5 prospects we audited. Likely many more across the 182. Mark them so the read path can filter immediately even before Change 1 lands.

**Where:** Supabase migration script + one-shot SQL.

**What changes:**
- Add column: `ALTER TABLE sr_company_evidence ADD COLUMN domain_tier text;`
- Backfill via SQL:
  ```
  UPDATE sr_company_evidence
  SET domain_tier = CASE
    WHEN source_citation ILIKE '%zoominfo%' OR source_citation ILIKE '%leadiq%'
      OR source_citation ILIKE '%rocketreach%' OR source_citation ILIKE '%prospeo%'
      OR source_citation ILIKE '%hunter.io%' OR source_citation ILIKE '%lusha%'
      OR source_citation ILIKE '%snov%' OR source_citation ILIKE '%cognism%'
      OR source_citation ILIKE '%seamless%' OR source_citation ILIKE '%yelp%'
      OR source_citation ILIKE '%kaspr%' OR source_citation ILIKE '%cleanlist%'
      OR source_citation ILIKE '%contactout%' OR source_citation ILIKE '%mailmo%'
      OR source_citation ILIKE '%datanyze%' OR source_citation ILIKE '%salezshark%'
      THEN 'PROHIBITED'
    WHEN source_citation ~* '(\.gov|ntia\.gov|fcc\.gov|sec\.gov|broadbandusa)' THEN '1'
    WHEN source_citation ~* '(lightreading|fiercenetwork|telecompetitor|bbcmag|geekwire|prnewswire|businesswire|globenewswire|reuters|bloomberg)' THEN '2'
    WHEN source_citation ~* '(linkedin|glassdoor|indeed|wikipedia)' THEN '3'
    ELSE '4'
  END;
  ```
- Verify counts: `SELECT domain_tier, COUNT(*) FROM sr_company_evidence GROUP BY domain_tier;`
- Read path adds `&domain_tier=neq.PROHIBITED` filter to all queries — belt and suspenders with Change 1.

## Change 3 — Fix `send-confidence.computeSubstrateScore()` to NOT count PROHIBITED/T3/T4

**Why:** the confidence score Blake Griffin's email got (81.7) was inflated by counting ZoomInfo + LeadIQ as "directly-citable." Operator's portal trust is rooted in this score.

**Where:** `src/showrev/m1-email-find/evidence-tiering/send-confidence.ts` line 216-291.

**What changes:**
- Add inputs `use_directly_count_clean` and `use_to_shape_count_clean` — counts that exclude PROHIBITED + Tier 3 + Tier 4 rows.
- Score from the clean counts.
- Portal-facing axis explanation text changes from "10 directly-citable claims" → "10 directly-citable from primary sources (excluded 4 lower-trust)".

**Backfill all existing rows:** re-run `computeSendConfidence()` for every sr_engine_output row after Change 1 + 2 + 3 land. Per memory `feedback_send_confidence_needs_backfill_on_code_changes` — this is mandatory.

## Change 4 — Add an inference-language detector to the composer output

**Why:** "active M&A mode" / "full capture mode" / "final stretch" / "fresh growth strategy" patterns all leaked through composition_review = approved. These are recurring patterns that a regex + LLM hybrid can catch.

**Where:** `src/showrev/m1-email-find/evidence-tiering/composer-constraints.ts` (likely — it's the 43K constraint file) OR a new `inference-detector.ts`.

**What changes:**
- Pattern list (regex):
  - `\bactive\s+(M&A|capture|growth|expansion)\s+mode\b`
  - `\bfull\s+(capture|growth|expansion)\s+mode\b`
  - `\bfinal\s+stretch\b`
  - `\b(fresh|aggressive)\s+(growth|expansion)\s+strategy\b`
  - `\b(real|significant)\s+pressure\b` (flagged for review, not blocked)
  - `\bsignals\s+a\s+/`
  - `\b(likely|appears)\s+to\s+be\s+/` (composer-inference hedges)
- LLM judge (called once per body): "Identify any modifier or framing phrase in this body that is not directly supported by the listed substrate claims. Return JSON: { has_inference: boolean, examples: [...] }"
- If detected: write to `sr_engine_output.mechanical_check_failures` AND set `send_status = flag`. Portal surfaces.

## Change 5 — Activate the judge feedback loop (or make it a hard gate)

**Why:** the field `judge_feedback_loop_attempts` exists but is always 0. Either the loop's not wired or its trigger is broken.

**Where:** `src/showrev/m1-email-find/evidence-tiering/tiered-judge.ts` + `judges.ts` + the composer entry point.

**What changes:**
- Investigation first (1 hour): why is the loop not firing? Could be a config flag, missing wiring in the orchestrator, or never-built integration.
- Wire it so: every composition runs through the tiered-judge once. If `tiered-judge` returns "needs revision" → recompose with judge's `excluded_claim_ids` removed. Cap at 2 iterations.
- For Plan A, the simpler path may be: add a **pre-portal gate** that runs `verifyClaimsWithWebSearch()` from `verify-facts.ts` on every output. If `safeForEmail = false` on any claim → block from portal SEND status.

## Change 6 — Portal-side display of `domain_tier` breakdown

**Why:** even with code fixes, operator should see the actual source-domain composition of each email's substrate so confidence isn't a black-box score.

**Where:** `src/showrev/microsite/app/ops/intelligence/page.tsx` (the operator portal).

**What changes:**
- Add a per-prospect column: "Substrate sources" badge showing: `T1: 3 / T2: 5 / T3: 1 / PROHIBITED: 0`.
- If `PROHIBITED > 0` anywhere in the prospect's evidence → row shows red flag, can't be in SEND status.
- Click expands to show which URLs.

# Re-composition plan for the affected cohort

After Changes 1-5 land:

1. **Identify contaminated rows:** SQL on `sr_company_evidence` — every prospect with `domain_tier IN ('PROHIBITED','3','4')` on at least one row.
2. **For each contaminated prospect's `sr_engine_output`:**
   - Re-run the composer with the new clean substrate (PROHIBITED rows now filtered).
   - Inference-language detector gates output.
   - Tiered-judge gates output.
   - `send-confidence` re-computes against clean counts.
3. **Tim re-review:** prospects whose body materially changed need fresh Tim sign-off on craft.
4. **Portal review:** operator confidence dials updated.
5. **Re-load HS** for prospects whose body changed.

# Acceptance criteria for Plan A "complete"

- [ ] `sr_company_evidence.domain_tier` populated for all rows
- [ ] `getCompanyEvidence()` returns 0 PROHIBITED rows in any read (verified by test)
- [ ] `send-confidence` recomputed for every `sr_engine_output` row; portal score reflects clean counts
- [ ] Inference-language detector wired; every composer output has `mechanical_check_failures` populated if patterns hit
- [ ] Judge feedback loop fires at least once on a new composition (verified via `judge_feedback_loop_attempts > 0`)
- [ ] Portal shows `T1/T2/T3/PROHIBITED` source-tier breakdown per prospect
- [ ] 167 emails (the 182 cohort minus the 15 smoke) re-composed and re-confidence-scored
- [ ] Tim re-approves the 167 with materially-changed bodies (parallel work — not blocking on code)
- [ ] First 15 emails (the smoke) ready for AE fire by tomorrow morning

# Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Filter is too aggressive — drops too many rows → emails go generic | Medium | Trigger `composer_mode='generalized'` gracefully when SPECIFIC_MODE_THRESHOLD (3) not met; composer already handles this |
| Inference-language detector false-positives (e.g., "real" is legitimate sometimes) | Medium | Two-tier: regex blocks the egregious 5 patterns; LLM judge flags rest for portal review (not block) |
| Judge loop re-composition takes long enough to slow throughput | Low | Cap at 2 iterations; failure → fall to generalized mode |
| Backfill SQL changes domain_tier for rows that ARE legit | Low | Spot-check 20 rows in each tier after backfill; manual override available |
| Workflow loader keeps writing PROHIBITED URLs to substrate | High | Change 1 catches at write time; AND we add a one-shot audit query that runs after every workflow output ingestion |
| Tim's "approved" status carries forward incorrectly on materially-changed bodies | Medium | After re-compose, set composition_review = null + composition_reviewed_at = null; flag in portal for fresh Tim review |
| 167 prospects can't be cleanly re-composed in time | Medium | Set a tighter target: clean the 15 + 50 more by end of weekend; remaining cleared by Wednesday |

# Time budget

| Step | Hours | Sequence |
|---|---|---|
| Change 1 (domain classifier) | 1.5 | Day 0 |
| Change 2 (backfill SQL) | 0.5 | Day 0 |
| Change 3 (send-confidence) | 1 | Day 0 |
| Change 4 (inference detector) | 1.5 | Day 0 |
| Change 5 (judge loop investigation + activation) | 2-3 | Day 0 |
| Change 6 (portal display) | 1.5 | Day 0-1 |
| Backfill confidence for all rows | 0.5 | Day 0 |
| Re-compose 15 + spot check | 1.5 | Day 0 overnight |
| Re-compose 50 more, Tim review | parallel | Days 1-2 |
| Re-compose remainder | parallel | Days 2-4 |
| **Total Day 0 code:** | **~9 hours** | overnight |
| **Total to first 15 ready:** | **~12 hours** | by tomorrow midday |
| **Total to 500 shippable:** | **~5 days** | by end of next week |

# What Plan A explicitly does NOT do (Plan B owns)

- Sentence-level attribution end-to-end (the data model supports it; populating end-to-end is Plan B work)
- `sr_claim_verifications` table (per-claim verdict with URL-fetch + content-match + recheck cycle)
- Composer state machine with hard "substrate-strict mode"
- Brain L0-L3 learning loop wiring (compounding improvement over time)
- Generalized cross-source corroboration (`apollo_cross` pattern but for any 2 verified sources)
- FCC BDC bulk ingestion (separate spec)
- AI-tell hardening (DL-199 mentor recommendation — separate ~30 min item)

These are the holy grail and they belong in Plan B with more design time.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:05 | Claude (Opus 4.7, fresh session) | Initial Plan A. 6 changes, 9-hour Day-0 budget, 5-day path to 500 shippable. |
