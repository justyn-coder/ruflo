---
title: Sprint Plan Evaluation Rubric — fix-plan-sprint-2026-06-13.md
status: DRAFT v2 — post-Gemini-audit revision, pending operator sign-off
last_updated: 2026-06-13 EDT
version: v2
authored_by: Claude (Opus 4.7) main session, revising v1 (Claude subagent) per Gemini 2.5 Pro audit + operator Path 2 selection
target_artifact: data/showrev/fix-plan-sprint-2026-06-13.md
source_inputs:
  - data/showrev/forensic-2026-06-13-claude/audit-report.md (4 binding capabilities)
  - data/showrev/forensic-2026-06-13-claude/tool-audit.md (capability inventory)
  - canon/sources/inorsa-product-truth-nick-2026-06-04.md (kill-list canon)
  - docs/showrev/POST-PORTAL-SPEC-V6.md (ratified architecture the plan must respect)
  - data/showrev/forensic-2026-06-13-claude/rubric-external-audit.md (Gemini methodology critique)
supersedes: v1 (2026-06-13 EDT) — kept for diff reference; verdict on v1 was REVISION
---

# Sprint Plan Evaluation Rubric — v2

## Preamble

This rubric scores the ShowRev P2 FIX-Sprint plan (`data/showrev/fix-plan-sprint-2026-06-13.md`) against the operator's explicit apex: **quality and precision are the pillars — speed is irrelevant.** Operator-elevated 2026-06-13: **"humans respond to craft / elegance / insight"** — that insight maps directly to the cold-prospecting goal (recipients respond to craft, not just to correctness), so the rubric must distinguish a CORRECT plan from a BRILLIANT one, not just punish shortcuts.

The plan must serve the four binding capabilities surfaced in the audit (`audit-report.md` §"The greater objective"):
(M) Measure outcomes — observability is load-bearing for any learning,
(K) Know what is true — substrate trust is the apex of cold prospecting,
(L) Close the loop — bounce/reply data must reach composer choices,
(S) Scale humans — portal absorbs review load so operator + Tim are not bottlenecks.

**Explicit anti-pattern** this rubric is built to catch: rubrics that (a) reward speed / hour-budget compression / completeness-of-checklist over depth, OR (b) are purely defensive — punishing shortcuts but not rewarding craft. A plan that is "not wrong" is necessary but NOT sufficient. Effort estimates are NOT a scoring dimension.

---

## What changed v1 → v2 (post-Gemini-audit)

| Change | Source | Rationale |
|---|---|---|
| D1 Sequencing 15 → **13** | R-1 (Gemini) | "What facts recipients see" (D6) > "when fixes ship" (D1) |
| D4 Defensibility 13 → **11** | R-1 (Gemini) | Audit-citation is hygiene-tier; load redistributed to D10 |
| D6 Substrate-trust 12 → **14** | R-1 (Gemini) | Inverted v1 hierarchy where D1 > D6 was wrong |
| D9 Precision 5 → **10** | R-1 (Gemini) | "Precision" is named in operator apex — under-weighting was a methodological error |
| D2 Risk 14 → **13**, D3 Capability 14 → **10**, D5 Scope 10 → **7**, D7 Observability 10 → **8**, D8 Human-in-loop 7 → **4** | rebalance | Trim to absorb +3 (R-1) + +10 (D10) = +13 |
| **NEW D10 Elegance / Insight / Second-Order — weight 10** | Gemini (e) + operator-elevated | Affirmative dim. Distinguishes CORRECT from BRILLIANT. Apex-aligned with cold-prospecting goal. |
| **R-3 Falsifiability** baked into D2 + D6 9-10 bands | Gemini (c) | Catches "rollback theater" + happy-path-only test plans |
| **R-4 3 new anti-patterns** appended to list | Gemini (c) | Rollback theater + capability-tag inflation + spirit-of-the-law scope creep |
| **R-5 Deduction scoring** for pure-gate dims (D2 / D5 / D9) | Gemini (d) | Start at 10, lose points per failure. Forces critical mindset, resists grade inflation. |
| **3 blind-spot dims DEFERRED** to v3 next-sprint rubric | operator Path 2 | Cost / PII / Stakeholder are real but hand-auditable in the plan; rubric stays at 10 dims to avoid judge fatigue |

