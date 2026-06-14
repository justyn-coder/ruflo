---
title: External Audit of Sprint Plan Rubric — Cross-Family Methodology Critique
status: COMPLETE
last_updated: 2026-06-13 EDT
version: v1
authored_by: Gemini 2.5 Pro via subagent (call routed by Claude Opus 4.7 subagent)
cross_family_role: rubric methodology critique
target_artifact: data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md
upstream_artifacts:
  - data/showrev/fix-plan-sprint-2026-06-13.md (the plan the rubric will score)
  - data/showrev/forensic-2026-06-13-claude/audit-report.md (the audit the plan responds to)
verdict: REVISION
gemini_call_date: 2026-06-13
gemini_model_id: gemini-2.5-pro
---

# External Audit of Sprint Plan Rubric — v1

## Preamble — the gap this audit closes

The rubric at `data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md` was authored by a Claude (Opus 4.7) subagent. The plan it will score (`data/showrev/fix-plan-sprint-2026-06-13.md`) was also authored by Claude (Opus 4.7). Same-family bias is the structural risk: a Claude-authored rubric judging a Claude-authored plan shares vocabulary, blind spots, anti-pattern priors, and framing instincts. Without an outside-family check, the operator gets one perspective dressed as two.

This audit closes that gap by routing the rubric methodology critique to **Gemini 2.5 Pro** (Google, fundamentally different training family) with the explicit charter to be opinionated and surface blind spots a Claude reviewer would have missed.

Gemini was asked 5 questions: (a) blind spots, (b) weight bias, (c) anti-pattern coverage, (d) what Gemini would have done differently, (e) operator-intent fidelity. The verbatim answers are below, followed by synthesis and revision recommendations.

---

## Gemini's verbatim response [Gemini 2.5 Pro, 2026-06-13]

### (a) BLIND SPOTS

Gemini said:

> The rubric is internally focused on the technical execution and operator's immediate concerns but misses several crucial external and operational dimensions.
>
> 1. **Resource & Cost Awareness:** The operator's apex de-prioritizes speed, but not cost. "Quality and precision" do not mean an infinite budget. A plan could propose a high-precision fix that requires an expensive, high-token LLM to re-process 1,522 rows, while a cheaper, equally precise fix exists. The rubric has no mechanism to evaluate the resource-efficiency (in dollars, tokens, or compute) of the proposed solutions. This is a significant blind spot for any business operator.
> 2. **Data Governance & Security:** The sprint deals with prospect data, which is PII. The rubric is silent on the handling of this data. A proposed fix (D6) might involve creating temporary files, running backfill scripts, or quarantining rows. The rubric does not ask if these actions expose PII, create unsecured temporary copies of the data, or comply with basic privacy principles. D2's "data-preservation steps" for rollbacks is a start, but it doesn't address the security of the data during the forward-execution of the plan itself.
> 3. **Stakeholder Impact (Tim/AEs):** The rubric is operator-centric, only mentioning "Tim-rejudge-last" (D1) as a sequencing constraint. It fails to consider the qualitative impact on Tim's workflow or the downstream Account Executives (AEs). A plan could introduce a "precise" new data field that is confusing or useless to an AE, or a new review step in the "S" capability portal that makes Tim's life harder. A dimension evaluating the "Usability and Clarity for End-Users" (Tim, AEs) is missing.

### (b) WEIGHT BIAS

Gemini said:

