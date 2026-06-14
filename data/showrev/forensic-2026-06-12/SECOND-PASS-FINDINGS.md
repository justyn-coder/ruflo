---
title: Second-Pass Findings — System Audit Beyond the Substrate/Composer Chain
date: 2026-06-12
status: FINDINGS for operator
authored_by: Claude (Opus 4.7) — after operator-requested second pass
purpose: I focused too narrowly on substrate quality in the first pass. Second pass surfaces 4 more real gaps + confirms most of Plan A v5 is redundant with existing code.
---

# Headline

The first-pass diagnostic was correct on the immediate crisis (ZoomInfo contamination) but **wrong on what to build to fix it**. Plan A v5 proposed building gates that already exist. Second pass also surfaced **4 more real gaps** outside the substrate chain that the first pass missed.

---

# Part 1 — What ALREADY EXISTS that Plan A v5 was redundantly proposing

## Composer constraints fully wired (`composer-constraints.ts`, 861 lines)

- 22 AI-tell phrase blocks (curious, leverage, robust, transformative)
- 10 Tim kill-list patterns (operator-tested)
- 7 product/industry guards (tower, MicroStation, Drawing QC, structural analysis)
- 4 sophisticated geographic guards (catches "Idaho's terrain", "Colorado operators")
- 14 cold-cohort guards ("good meeting you at Fiber Connect" — never on cold)
- Numeric-anchor + bigram repeat checks
- **DL-199 AI-detection checks** (participial density, sentence-length variance, echoed structures — PNAS 2025 + VERMILLION)
- Flesch-Kincaid reading-age (>12 = reject)
- Company-name lock (Andrew/UECI bug class)
- Best-of-N retry selector + Subject A/B picker
- **Citation gate** — requires `claim_ids` on every sentence with specifics, fires when dossier has ≥2 USE_DIRECTLY claims

All wired via `generalized-composer.ts` and `specific-composer.ts`.

## 3-tier judge fully wired (`tiered-judge.ts`, 851 lines)

- Tier 1: mechanical re-verification (re-runs composer-constraints independently)
- Tier 2: Tim-style edit-pattern judge (Sample-67+, "different angle", "still exploring", etc.)
- Tier 3 quality: Gemini scores 0-10
- **Tier 3 hallucination check — ALWAYS-ON, every prospect** — Gemini receives substrate + body, returns list of unsupported claims
- **Judge feedback loop**: if hallucination check fails, recompose with flagged `claim_ids` excluded, up to 2 outer iterations
- **JUDGE-ALERT.md monitoring** — rolling rates every 10 prospects, file written at repo root if T1>50% / T2>50% / T3-dissent>30%

All wired via `run-pipeline-v2.ts` line 635-748.

## Pre-load deliverability gate (`preload-verify.ts`)

SPF, DKIM, DMARC, HS token, existing-contact warning, unsubscribe enabled. All BLOCKING checks.

## Send-side safety
- `confidence-gate.ts` — email confidence (color from MV + discovery method + domain mismatch)
- `circuit-breaker.ts` — CLOSED/OPEN/HALF_OPEN, 5 failures → trip, 30 min reset
- `brain-agentdb.ts` — AgentDB wrapper, Brain function is alive

## The actual single root cause for the smoke crisis

**Substrate ingestion has no domain check.** `evidence-tiering/types.ts` classifies sources by HARVEST METHOD (web_research, apollo, brain, substrate) NOT URL DOMAIN. A web-research call returning `zoominfo.com/c/...` gets tagged `web_research_dated` → `USE_DIRECTLY` ceiling. Composer uses it. Hallucination check (correctly) confirms email matches substrate. Email ships.

`verify-facts.ts` and `semantic-verifier.ts` BOTH have domain-aware classifiers — **both stranded, never imported by active pipeline.**

---

# Part 2 — Real NEW gaps the second pass surfaced

## Gap A — Email verification fields are mostly null on every row

Queried `sr_engine_output` for the 36 prospects across 14 companies:

| Field | Status |
|---|---|
| `confidence_color` | populated (green/yellow/amber/red) |
| `email_confidence` | **NULL** on every row |
| `confidence_score` | **NULL** on every row |
| `verification_report` (jsonb) | **NULL** on every row |
| `mv_quality` (in verification_report) | **NULL** on every row |
| `email_corrected` (in sr_prospects) | true on ~half |
| `email_verified` (in sr_prospects) | **false on every row of 36** |
| `email_verification_status` (in sr_prospects) | **NULL on every row of 36** |