---

## Dimensions (10 total, weights sum to 100)

### D1. Sequencing rigor — weight **13**

Does the order of operations reflect the substrate-first / Tim-rejudge-last correction the operator made? Are dependencies between items explicit and respected?

- **0-3 (fails):** No defended order, or Tim re-judge sequenced before substrate fixes (F1/F3) ship.
- **4-6 (marginal):** Order is stated but rationale is implicit. One or more dependency inversions.
- **7-8 (strong):** Explicit "substrate first, re-judge last" block. Each F-item names upstream dependencies. Gate workstream correctly positioned after W2.
- **9-10 (excellent):** Sequencing logic defended item-by-item AND plan surfaces "why not earlier / why not later" for at least the 3 highest-leverage moves (F3, F6, Tim-rejudge). Reordering would visibly degrade outcome quality, not just timing.

### D2. Risk discipline (rollback + dependencies + falsifiable tests) — weight **13** [DEDUCTION-SCORED per R-5]

**Scoring direction: start at 10, lose points for each named failure below.**

- **−3** if any item lacks a rollback path
- **−2** if rollback is destructive / non-atomic (e.g., `DROP COLUMN` with no audit-trail column; `git revert` for a data migration)
- **−2** if test plan is happy-path only — does NOT include a step explicitly designed to FALSIFY the fix claim (R-3 Falsifiability sub-criterion)
- **−2** if upstream dependencies missing or stated only implicitly
- **−1** if rollback is plausible-but-untested (R-4 anti-pattern: rollback theater)

Minimum score: 0. Excellence (9-10) requires every item has atomic rollback + named dependencies + adversarial test plan.

### D3. Capability coverage (4 binding capabilities) — weight **10**

Each item maps to at least one of M / K / L / S. The map is honest. All 4 capabilities advance materially within the sprint.

- **0-3 (fails):** Capability map absent OR all items label themselves K. One or more of M/K/L/S never advances.
- **4-6 (marginal):** Map present, but L (close-the-loop) is hand-waved or deferred to REBUILD without justification. Capability-tag inflation visible (R-4 anti-pattern: items tag 3+ caps where 2 are trivial impact).
- **7-8 (strong):** Each item carries a capability tag. All 4 capabilities have at least 2 items advancing them within the sprint.
- **9-10 (excellent):** Plan has a Capability Spine header AND every workstream's capability tag is defended in the test plan ("we will know M improved because sr_pipeline_runs row count goes from 0 to N").

### D4. Defensibility of recommendations (audit-evidence ties) — weight **11**

Every item traces to a specific finding in the audit. Recommendations don't appear from outside the audit's evidence base.

- **0-3 (fails):** Items proposed without audit citation. New scope smuggled in.
- **4-6 (marginal):** Most items cite audit, but at least one is novel-without-rationale.
- **7-8 (strong):** Each F-item maps back to a specific audit finding. Tool-audit findings (OTEL, Stop-hook) cited with item numbers.
- **9-10 (excellent):** Items that go beyond audit carry explicit rationale + operator-decision provenance. Items the audit recommended but plan dropped (R1-R5) carry a "deferred because" block with operator-decision dependencies named.

### D5. Scope discipline (does NOT reopen settled decisions) — weight **7** [DEDUCTION-SCORED per R-5]

**Scoring direction: start at 10, lose points for each named failure below.**

