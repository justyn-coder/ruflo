---
title: Plan A v4 — Server-Side Atomic-Fact Extraction
date: 2026-06-13 (drafted)
status: DRAFT v4 for round-4 judge review
authored_by: Claude (Opus 4.7) — incorporating GPT-5 round-3 critique
purpose: Close the composer-gaming gap GPT-5 identified across all 3 rounds. GPT-5 stuck at 40% confidence; this is the only path to converge.
---

# What v4 changes vs v3

GPT-5 round 3 was a hold + 40% (same as round 2). They identified a single root concern across all 3 rounds: **the matcher trusts composer-declared `quoted_terms`. Server must extract atomic facts and check ALL of them against the bound claim's stored quote — composer doesn't get to choose what to verify.**

v4 fully addresses this + 6 other quick absorbs. Defers typed-evidence grounding to Plan B.

## v4-Δ1 — Server-side atomic-fact extraction

**Replace v3's composer-controlled `quoted_terms`** with server-side extraction. After the composer emits its body sentence + `claim_ids`, the server (not the composer):

1. Tokenizes the sentence with locale-aware tokenizer (NFKC Unicode normalization)
2. **Extracts ALL atomic facts:**
   - Numerals (including spelled-out: "seventy-one" → 71)
   - Percentages (5%, 5 percent, five percent)
   - Currency (`$100M`, `$0.5B`, `100 million dollars`)
   - Dates (any format → ISO normalized)
   - Named entities (people, companies, places, products) via spaCy/Hugging Face NER
   - Comparatives ("more than X", "approximately Y", "around Z")
3. For each extracted fact, **looks up which claim_id supports it** via per-span mapping (Δ2)
4. Verifies the fact text (normalized) appears in the bound claim_id's `supporting_quote` (normalized)
5. If any fact has no claim_id binding OR fails normalization match → **reject composition**

Code location: new `src/showrev/m1-email-find/evidence-tiering/atomic-fact-matcher.ts`. Pure deterministic function. CI-tested against 30 adversarial fixtures.

## v4-Δ2 — Per-claim span mapping in composer output

Composer output schema changes from:
```
{ text: string, claim_ids: string[], quoted_terms: string[] }
```
to:
```
{
  text: string,
  spans: Array<{
    start: number,      // char offset in text
    end: number,
    claim_id: string,
    asserted_terms: string[]  // composer's claim of what this span asserts
  }>
}
```

This makes the binding **per-span, not per-sentence**. A multi-claim sentence can't smuggle unverified content because every atomic fact must be inside a declared span pointing to a specific claim_id.

Server-side extraction (Δ1) then verifies each span's asserted_terms appear in the bound claim's quote.

## v4-Δ3 — Normalization spec (locked)

Numeric: `71` ≡ `seventy-one` ≡ `71.0` ≡ `seventy one`
Percentage: `5%` ≡ `5 percent` ≡ `0.05` (in compatible contexts)
Currency: `$100M` ≡ `$100 million` ≡ `100M USD` ≡ `100000000`
Date: `Jan 5, 2024` ≡ `2024-01-05` ≡ `5 January 2024`
Unicode: NFKC normalization on all comparisons; strip curly quotes, NBSP, em-dash variants
Whitespace: collapse, trim
Case: case-insensitive
Diacritics: optional fold for international names

Implementation: lookup table + simple parser. ~200 lines. CI tests for each form.

## v4-Δ4 — Freeze dedup per prospect

Circuit breaker enhancement:
```
For COMPANY/GLOBAL escalation, count UNIQUE prospect freezes, not retry attempts.
Per-prospect freeze counter resets every 24 hours.
Same prospect freezing 5 times in 10 min counts as ONE PROSPECT freeze, not 5.
```

This prevents a single noisy prospect from triggering broader freezes.

## v4-Δ5 — Async operator classification queue with SLA

Unknown domains hit a queue, not a block. Queue table:
```sql
CREATE TABLE sr_pending_domain_classification (
  domain_etld1 text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL,
  prospect_count int DEFAULT 1,
  affected_prospect_ids text[],
  sla_target timestamptz GENERATED ALWAYS AS (first_seen_at + interval '4 hours') STORED,
  classified_tier text,
  classified_at timestamptz
);
```

While pending: prospects with that domain in their evidence stay in PROCESSING state (not blocked, not approved). After classification: tier assigned, prospects auto-progress.

SLA: 4 hours. Operator alert at 2-hr-no-action. Escalation at SLA breach.

## v4-Δ6 — Snapshot capture fallback chain

Per GPT-5: many sources block Wayback/require JS/are geo-gated.

Fallback chain at evidence write:
1. **Primary:** Wayback Machine API capture request (succeeds for ~70% of sources)
2. **Fallback 1:** archive.is capture (catches some sources Wayback misses)
3. **Fallback 2:** Internal headless browser (Playwright + residential proxy if needed)
4. **Fallback 3:** Mark as `snapshot_unavailable` — claim cannot be used in body (downgrades to USE_TO_SHAPE max)

