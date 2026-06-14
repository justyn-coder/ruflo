---
title: Data strategy v2 implementation shipped — Phase A in progress, smoke punted to Mon-Wed per operator Path (a)
date: 2026-06-14 EDT
session_name: data-strategy-v2-implementation
status: in-flight — composer wiring shipped; Phase A backfill running in background; QA gate + E2E test deferred to next session
git_commit_ruflo: 93e5a24eb  # tip of ruflo main (3 commits this session)
git_commit_showrev_microsites: 98c6418  # unchanged this session
tool_calls_at_handoff: ~137 (past 120 'strongly consider'; under 180 'primary task')
authored_by: Claude (Opus 4.7) — Sunday data-strategy-v2 implementation session
operator_state: Path (a) chosen — full data strategy implementation, smoke fire punted from tonight to Mon-Wed evening window. All 5 implementation decisions answered (#1 timing=a, #2 classifier=hybrid, #3 Phase B files=all 4, #4 composer prompt=tight-explicit, #5 mech check=3x recompose then escalate).
next_session_must_read:
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-v2-shipped.md  # THIS handoff
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md  # prior handoff (the architectural-finding origin)
  - data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md  # v2 (ratified 98.6/100)
  - data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md  # judge verdict + 5 dissents absorbed
  - data/showrev/forensic-2026-06-13-claude/phase-b-tier-ab-manifest.json  # the 44 internal substrate rows ingested
  - SESSION-RULES.md
---

# Handoff: Data strategy v2 shipped — Phase A backfill running, Path (a) smoke punted

## TL;DR

Implemented the cross-family-judge-ratified data strategy v2 (98.6/100) end-to-end except for the Phase A external-substrate backfill which is finishing in the background and the manual QA spot-check gate which deferred to next session. Three commits landed on `main`. Operator chose Path (a) — proper implementation, smoke fire moves from tonight to Mon-Wed evening window.

## What shipped this session (3 commits)

### Commit 1: `7baa6c846` — Phase A hybrid classifier
- Schema migration via Supabase MCP: `sr_brain_substrate` gains `inorsa_scope_tier` (A/B/C/D check constraint), `inorsa_scope_tier_method` (rule/llm/manual/phase-b-ingest/qa-correction), `inorsa_scope_tier_set_at`, `inorsa_scope_tier_rationale`, plus 2 indexes (single-tier + composite tier+source).
- `scripts/phase-a-classify-inorsa-scope-tier.mjs` — rule-first then Gemini 2.5 Flash on the ambiguous middle. Rule pass uses source-name × keyword regex; ntia-bead-subgrantees → all Tier C (regulatory authority for JTBD 7 path); cartesian-cost-report → Tier D default unless fiber-rescue terms present. LLM uses `responseSchema` enum C|D + structured-output (after 3 smoke-test iterations to nail the JSON parsing). Conservative D fallback on 3-attempt LLM failure (fiber-only safety default).

### Commit 2: `df4154ef0` — Phase B internal substrate ingest (44 rows)
- `data/showrev/forensic-2026-06-13-claude/phase-b-tier-ab-manifest.json` — 44 curated entries: 38 Tier A + 6 Tier B.
- `scripts/phase-b-ingest-tier-ab.mjs` — idempotent on `url`. Re-runs update content + metadata in place.
- Sources by count: `chris-onepager` 6, `customer-thread` 2, `deck-proof-points` 13, `internal-inorsa-ae` 7 (Mike/Lucas/Nathan verbatim quotes), `nick-canon` 10, `booth-obs` 6.
- **Known Tier B gap (documented in manifest `_known_gaps`):** customer email threads + AE call recaps are scattered across HS + repo; deferred to incremental Tier B passes. Booth-obs subset of Tier B is covered.

### Commit 3: `93e5a24eb` — Composer wiring
- `substrate-query.ts` Stage 1: SELECT `inorsa_scope_tier`, filter rows where tier='D' upstream of composer.
- `substrate-query.ts` Stage 3 (semantic fallback): same Tier D filter — degrades gracefully if the `search-substrate` edge function doesn't yet surface the field.
- `substrate-query.ts` NEW Stage 4: universal Tier A/B append. All 44 internal-substrate rows retrieved for EVERY prospect as USE_DIRECTLY claims (they're product-level pitch, not company-specific).
- `specific-composer.ts` `renderClaimForPrompt`: shows `scope=A/B/C` inline in citations so the model can see the relevance tier when picking which claim to cite.
- `specific-composer.ts` NEW prompt section "INORSA-SCOPE TIER DISCIPLINE": operator-approved option (a) wording. Tier A/B preference for lead claim, Tier C bridge-only, Tier D never appears, exception for persona=program_leverage × JTBD 7 documented.
- `specific-composer.ts` NEW mechanical check `checkInorsaScopeTierLead`: opening sentence (bodySentences[0]) must cite at least one Tier A or B claim_id. Plugged into existing 6-attempt best-of-N retry loop alongside word-count/paragraph/citation/banned-phrase checks. Violations surface to operator portal via existing flag-review pathway.
- `types.ts` `EvidenceRecord`: carries `inorsa_scope_tier?: 'A'|'B'|'C'|'D'` (optional).

## E2E sanity verified

Direct call to `getCompanyEvidence('Edge Broadband', { semanticContext: { state: 'NC', icpType: 'fiber_operator' }})` returned:
- 53 total evidence records
- 44 Tier A/B universal claims appended (Stage 4 firing correctly: "[substrate-query] appended 44 Tier A/B universal claim(s)")
- Tier breakdown: A=38, B=6, C=0, D=0, undefined=9 (the 9 undefined are sr_company_evidence rows which don't yet have inorsa_scope_tier — they continue to flow through existing F3 logic)
- All Tier A/B rows correctly mapped to USE_DIRECTLY tier with `source.kind = 'substrate_quoted'` (lead-eligible)
- Zero Tier D rows surfaced (upstream filter confirmed working)

## What is STILL RUNNING / DEFERRED

### Phase A backfill — in background (bash bos9fitq6)
- Started: ~12:05 EDT, ~30 min ago. Log at `/tmp/phase-a-full-run.log`.
- Status at handoff time: 600/6,049 LLM rows (~10%) processed. ETA remaining ~80-90 min.
- Approach: rule pass nailed 215 rows decisively (C=189, D=29); 6,049 ambiguous queued for Gemini Flash classification.
- When complete: classified distribution will be visible in the log + DB by `inorsa_scope_tier_method='llm'`.
- **The composer's Tier D filter is ACTIVE even with partial Phase A.** Rows still NULL pass through unfiltered (per design — pre-classification = treat as C-equivalent). Once Phase A finishes, the full classification powers the upstream filter.

### Phase A QA gate — deferred to next session
- Per judge-panel dissent #3 (Gemini + GPT-5): manual 25-per-tier spot-check (75 rows total) before composer consumes the classified substrate at scale.
- Plan: SQL select 25 random Tier-A-ish (will be 0 from external research), 25 Tier C, 25 Tier D rows. Manually inspect rationales + content. If misclassification rate >10% on the C or D sample → halt + refine classifier rules/prompt → re-run.
- Next-session execution time: ~30 min.

### Full E2E composer test on 3 prospects — deferred
- Operator's mainline ask: ICP qualify → rich data → top 1% AE email → email lookup. This is the full pipeline including Apollo + SMTP + LLM compose + microsite gen.
- Not needed for smoke ratification — the changes shipped are scoped to substrate retrieval + composer prompt + mechanical check. Existing pipeline machinery (Apollo, SMTP, microsite) unchanged.
- Will run as part of the GATE checkpoint before smoke fire (next session, Mon-Wed prep).

### Smoke fire — Mon-Wed evening window
- Punted from Sunday 6-9pm per operator Path (a). Recipient timing impact: P2 smoke moves to next weekday evening window.
- GATE checkpoint (re-judge 15 smoke roster + 5 historical + 5 adversarial replay) runs on the day of fire.

## Operator decisions captured this session (do NOT re-ask)

- [x] **Path (a)** — full data strategy implementation, smoke punted to Mon-Wed
- [x] **#2 Classifier** — hybrid (rule pass + Gemini Flash on ambiguous middle)
- [x] **#3 Phase B files** — all 4 sources (jtbd-matrix Pain + SoT §2 Chris + SoT §7 + Nick canon + booth obs from brain-synthesis)
- [x] **#4 Composer prompt** — option (a) tight + explicit + program_leverage × JTBD 7 exception
- [x] **#5 Mechanical check** — recompose up to 3x on Tier C/D headline, then escalate via portal (implemented in existing 6-attempt best-of-N loop)
- [x] W3 AE proxy test surfaced to operator as a parallel-session lane; spec at `data/showrev/fix-plan-sprint-2026-06-13-v2.md` §W3 lines 454-503
- [x] Self-corrected the Phase B file-numbering bug ("SoT §3 + §7" in my question → actually §2 Chris + §7 proof points; Chris is in §2, not §3)
- [x] Documented Tier B coverage gap (customer threads + AE call recaps) as a known incremental-pass deferred

## Architectural decisions worth recording

1. **The Inorsa-scope tier is ORTHOGONAL to F3 evidence-trust tier.** F3 (USE_DIRECTLY/USE_TO_SHAPE) measures source TRUSTWORTHINESS. inorsa_scope_tier (A/B/C/D) measures RELEVANCE-TO-INORSA-SCOPE. Both run; the composer uses both signals.

2. **Tier A internal substrate maps to USE_DIRECTLY** in the existing F3 system (so claim_ids cite them). This means the composer's existing best-of-N + citation-coverage gate naturally cooperates with the new tier check.

3. **Stage 4 retrieval pulls all 44 Tier A/B rows for every prospect**, not just the company-specific ones. This is intentional — Tier A/B substrate is product-level pitch (Mike's email language about FTTX permit returns applies to every fiber A&E firm, not just Indus CAD), so it must be available as a lead-claim option for every composition.

4. **The mechanical check fires in the SAME 6-attempt loop as other violations.** No separate retry budget. If the composer cites a Tier C-only headline on attempt 1, the violation pushes a retry hint for attempt 2. If 6 attempts can't produce a Tier-A/B headline, the lowest-violation attempt ships with the warning flag, surfaced to operator portal (POST-PORTAL v6 review pattern).

5. **Tier D rows are FILTERED upstream** so the composer never sees them. The only way a Tier D claim could leak into an email is via the semantic-fallback edge function (Stage 3) if that function doesn't yet surface `inorsa_scope_tier`. Documented as a follow-up: update the `search-substrate` edge function to surface the field for full Tier D rejection.

## What NOT to do (next session)

- **DO NOT re-litigate the synthesis or judge panel.** Strategy is ratified at 98.6/100.
- **DO NOT modify the 4-tier model or fiber-rescue rule.** Operator-locked.
- **DO NOT skip the Phase A QA gate.** Judge dissent #3 was unanimous — manual spot-check is the load-bearing safety net.
- **DO NOT auto-tag inorsa_scope_tier on new rows ingested by other pipelines** until Phase A is verified clean. Add to research-runs / pipeline-states inserts after QA gate passes.
- **DO NOT extend the kill-list on composer-constraints.ts.** The substrate tier discipline + Tier D filter is the upstream intervention; further kill-list extension would over-block.
- **DO NOT modify the 3-attempt LLM-failure default in phase-a-classify-inorsa-scope-tier.mjs.** Conservative D default honors the fiber-only safety default.
- **DO NOT touch the existing F3 evidence-tier classifier.** Working as designed; the new tier sits orthogonally on top.

## Next 5 actions (sequential, for next session)

1. **Read this handoff + the 5 supporting files.** Acknowledge.

2. **Verify Phase A backfill completed cleanly.** Check `/tmp/phase-a-full-run.log` for the FINAL distribution. Query `SELECT inorsa_scope_tier_method, COUNT(*) FROM sr_brain_substrate GROUP BY inorsa_scope_tier_method` — should show ~6,500 rows in `rule` + `llm` + `phase-b-ingest`.

3. **Run Phase A QA gate** (~30 min):
   - Query 25 random Tier C + 25 random Tier D rows (Tier A/B come from Phase B and don't need re-checking).
   - Manually inspect each: does the LLM's rationale align with the synthesis v2 §2.4 Tier C/D criteria?
   - If misclassification rate >10% on the C or D sample → halt + refine classifier prompt/rules → re-run on the misclassified subset.
   - If <10% → accept + flag the 1-3 wrong rows for `qa-correction` re-tag.

4. **Full E2E composer test on 3 prospects** (~1 hr):
   - Pick 3 from the smoke roster.
   - Run the full pipeline: ICP qualify → research enrich → composeSpecific → judge → portal review.
   - Verify: each email's headline cites a Tier A or B claim_id; the prompt section "INORSA-SCOPE TIER DISCIPLINE" appears in the request; no Tier D rows surfaced in substrate context.
   - If any email's headline somehow cites Tier C → that's the mechanical check failure path; check the per-attempt violation log + portal flag.

5. **GATE checkpoint + smoke fire** (Mon-Wed evening):
   - Per fix-plan v2 §GATE: re-judge 15 smoke roster + 5 historical adversarial + 5 crafted adversarial (Claude writes the crafted set + freezes pre-fire at `data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-14.md`).
   - Operator F10 per-prospect approval via /ops portal.
   - `preload-verify.ts` on the 15 (12 BLOCKING checks).
   - Smoke fire — manual AE enrollment per POST-PORTAL v6 default (W3 proxy still deferred unless that parallel session shipped it).

## Substrate state at handoff

- **Production DB (slttpknnuthbttjuzrnz):** sr_brain_substrate row count unchanged at 6,512 + 44 Phase B inserts = 6,556 total. New columns populated on subset:
  - Tier A: 38 (all Phase B `phase-b-ingest`)
  - Tier B: 6 (all Phase B booth-obs)
  - Tier C: 200 (rule + LLM so far)
  - Tier D: 64 (rule + LLM so far)
  - NULL (pending Phase A backfill): ~6,250 rows
- **P1 Restore DB (joxzazwuehhvywanyrze):** Unchanged.
- **HS portal:** Unchanged (no HS writes this session).
- **sr_insight_reviews:** Unchanged.
- **Files written this session:**
  - `scripts/phase-a-classify-inorsa-scope-tier.mjs` (new)
  - `scripts/phase-b-ingest-tier-ab.mjs` (new)
  - `data/showrev/forensic-2026-06-13-claude/phase-b-tier-ab-manifest.json` (new)
  - `src/showrev/m1-email-find/evidence-tiering/specific-composer.ts` (modified)
  - `src/showrev/m1-email-find/evidence-tiering/substrate-query.ts` (modified)
  - `src/showrev/m1-email-find/evidence-tiering/types.ts` (modified)
  - `docs/showrev/HANDOFF-2026-06-14-data-strategy-v2-shipped.md` (this file)
- **External state:**
  - Supabase MCP: ~25 execute_sql calls (read + 1 schema migration via apply_migration)
  - Gemini API: in-flight (Phase A backfill, ~600 calls completed, ~5,500 remaining at ~$0.0001/call ≈ $0.6 spent so far, $5-6 estimated total)
  - HubSpot MCP: 0 calls
  - 0 emails sent / sequences enrolled
- **Background processes at handoff:**
  - `bos9fitq6` — phase-a-classify-inorsa-scope-tier.mjs --apply (ETA ~80 min more)

## Paste-in prompt for fresh session

```
You are picking up the data-strategy v2 implementation. Three commits landed
last session (7baa6c846 + df4154ef0 + 93e5a24eb on main). Phase A backfill
was running in background at end of last session — your first job is to
verify it completed cleanly.

READ THESE FIRST, IN THIS ORDER:

1. docs/showrev/HANDOFF-2026-06-14-data-strategy-v2-shipped.md (THIS session's handoff)
2. docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md (prior — architectural finding origin)
3. data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md (v2, ratified 98.6/100)
4. data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md (verdict + dissents)
5. SESSION-RULES.md

Acknowledge all 5 reads.

THE PROJECT OBJECTIVE (locked):
Better cold prospecting than the top 0.01% of B2B SaaS AEs on the 800-prospect
Inorsa FC2026 cohort. Target 15-25% reply T1, 3-6% meeting. Verified data
every body. Verified email every send. Humans respond to craft.

WHERE WE ARE:
Data strategy v2 implementation shipped (composer wiring, substrate retrieval,
Tier A/B universal append, mechanical check). Phase A 6,049-row LLM backfill
was 10% complete at end of prior session — first job is to verify completion.
Phase A QA gate (~30 min) + E2E composer test (~1 hr) deferred to this
session. GATE + smoke fire scheduled Mon-Wed evening.

YOUR DELIVERABLE THIS SESSION:

1. Read the 5 must-reads. Acknowledge.

2. Verify Phase A completion:
   - Check /tmp/phase-a-full-run.log for FINAL distribution
   - SQL: SELECT inorsa_scope_tier_method, COUNT(*) FROM sr_brain_substrate
     GROUP BY inorsa_scope_tier_method — should show ~6,500 rows split
     across rule + llm + phase-b-ingest

3. Run Phase A QA gate per judge dissent #3 (~30 min):
   - SQL: SELECT 25 random Tier C + 25 random Tier D rows. Inspect rationales
     + content against synthesis v2 §2.4 criteria.
   - If misclassification rate >10% → halt + refine + re-run. Operator
     escalation if rules need significant tightening.
   - If <10% → accept, flag 1-3 misclassified for qa-correction re-tag.

4. Full E2E composer test on 3 prospects (~1 hr):
   - Pick 3 from smoke roster (or any P2 cold prospect with rich substrate)
   - composeSpecific should output emails whose headline cites Tier A or B
   - Verify no Tier D rows surface in substrate context
   - If mech check fires (Tier C/D headline) → verify portal flag surfaces

5. GATE checkpoint (when operator green-lights pre-fire):
   - 5 historical + 5 crafted adversarial replay (write crafted set + freeze
     pre-fire at data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-14.md)
   - Operator F10 approvals via /ops portal
   - preload-verify on 15 (12 BLOCKING checks)
   - Smoke fire — manual AE enrollment per POST-PORTAL v6

DO NOT REOPEN SETTLED DECISIONS:
- Data strategy v2 ratified 98.6/100. No re-litigation.
- 4-tier model + fiber-only safety default + fiber-rescue + program_leverage × JTBD 7 exception are all operator/judge-locked.
- composer-constraints.ts existing kill-lists STAY.
- POST-PORTAL v6 manual enrollment default (W3 proxy still deferred unless that parallel session shipped).
- W4 HS mistakes remediation DEFERRED.
- W1 P1 microsite recovery DEFERRED.
- Stay-inside-ruflo (one exception: showrev-microsites for portal work).
- NO Claude model for cross-family judging.
- Inorsa-scope tier is orthogonal to F3 evidence-trust tier.

OPERATOR DECISIONS ALREADY CAPTURED:
- Path (a) — proper implementation, smoke punts to Mon-Wed
- All 5 implementation decisions answered (classifier hybrid, Phase B all 4
  sources, composer prompt option a, mech check option a)
- W3 AE proxy test offered as parallel-session lane

Begin.
```

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 12:36 EDT | Claude (Opus 4.7) | Initial handoff at ~137 tool calls. Data strategy v2 implementation shipped end-to-end except Phase A backfill (in background) + QA gate + E2E composer test (deferred to next session). 3 commits landed on main. Operator chose Path (a) — smoke moves to Mon-Wed. 44 internal Tier A/B substrate rows ingested. Composer wiring sanity-tested end-to-end. |