- **−4** if plan reopens any of the 6 audit-ruled-out decisions (API-vs-manual, Slack auto-ingest, new tables, composer rewrites, judge rewrites, v2 move-off)
- **−3** if scope-creep happens via semantic rename (R-4 anti-pattern: spirit-of-the-law violation — e.g., "pre-composer normalization script" that's functionally a composer rewrite)
- **−2** if plan lacks an explicit "What this plan does NOT include" section
- **−1** per audit-settled item NOT listed in the "does not include" block

Minimum score: 0. Excellence (9-10) requires the explicit section PLUS each in-scope item that touches a settled area carries a "stays within ratified spec" reference.

### D6. Substrate-trust impact (K capability is load-bearing) — weight **14**

The 800-prospect P2 goal hinges on substrate trust. K-capability items must be the deepest-specified.

- **0-3 (fails):** Kill-list (F1) or domain classifier (F3) treated as one-liners. SoT contradiction (F2) not in scope.
- **4-6 (marginal):** F1/F3 specified but test plans don't include replay of historical bad outputs. Backfill of existing 1,522 rows missing or hand-waved.
- **7-8 (strong):** F1 cites canon lines 57-61 verbatim. F3 specifies wire-target file paths, backfill script, idempotency guard, PROHIBITED-row quarantine pattern.
- **9-10 (excellent):** Plan closes the substrate-trust loop end-to-end: F1 regex add → F2 SoT alignment → F3 ingest gate → F4 staleness check fires → GATE re-judge against new substrate. **R-3 Falsifiability:** GATE re-judge replays the 5 historical hallucination emails + 5 additional adversarial-fact-check prompts crafted to try to break the new gates. Each step's pass criteria are mechanically verifiable.

### D7. Observability impact (M capability — no learning without it) — weight **8**

Audit graded observability 3/10. Plan must materially move this. F8/F9/Stop-hook R5-lite carry the load.

- **0-3 (fails):** F8/F9 hand-rolled INSERTs only. No OTEL leverage. No test that a row lands.
- **4-6 (marginal):** OTEL mentioned but fallback is default. Stop-hook scope unclear, no noise gate.
- **7-8 (strong):** F8 specifies OTEL receiver path AND fallback, with cross-system check verifying CLAUDE_CODE_SESSION_ID correlation. F9 extends F8 (shared infrastructure). Stop-hook has noise gate.
- **9-10 (excellent):** OTEL preferred but explicitly bounded ("fallback if OTEL is fragile") with a falsifiable test. Stop-hook downside section names what it does NOT replace. Observability impact verifiable post-sprint via DB row counts moving from 0 to N.

### D8. Human-in-loop discipline (operator decisions surfaced) — weight **4**

Operator decisions are surfaced, not buried. Per-prospect defaults respected.

- **0-3 (fails):** Plan auto-decides items the audit + memory rules say operator owns (e.g., Joe Kunz overwrite, microsite live-flip batching default).
- **4-6 (marginal):** Some operator decisions surfaced, but REBUILD operator-question block is vague or missing.
- **7-8 (strong):** Plan locks operator-confirmed decisions at top. Per-prospect microsite approval default named with batch option. REBUILD has tight 5-question block.
- **9-10 (excellent):** "Open assumptions flagged" section names every assumption an operator might flip, in <5 items. GATE workstream operator touchpoints named per step — operator cost minimized AND auditable.

### D9. Concrete-spec depth (precision = operator apex pillar) — weight **10** [DEDUCTION-SCORED per R-5]

**Scoring direction: start at 10, lose points for each named failure below.**

- **−3** if items lack file paths
- **−3** if items lack line numbers OR explicit anchor (function name, section header)
- **−2** if test plans = "manual check" / "look at output" without commands or expected outputs
- **−1** per item lacking pre/post DB queries or anonymous-fetch verification where applicable
- **−1** if test plans are not reproducible by an agent without further interpretation

Minimum score: 0. Excellence (9-10) requires file + lines + reproducible test command + expected output on every item.

### D10. Elegance / Insight / Second-Order Thinking — weight **10** [NEW — operator-apex affirmative dim]

Does the plan show craft, depth, insight, forward-looking design — not just correctness? Does it solve the root cause, not just the symptom? Does the observability added surface the NEXT likely problem, not just confirm the current fix worked? Does the architecture make the system easier to debug / extend / operate in the future?

**This is the AFFIRMATIVE dim — distinguishes a CORRECT plan from a BRILLIANT one. The cold-prospecting goal depends on craft (recipients respond to craft, not just to correctness). Without this dim, the rubric only rewards diligent rule-following.**

- **0-3 (fails):** No second-order thinking visible. Fixes solve symptoms only. Observability captures current fix outcomes, doesn't anticipate next problem. Architecture decisions framed only as "fixes Y," never as "this also enables X downstream."
- **4-6 (marginal):** One or two glints of insight — e.g., a fix that anticipates a related failure mode. Most items are competent but predictable. The plan reads like it was written by someone who thinks 1 sprint ahead.
- **7-8 (strong):** Multiple items show second-order thinking. F3 specifies PROHIBITED-row quarantine (not delete) for future audit trail. F8/F9 OTEL substitution shows architectural insight (use native primitive vs hand-roll same-thing). Forward-looking design visible in 3+ items. Solutions identify root causes (e.g., F6 craft/facts column split addresses semantic blur, not just adds another gate).
- **9-10 (excellent):** Plan shows craft throughout. Architecture decisions explained as "this also enables X downstream." Observability surfaces the NEXT problem class, not just confirms current fix. Plan reads like it was written by someone who thinks 2-3 sprints ahead. An external reviewer would say "this person understood the deeper problem, not just the symptom."

**Anti-pattern this dim catches:** A plan that gets 9-10 on D1-D9 but 4-5 here is mechanically correct but uninspired. Should be rejected on weakest-link rule (see Application notes).

---

## Weights rationale

The operator's apex — quality + precision + craft-resonance — pulls weight toward (a) dimensions that catch shallow defensibility AND (b) the affirmative dim that distinguishes correct from brilliant.

**Tier 1 (D6 Substrate-trust 14, D1 Sequencing 13, D2 Risk 13 — 40 pts):** Substrate-trust is the foundation of the 800-prospect goal (per Gemini: "what facts recipients see" must beat "when fixes ship" in weighting). Sequencing rigor honors the operator's most-recent correction. Risk discipline catches destructive-rollback failure modes that would burn weeks. These three are co-tier-1.

**Tier 2 (D4 Defensibility 11, D9 Precision 10, D10 Elegance 10, D3 Capability 10 — 41 pts):** D4 protects against drift from audit evidence. D9 and D10 are the two named operator-apex pillars (precision + craft) at equal weight — the rubric treats them as co-load-bearing. D3 ensures all 4 binding capabilities advance.

**Tier 3 (D7 Observability 8, D5 Scope 7, D8 Human-in-loop 4 — 19 pts):** D7 ensures observability moves at all (graded 3/10 today). D5 catches scope reopens (deduction-scored, so 7 is sufficient for gate function). D8 weighted modestly because most operator-discipline failures get caught by D1/D5 first.

Total: 13+13+10+11+7+14+8+4+10+10 = 100.

**Trade-off accepted:** D8 drops from 7 → 4 because the v1 weights treated operator-decision discipline as a heavier gate than it functionally is — the plan's frontmatter already locks operator-confirmed decisions, and D1 + D5 catch most violations. The freed weight reallocates to D10 (apex-aligned craft) where it does more work.

---

## Anti-patterns the rubric detects (11 — 8 v1 + 3 new from R-4)

1. **Tim re-judge sequenced early** — caught by D1 (low score on dependency inversion).
2. **Rollback = "git revert" on a DDL change** — caught by D2 (non-atomic / destructive).
3. **All items labeled K, M/L/S never advance** — caught by D3 (skewed coverage).
4. **Composer rewrite smuggled in as F-item** — caught by D5 (reopens settled decision).
5. **F1 kill-list one-liner with no historical replay** — caught by D6 (no falsifiable test).
6. **F8/F9 as hand-rolled INSERTs, no OTEL leverage** — caught by D7 (ignores tool-audit items 13 + 16).
7. **Joe Kunz auto-overwrite OR microsite batch-flip as default** — caught by D8 (violates GOSPEL memory + operator decision 5).
8. **10 shallow items beating 6 deep items** — caught by D9 + D2 together.
9. **NEW — Rollback theater:** rollback path stated but no test of the rollback itself; passes superficial check but would fail if exercised. Caught by D2 falsifiability deduction.
10. **NEW — Capability-tag inflation:** items tag 3+ capabilities where 2 are trivial impact ("this DB fix changes data so K, can be measured so M, portal reads it so S" — only K is non-trivial). Caught by D3.
11. **NEW — Spirit-of-the-law scope creep:** settled-decision LETTER respected but a functionally equivalent rename smuggles the same work in (e.g., "pre-composer normalization script" = composer rewrite by another name). Caught by D5 spirit-of-the-law deduction.

---

## Application notes

A judge using this rubric scores the **plan file** (`data/showrev/fix-plan-sprint-2026-06-13.md`) against the dimensions above. The judge does NOT score the operator's correctness as a decision-maker (operator decisions in the plan frontmatter are assumed correct context, not evaluable claims).

**Scoring direction differs by dimension:**
- D1, D3, D4, D6, D7, D8, D10 are **positive-framed** — score upward from a 0-3 floor based on observable indicators.
- D2, D5, D9 are **deduction-scored** (R-5) — start at 10, subtract per named failure. Forces critical mindset on pure-gate dims.

**Missing dimensions:** if the plan does not address a positive-framed dimension at all, score 0 (NOT N/A). The absence of a capability map IS a failure of D3. For deduction-scored dims, "not addressed" = lose maximum points (floor at 0).

**Weighted total:** sum (dimension_score × weight / 10); result is 0-100. **Passing bar: 70. Target for ship: 80. Weakest-dimension gate: weakest dim must be ≥6 to ship even at total 80+** (per the rubric-driven-quality skill's weakest-link rule).

**Convergence rule across iterations:** if weighted score moves <3 points across two judge rounds AND no individual dimension changes by >2, declare convergence and surface to operator. Iteration cap is 3 rounds per operator decision.

---

## Deferred to v3 next-sprint rubric (per operator Path 2 selection)

Three Gemini-flagged dimensions deferred to next sprint's rubric, with rationale:

| Dim | Reason deferred this sprint | How hand-audited in this plan instead |
|---|---|---|
| **Cost / resource awareness** | Sprint bounded at ~17 hrs; F3 reprocessing 1,522 rows ≈ $1.50 token spend (cheap classify, not LLM-heavy). Not material. | Plan §F3 to carry inline cost estimate as a one-line note. |
| **PII / data governance** | Backfill scripts touch existing tables, no new exports; no temp-file PII. | Pre-flight check: confirm no F-item creates unsecured exports or PII-bearing logs. |
| **Stakeholder usability beyond operator** | F6 craft/facts split + F10 portal action already consider Tim/AE workflow implicitly. | Hand-check: confirm Tim sees the column rename in /ops and AE sees the F10 approve action. |

These return as proper rubric dimensions in v3 (next-sprint rubric) once the immediate substrate-trust crisis is resolved.

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude subagent (general-purpose) | Initial draft — 9 dimensions, weights sum 100, anti-pattern checklist, application notes. Verdict on v1 from Gemini external audit: REVISION. |
| v2 | 2026-06-13 EDT | Claude (Opus 4.7) main session | Post-Gemini-audit revision per operator Path 2 selection. R-1 weight shifts (D1↓, D4↓, D6↑, D9↑). NEW D10 Elegance/Insight/Second-Order at weight 10 (affirmative apex-aligned dim per operator-elevated "humans respond to craft" framing). R-3 Falsifiability baked into D2 + D6 9-10 bands. R-4 three new anti-patterns. R-5 deduction scoring for D2/D5/D9 gate dims. R-2 three blind-spot dims (Cost/PII/Stakeholder) DEFERRED to v3 with hand-audit notes. Total dims: 10. |