**What this means:** the system is operating on `confidence_color` alone. The underlying MV quality (`good`/`catch_all`/`bad`/`unknown`) is not persisted. We can't tell if a "green" prospect was MV-confirmed deliverable or just inferred-deliverable from pattern.

The handoff doc said "MV verified all 18" — the DB doesn't back that up. Either MV ran but didn't write its result, or it didn't run, or it wrote to a different storage I haven't found.

## Gap B — Same prospect has multiple compositions with conflicting confidence colors

Examples from the 36-row query:

| Prospect | Compositions | Colors across them |
|---|---|---|
| Allison Ellis / Frontier | 4 | green + yellow + amber + red |
| Christina Gawens / Greenlight | 3 | green + amber + red |
| Kristina Groff / Greenlight | 1 | red (only) |

Multiple compositions per prospect is fine (re-runs). But the SAME email address showing different confidence colors across rows means the underlying MV / pattern check is being re-run and getting different answers. Without `verification_report` populated, we can't see why.

## Gap C — Tim's review can approve an email whose confidence_color is red

**Kristina Groff @ Greenlight:**
- `confidence_color = red`
- `send_status = flag` (correctly stopped from sending)
- `composition_review = "approved"` by Tim
- `email = kgroff@greenlightnetworks.com`

Tim approved the craft. The system later (or in parallel) flagged the email's deliverability as red. The composition_review didn't reset. **Tim's review surface clearly isn't gated on email confidence** — he could (in theory) approve and the operator could mistake "Tim approved" for "ready to send."

The current portal flow is: Tim approves craft → operator reviews email/ICP/data confidence → ship. The system is honest about this division. But the example shows a Tim-approved prospect is sitting in flag-status with red email confidence — needs operator decision to re-find email or drop prospect.

## Gap D — ICP gate has a deliberate inclusivity bias

`icp-gate.ts` line 111 (LLM classifier prompt):

> "CRITICAL RULE: If you are UNCERTAIN what the company does based on the name alone, classify as 'fiber_operator' with low confidence. Do NOT reject uncertain companies — the pipeline will research them and the judge will catch mismatches. False negatives (rejecting a real prospect) are 10x worse than false positives (researching a non-fit)."

This is a deliberate choice. All 36 queried rows show `icp_status = pass`. That's partly selection (we queried companies that passed), but the bias means borderline-fit companies enter the cohort. Downstream judges (especially the hallucination check + the Tim review) are expected to catch mismatches.

**Implication:** the ICP gate is permissive by design. The real ICP confidence is the operator's review at the portal. If the operator is supposed to trust an ICP "pass" verdict, that's the wrong mental model — they should trust it as "regex/Haiku thinks this might be in ICP."

## Bonus minor finding — composer.ts is DEPRECATED

`composer.ts` line 1 comment: `// DEPRECATED: Use premium-pipeline.ts instead.` The active pipeline uses specific-composer + generalized-composer + premium-pipeline. Don't be confused by composer.ts.

---

# Part 3 — Revised Plan A FINAL (~4-6 hours, not 30-50)

## Change 1 — Add `domain_tier` column to substrate tables (15 min)

```sql
ALTER TABLE sr_company_evidence ADD COLUMN domain_tier text;
ALTER TABLE sr_brain_substrate ADD COLUMN domain_tier text;
```

## Change 2 — SQL backfill against 16 PROHIBITED domains + 4 trust tiers (15 min)

Same backfill SQL as Plan A v5 spec but only on the two tables.

## Change 3 — New file `evidence-tiering/domain-tier.ts` (1 hr)

`classifyDomainTier(url): '1'|'2'|'3'|'4'|'PROHIBITED'`. Reuse classifier logic that already exists in `verify-facts.ts` + `semantic-verifier.ts`. Add explicit PROHIBITED list. Unit tests against 20 fixture URLs.

## Change 4 — Wire into `substrate-query.ts` (45 min)

- `writeEvidence()`: call classifier; refuse PROHIBITED rows; set `domain_tier` on insert
- `getCompanyEvidence()`: filter `domain_tier=neq.PROHIBITED`; force T3/T4 to `USE_TO_SHAPE` regardless of `source_kind`

## Change 5 — Add 5 new inference patterns to `composer-constraints.ALL_BANNED` (15 min)