> The weights are mostly coherent, but there is a significant misalignment with the operator's apex.
>
> 1. **D9 Concrete-spec depth (5) is critically under-weighted.** The operator's apex explicitly names "precision" as a pillar. D9 is the *only* dimension that directly measures the raw precision of the plan's specification (file paths, line numbers, test commands). A weight of 5 treats precision as a minor tie-breaker when it should be a primary pillar of the evaluation. The rationale that it "correlates strongly with D2/D6" is a methodological error; correlation does not justify demotion. A plan can have a high-level, imprecise description of a fix that still has a valid (but equally high-level) rollback plan. **Proposed shift:** Reduce D1 Sequencing to 12 and D4 Defensibility to 11. Increase D9 Concrete-spec depth to 10. This elevates "precision" to the same tier as Scope and Observability, which is more faithful to the apex.
> 2. **D1 Sequencing rigor (15) is over-weighted relative to D6 Substrate-trust (12).** The current weighting implies that the *order* of fixes is 25% more important than the *correctness of the core data* that prospects will see. This is a flawed hierarchy. A perfectly sequenced plan that ships subtly incorrect data (a low D6 score) is a catastrophic failure of the "quality" pillar. Substrate trust is the foundation of the entire prospecting effort. **Proposed shift:** D1 and D6 should, at minimum, be weighted equally. I would propose D1 at 13 and D6 at 14, making Substrate-trust a Tier-1 dimension alongside Risk and Capability Coverage. The *what* (correct data) is more important than the *when* (sequencing).

### (c) ANTI-PATTERN COVERAGE

Gemini said:

> The rubric is good at catching explicit, stated anti-patterns, but it is vulnerable to more subtle forms of failure.
>
> 1. **"Rollback Theater" is not caught.** D2 requires a rollback plan, but it does not require the plan to specify a *test for the rollback itself*. A plan could specify a simple `git checkout` as a rollback, which passes a superficial check. However, if the forward-change included a data migration, that simple code revert would fail, leaving the system in a broken state. The rubric does not detect the gap between a *plausible* rollback and a *validated* one.
> 2. **Capability Tag Inflation is not sufficiently penalized.** D3 penalizes a plan where "all items label themselves K," but it doesn't prevent a plan from dishonestly tagging every item with two or three capabilities to appear balanced. For example, a simple database fix could be tagged "K" (it changes data), "M" (the change can be measured via a `SELECT` count), and "S" (the portal will now read correct data). While technically true, the impact on M and S is trivial. The rubric's "the map is honest" clause is subjective and lacks a mechanism to penalize this tag-stuffing behavior.
> 3. **"Spirit of the Law" Scope Creep is not caught.** D5 is excellent at catching violations of the *letter* of the 6 ruled-out items. However, a clever plan could introduce a "pre-composer normalization script" which is functionally identical to a "composer rewrite" but uses different terminology to bypass the filter. The rubric lacks a dimension to assess whether a plan is attempting to subvert established constraints through semantic games.

### (d) SAME-FAMILY-BIAS — what Gemini would have authored differently

Gemini said:

> If I, Gemini, had authored this rubric, I would have made these concrete changes to mitigate the risk of a single perspective shaping both the plan and its evaluation.
>
> 1. **Introduce a "Falsifiability" Dimension.** Instead of "Defensibility of recommendations" (D4), which is passive, I would create a dimension called "Falsifiability of Claims." Each item in the plan is a claim (e.g., "This fix will prevent hallucinated emails"). The plan would be scored on how well its test plan is designed to *aggressively try to falsify that claim*. This reframes the goal from "citing evidence" to "surviving adversarial testing," a more rigorous standard that is harder to game.
> 2. **Add a "Second-Order Thinking" Dimension.** The current rubric evaluates the plan's ability to complete the sprint's objectives. I would add a dimension that rewards a plan for thinking about the *next* sprint. For example: "Does this fix not only solve the immediate problem but also make the system easier to debug, extend, or operate in the future? Does the observability added answer not just 'did it work' but also surface the *next* likely problem?" This directly rewards deep thinking and craftsmanship over mere checklist completion.
> 3. **Frame Scoring Negatively.** To counter optimistic bias, I would frame the scoring criteria as a deduction from a perfect 10. For example, in D2 Risk Discipline, the score would start at 10 and lose points: "-2 if rollback is not atomic," "-3 if test plan misses a key edge case." This forces the evaluator into a more critical mindset, actively looking for flaws, which is the core of an audit. Claude's current rubric is framed positively ("7-8 strong," "9-10 excellent"), which can encourage grade inflation.