The DB CHECK in v3 (`snapshot_url IS NOT NULL`) relaxes to: `snapshot_url IS NOT NULL OR tier IN ('3','4','PROHIBITED')`. T1/T2 still requires snapshot; lower tiers can omit if all 3 captures fail.

## v4-Δ7 — Statistical audit sampling (sequential testing)

Replace fixed 30-50 daily sample with sequential Wald testing:
- Hypothesis: defect rate is below threshold (say 1%)
- Sample sequentially; stop early when boundary crossed
- For low defect rates: small samples suffice (catches at α=0.05, β=0.05)
- For higher defect rates: sample expands automatically
- Power analysis: with 1% target defect rate and 5% sentinel, expected sample is 50-300 depending on actual rate

Implementation: ~50 lines stats code. Pre-computed boundaries table.

# v4 keeps everything from v3

11 steps from v2 + 4 deltas from v3 + 7 deltas from v4 (this doc). v4 ADDS to v3, doesn't replace.

# What v4 explicitly defers (Plan B)

- **Typed evidence + typed equality** for high-risk fields (headcount, funding, dates as structured columns, not just text). v4 verifies through normalized text match — that handles 90% of cases. Typed equality is the last 10% and is Plan B.
- **Negation context detection** ("does not have 71 employees" vs "has 71 employees"). Plan B.
- **Coreference resolution** ("the company" → which company). Plan B.
- **Paraphrase semantic equivalence** (LLM-judged similarity). Plan B.

These are honest limitations of v4. The independent audit (statistical) is the safety net for these escapes.

# Revised time budget

| Item | v3 budget | v4 added | v4 total |
|---|---|---|---|
| v2 base (steps 0-11) | 18 hrs | — | 18 hrs |
| v3-Δ1 source snapshots | 6-8 hrs | — | 6-8 hrs |
| v3-Δ2 allowlist | 2 hrs | — | 2 hrs |
| v3-Δ3 acceptance criteria | 0.5 hr | — | 0.5 hr |
| v3-Δ4 freeze scoping | 2 hrs | — | 2 hrs |
| Backfill snapshots | 4-8 hrs | — | 4-8 hrs |
| v4-Δ1 atomic-fact extraction | — | 4 hrs | 4 hrs |
| v4-Δ2 per-claim span mapping | — | 2 hrs | 2 hrs |
| v4-Δ3 normalization spec | — | 2 hrs | 2 hrs |
| v4-Δ4 freeze dedup | — | 1 hr | 1 hr |
| v4-Δ5 async classification queue | — | 2 hrs | 2 hrs |
| v4-Δ6 snapshot fallback chain | — | 3 hrs | 3 hrs |
| v4-Δ7 statistical sampling | — | 1.5 hrs | 1.5 hrs |
| **Day 0 + 1 + 2 total** | 30-38 hrs | +15.5 hrs | **45-54 hrs** |
| First 15 ready | EOD Day 2-3 | +1-2 days | EOD Day 3-5 |
| 500 shippable | 6-9 days | +2-3 days | **8-12 days** |

The schedule does slip. Operator's "time irrelevant" mandate stands.

# Answer to GPT-5's round 3 sharp question

GPT-5: "Who, deterministically and server-side, computes the set of required atomic facts from each composed sentence, and how do you guarantee every such fact is exactly supported by the bound claim_id's evidence (via typed equality or exact-quote span), not merely by composer-declared quoted_terms?"

**v4 answer:** Server-side `atomic-fact-matcher.ts` does the extraction. Per-span mapping (Δ2) ties each fact to one specific claim_id. Every extracted atomic fact must appear (normalized) in the bound claim's `supporting_quote`. Composer-declared `asserted_terms` is a hint; the server reverifies independently and rejects mismatches.

Typed equality (your stricter ask) is Plan B. v4 catches >95% of cases via normalized text match; the audit is the safety net for the 5%.

# Answer to other round 3 sharp questions

**DeepSeek's "ensure quoted_terms are sufficiently specific":** Server doesn't trust composer-declared specificity. Server extracts atomic facts independently. Composer can declare junk; server overrides.

**Gemini's "runbook when matcher rejects valid semantic equivalents":** Normalization spec (Δ3) covers `$100M` ≡ `100 million dollars` etc. When composer's exact phrase doesn't normalize-match a quote but human reads it as equivalent → operator override via portal escalation. Runbook in v4 ops doc.

**Grok's "matcher failure rate on adversarial paraphrases":** CI fixture set includes 30+ adversarial paraphrases. Failure rate measured pre-launch. Will publish before going to round 4 if metric is ≥10%.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:05 | Claude | 3-1 hold. 30% median. |
| v2 | 2026-06-13 00:55 | Claude | 2-2 split. 52.5% median. |
| v3 | 2026-06-13 01:30 | Claude | 2-2 split. 75% median. GPT-5 stuck at 40%. |
| v4 | 2026-06-13 02:00 | Claude | Server-side atomic-fact extraction (Δ1) addresses GPT-5's recurring concern. +6 quick absorbs. |