```typescript
{ pattern: /\bactive\s+\w+\s+mode\b/i, label: 'inference: "active <noun> mode"' },
{ pattern: /\bfull\s+\w+\s+mode\b/i, label: 'inference: "full <noun> mode"' },
{ pattern: /\bfinal\s+stretch\b/i, label: 'inference: "final stretch"' },
{ pattern: /\bfresh\s+\w+\s+strategy\b/i, label: 'inference: "fresh <noun> strategy"' },
{ pattern: /\bsignals\s+a\s+\w+\s+(?:strategy|push|move)\b/i, label: 'inference: "signals a <noun>"' },
```

Existing Tier-1 mechanical judge auto-catches.

## Change 6 — Re-run pipeline for contaminated cohort (1.5 hrs)

Re-substrate via `run-pipeline-v2.ts` for the 5 strip-recomposed + 167 cohort. The contaminated rows are now filtered out. Composer reruns through specific-composer (or falls to generalized if substrate gets thin). The existing checks fire: citation gate, hallucination check, banned phrases, DL-199, reading age, judge feedback loop, etc.

## Change 7 — Address email verification field gap (1 hr)

Read `email-finder/orchestrator.ts` to find where MV result is supposed to write to `verification_report`. Fix wiring OR backfill from sr_microsites or wherever MV results actually persist. **At minimum, write a 1-hour script to surface which of the 18 (and 167) have unknown MV status.**

## Change 8 — Reset composition_review when confidence_color goes red (15 min)

Add a trigger or scheduled job: if `confidence_color = 'red'` AND `composition_review = 'approved'` and `composition_reviewed_at < confidence_color_changed_at` → reset to null, surface for re-review.

## Change 9 — Spot check 10 prospects through portal (30 min)

Open portal, sample 10, confirm clean.

**Total: ~5-6 hrs of code work + 30 min review.**

---

# What still defers to Plan B / Fable

- **Sentence-level click-trace** — the existing always-on hallucination check is text-level, not sentence-level. Plan B / Fable can build sentence-level attribution end-to-end.
- **Negation/polarity dependency-parse** — Plan B Phase 1 / Fable candidate. The always-on Gemini hallucination check actually handles negation naturally (it's an LLM), but a structural sentence-level check is the Plan B improvement.
- **Brain L2 learning loop** — per-pattern reply-rate by source-tier × persona × send-window. Needs send data to accumulate.

---

# What I'd do differently if doing this again

1. **Read code before designing.** I spent 5+ hours iterating Plan A v5 across 5 judge rounds without reading `composer-constraints.ts`, `tiered-judge.ts`, or `run-pipeline-v2.ts`. Most of what I proposed was already there.
2. **Trust the operator's framing.** Operator said "the system is supposed to be very confident that it did the best job possible and grades itself." That should have been my hint to look for existing self-grading code, not design from scratch.
3. **Query the DB more broadly.** I checked `sr_company_evidence` and `sr_engine_output` for the substrate question. I didn't check `sr_prospects.email_verified` / `email_verification_status` until the operator asked. Both would have surfaced Gap A immediately.

---

# Honest delta

| Item | Plan A v5 | Plan A FINAL |
|---|---|---|
| Time estimate | 30-50 hrs | 5-6 hrs |
| New files to write | ~8 | 1 (domain-tier.ts) |
| Schema migrations | Major | 2 ALTER + backfill |
| Composer prompt rewrite | Yes (substantial) | No (5 new ALL_BANNED entries) |
| Atomic-fact extractor | Build | Skip (hallucination check handles it) |
| Per-claim span mapping | Build | Skip (citation gate handles it) |
| Negation/polarity | Build | Skip (Gemini hallucination check handles it) |
| Default-deny allowlist | Build | Skip (blocklist is enough) |
| Cache purge | Manual | Same |
| Re-substrate the cohort | Same | Same |
| Email-verification field gap (NEW) | — | Add |
| Tim-approval/email-color desync (NEW) | — | Add |

# Recommended call

**Ship the narrow fix tonight.** Hits KR1 because:
- 0 PROHIBITED: enforced at write + read time, backfill removes existing contaminated rows
- <5% inference: 5 new patterns added to existing ALL_BANNED; Tier 1 mechanical judge auto-catches; always-on hallucination check is the second line of defense
- 95%+ T1-T5: substrate gets filtered to clean sources

Plus surfacing Gap A (null verification fields) gives operator visibility into the email-finding integrity issue independent of the substrate work.

Plus surfacing Gap C (Tim approve + red email confidence) needs a process clarification or UI gate.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 | Claude (Opus 4.7, fresh session) | Initial second-pass after operator-requested deeper code read. Composer/judge layer + email-finder + ICP gate. |