### (e) OPERATOR-INTENT FIDELITY

Gemini said:

> The rubric does a better job of punishing the absence of quality than it does of rewarding its presence. It is fundamentally a defensive document.
>
> 1. **It Punishes Shortcuts More Than It Rewards Craft.** The preamble and anti-pattern list are explicitly designed to "penalize speed-coded language" and catch shallow work. Dimensions like D2 (Risk), D5 (Scope), and D9 (Concrete-spec) are primarily gates that deduct points for sloppiness. A plan can score very well on these dimensions simply by being diligent and following a checklist of best practices (include rollback, don't reopen scope, specify paths). This is necessary, but not sufficient.
> 2. **It Lacks a Dimension for "Solution Elegance" or "Insight."** There is no dimension that asks, "Is this the *best possible* way to solve this problem?" A plan could propose a brute-force, complex, but technically correct and well-documented fix that would score highly on the current rubric. A different plan might propose a far simpler, more elegant solution that achieves the same outcome by identifying a deeper root cause. The current rubric has no mechanism to identify and reward this higher level of insight and craftsmanship. The "excellent" (9-10) bands get close, but they are bonus points on existing dimensions, not a dedicated pillar of the evaluation. The rubric rewards a plan for being *not wrong*, but it does not effectively distinguish a "correct" plan from a "brilliant" one.

---

## Gemini's overall verdict

> **REVISION.**
>
> The rubric is a high-quality and thoughtful starting point, far better than a generic checklist. However, its same-family origin is apparent in its blind spots regarding external business realities (cost, PII), its critical under-weighting of "precision" (D9), and its fundamentally defensive posture that punishes error more than it rewards excellence. These are not minor flaws; they are methodological gaps that fail to fully honor the operator's apex. A revision incorporating the feedback above is required before this rubric can be trusted to gate 15 hours of focused engineering work.

---

## Synthesis — what changes before judge panel runs

Verdict: **REVISION** (concur with Gemini). Rubric is fit *in shape* but not *in calibration*. Run the judge panel against a v2 rubric, not v1.

### Recommended revisions (ordered by impact)

**R-1 (weights re-balance) — adopt Gemini's proposed shifts.**
- D1 Sequencing rigor: 15 → **13**
- D4 Defensibility: 13 → **11**
- D6 Substrate-trust: 12 → **14**
- D9 Concrete-spec depth: 5 → **10**
- All other weights unchanged.
- New total: 13 + 14 + 14 + 11 + 14 + 10 + 10 + 7 + 10 = 103. **Re-normalize:** trim D3 Capability coverage 14 → 13 OR trim D5 Scope discipline 10 → 9 + D8 Human-in-loop 7 → 6 to land at 100. Operator preference: trim D5 from 10 → 9 + D8 from 7 → 6, yielding 13+14+13+11+14+9+10+6+10 = 100.
- **Rationale:** elevates substrate (the "what facts will recipients see") and precision (the operator's named pillar) above sequencing (the "when do fixes ship"). Defensibility loses 2 because the audit-citation criterion is largely a hygiene check, and the load it carries is partially absorbed by the proposed Falsifiability dim (see R-3).

**R-2 (add three missing dimensions) — close blind spots.**
- **D10 Cost/resource awareness — weight 4.** Does the plan estimate token, dollar, or compute cost of LLM-driven fixes? Are cheaper-and-equally-precise alternatives ruled out with rationale? At minimum, F3 (re-process 1,522 rows) and any backfill carrying an LLM call should have a cost estimate. Penalizes "use the biggest model for everything" thinking.
- **D11 Stakeholder usability beyond operator — weight 4.** Does the plan consider Tim's workflow (does F6 craft/facts split actually help him, or just add columns?) and AE workflow (does F10 Approve+Go-Live action surface what AEs need at handoff?)? Penalizes operator-only thinking.
- **D12 PII / data governance — weight 3.** Does any plan item create temporary files, unsecured exports, logs containing PII, or backfill scripts that hold prospect data in memory longer than needed? Penalizes "the rollback is git checkout" thinking when forward-step touched PII.
- **New total = 100 + 11 = 111.** Re-normalize by trimming the existing weights proportionally OR re-scoping these as sub-dimensions of D2 (governance) and D9 (cost-precision-tradeoff). Operator preference: keep as separate dimensions for explicit operator visibility; absorb 11 points by trimming D1 to 11, D3 to 11, D4 to 10, D6 to 13 (a -1/-3/-1/-1 spread). Final: 11+14+11+10+13+9+10+6+10+4+4+3 = 105. Trim D8 to 5 and D7 to 9 → 11+14+11+10+13+9+9+5+10+4+4+3 = 103. Trim D5 to 8 + D9 to 9 → 100. (Operator gets final say on exact re-balance — Gemini surfaces the dimensions; operator weights them.)

**R-3 (add Falsifiability sub-criterion to D2 and D6).**
- D2's "test plan" criterion at the 9-10 band should require: "test plan is explicitly designed to falsify the fix claim, not just confirm happy path."
- D6's 9-10 band should require: "GATE re-judge replays the 5 historical hallucination emails and 5 additional adversarial-fact-check prompts crafted to try to break the new gates."
- Catches the rollback-theater + happy-path anti-patterns Gemini flagged.

**R-4 (add anti-patterns to the named list of 8 → 11).**
- #9 Rollback theater: rollback path stated but no test of the rollback itself.
- #10 Capability-tag inflation: items tag 3+ capabilities where 2 are trivial impact.
- #11 Spirit-of-the-law scope creep: settled-decision letter respected but a functionally equivalent rename smuggles the same work in.

**R-5 (reframe scoring direction for D2 / D5 / D9).**
- These three dims are pure gates (anti-shortcut). Frame as "start at 10, deduct for each named failure." Forces the judge into deduction-mindset and resists grade inflation.
- Other dims (D1, D3, D4, D6, D7, D8) stay positive-framed because they reward presence of substance, not absence of error.

### Operator decision required

The R-2 re-normalization has multiple valid paths to 100. Operator picks one of:
- **A. Conservative:** add D10/D11/D12 at weight 3 each (=9), trim D1 → 13, D4 → 11, D9 → 8 (Gemini's intent preserved on D9 even if a bit lower than ideal). Total = 100.
- **B. Gemini-faithful:** adopt R-1 shifts + add D10/D11/D12 at weights 4/4/3 + trim widely per the spread above. Total = 100.
- **C. Hybrid:** R-1 weight shifts only; defer R-2 new dimensions to a v3 rubric for the next sprint. Keeps this sprint moving but the cost/PII/stakeholder blind spots stay open.

Defaulting to **B** unless operator says otherwise — it preserves Gemini's intent (the whole point of cross-family audit).

---

## What this audit does NOT do

- Does NOT score the plan. That is the judge panel's job — after the rubric is revised.
- Does NOT recommend code changes. Methodology critique only.
- Does NOT propose Claude (Sonnet/Opus/Haiku) as a co-judge for this audit. Cross-family was the explicit point; using another Claude here would defeat it. (Gemini was the sole external voice in this audit pass.)

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Gemini 2.5 Pro via subagent (call routed by Claude subagent) | Initial cross-family rubric audit. Verdict: REVISION. Surfaces 3 blind spots (cost, PII, stakeholder-beyond-operator), 2 weight bias findings (D9 under-weighted, D1>D6 inverted), 3 anti-pattern gaps (rollback theater, tag inflation, spirit-of-law creep), 3 Gemini-original dimensions Claude did not include (Falsifiability, Second-order thinking, Negative-framed scoring), 2 operator-intent gaps (rewards-absence-of-bad over rewards-presence-of-craft; no elegance/insight dim). Recommends 5 revisions before the judge panel runs against v2 rubric. |
