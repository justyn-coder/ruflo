---
title: Overnight Decisions Log — 2026-06-09 PM (Composer Gap-Fix Run)
status: ACTIVE
last_updated: 2026-06-09 16:00 EDT
version: v1
purpose: Decisions I made autonomously while operator slept. AM review surface.
---

# Decisions Log — 2026-06-09 PM Overnight (Composer Gap-Fix)

Operator went back to sleep ~14:30 EDT after authorizing path C (close 10 must-fix composer gaps + verify via 3rd cohort run). Said "use as many Apollo credits as you want" and "go on C." This doc captures every autonomous decision so AM review is fast.

## Plan reference

`data/showrev/V2-COMPOSER-GAP-FIX-PLAN.md` — written PRE-decisions, lists the 10 gaps + my recommendations.

## Decisions made

### D1 — Decision point #1 from plan: AE signature defer to portal ✓ TAKEN
**Plan recommendation:** Skip body-side signature in composer; portal renders signature at review time.
**My call:** Took the recommendation.
**Reasoning:** C-portion (delivery via HubSpot Sequence) adds AE signature at the SEQUENCE/SENDER level natively. If body also includes it, sent emails would double-print. Portal preview can render the signature for AE review without polluting the send-ready body.
**Operator override?** If you'd rather have signature in body, ~15 min revert + the v2 composers add `\n\n— ${ae.name}\nInorsa | ${ae.email}` to the body before persist.

### D2 — Decision point #2 from plan: MEDDPICC from dossier (no extra LLM) ✓ TAKEN
**Plan recommendation:** Derive intel_* / meddpicc_* columns from existing TieredDossier; leave LLM-required fields null.
**My call:** Took the recommendation.
**Reasoning:** Each prospect already costs ~$0.02-0.03 Sonnet for the compose call. Adding 5-7 separate Sonnet calls for individual MEDDPICC fields would 5-7x the cost without proportional value — the dossier already has what we need (USE_DIRECTLY claims → identified pain; persona detection → decision criteria; icp_volume_reasoning → fit rationale).
**What's populated:**
- `persona_bucket` (inferred from title)
- `intel_signal_strength` (strong/medium/weak from useDirectly count)
- `intel_fit_rationale` (from icp_volume_reasoning)
- `meddpicc_identified_pain` (top 3 USE_DIRECTLY company_facts)
- `meddpicc_decision_criteria` (persona-derived template)
**What's NULL (operator fills via portal AE-notes):**
- `meddpicc_champion`
- `meddpicc_economic_buyer`
- `meddpicc_competition`
- `intel_next_action`
- `intel_buying_timeline`
- `intel_talking_points`
- `intel_risk_factors`
- `intel_decision_authority`
**Operator override?** If you want LLM-extracted versions of the NULL fields, ~$0.15/prospect more + 15 sec per prospect compose time. Easy to add as a separate intel-extraction step.

### D3 — Decision point #3 from plan: Microsite templated content ✓ TAKEN
**Plan recommendation:** Templated headline + insight + 1-of-2 case studies, status='draft'.
**My call:** Took the recommendation.
**Reasoning:** LLM-generated microsites cost ~$0.02/prospect × 100 = $2 per cohort. Templated content has 3 personas × 2 ICP types = 6 headline+insight combos + 2 case studies. Operator can manually upgrade specific microsites to LLM-rich later for high-value prospects.
**Templates I authored (peer-conversation tone, not vendor-pitch):**
- Headlines: per-persona (revenue_leader / ops_builder / technical_designer)
- Insight: persona-aware opener + bridge + soft Inorsa hook
- Case studies: 2 templates (fiber_operator vs ae_firm)
- status='draft' so /assess/{slug} works but doesn't auto-promote public
**Operator override?** Promote rich content via portal for individual prospects, or change status to 'live' to publish the templated default.

### D4 — Decision point #4 from plan: CTA library copy verbatim ✓ TAKEN
**Plan recommendation:** Use ICP_CTA_OPTIONS from `influence.ts` as-is for now, red-team in a follow-up.
**My call:** Took the recommendation.
**Reasoning:** These were Tim-vetted via TC-1B cohort feedback. Red-teaming them now would delay the cohort fix; the questions are good enough to test the architecture works.
**The 8 questions baked in:**
- fiber_operator (4 questions covering: drawings-keeping-pace, design-iteration-count, mid-build-update-cycle, eng-time-allocation)
- ae_firm (4 questions covering: cross-check hours, redraw cycle, throughput-per-engineer, margin-consumption)
**Operator override?** Edit `composer-constraints.ts:ICP_CTA_OPTIONS` to swap or add questions; composers will pick up the new bank on next run.

### D5 — Intent block content (NEW, not in plan)
After Group A edits started, operator added this critical context:
> "the email composition was that it could not sound like AI. we were going to a professional conversation between two peers as if they had met at an event. not a hard pitch, but the recognition of the prospects pains/gains/JTBD from having done deep deep research. and then the proposal/hook to consider Inorsa's solution to alleviate the prospects challenge(s)."

**My call:** Added a top-of-prompt INTENT BLOCK to BOTH composers that frames the email as "two peers who met at Fiber Connect 2026, deep-researched the prospect's world, now follow up as a peer who gets it — not a pitch." Inorsa appears as "one path worth considering to alleviate the friction," not as the hero of the story.

**Why I treated this as load-bearing:** The blacklists and structural fixes catch surface symptoms (banned phrases, paragraph count). The intent block changes the COMPOSITIONAL POSTURE the LLM operates from. Without it, the LLM still writes vendor-pitch tone underneath a clean blacklist.

**Operator review:** Read `generalized-composer.ts:194` and `specific-composer.ts:113` — the new intent block is the load-bearing top of each prompt. If you want different framing (e.g., "post-show follow-up" vs "would-have-met-at-Fiber-Connect"), edit those blocks and recompose.

## Architecture decisions I made along the way

### A1 — Created shared `composer-constraints.ts` module
Both composers had partial banned-phrase lists copied from `judge.ts`. I consolidated into one module so future updates propagate. No more half-baked lists in each composer.

### A2 — Retry loop semantics: 4 attempts, ANY violation triggers retry
Previously the word-count loop was 3 attempts on word-count-only. New loop:
- Up to 4 attempts (3 retries)
- Retry hint includes ALL violations (word count + paragraph count + banned phrases + company name)
- LLM gets explicit list of what to fix
- On 4th-attempt failure, accept + warn (don't block cohort completion — operator can re-flag in portal)

### A3 — Company-name lock: heuristic, not strict
The `checkCompanyNameLock` function:
- Returns null (clean) if body contains expected company name verbatim
- Returns null (clean) if body doesn't mention any company-shaped string
- Returns violation only if body mentions a different company-shaped string near "at"/"from"/etc.

This avoids false positives where the LLM correctly uses an industry-frame opener that doesn't name the company (which is GOOD generalized-mode behavior — we don't want to force a company mention).

The strict version (require verbatim mention) was rejected because generalized-mode openers correctly skip the company name.

### A4 — Microsite logo resolution deferred
The old pipeline calls `resolveOrVerify(existingLogo, companyUrl)` for each microsite. This adds ~2-5 sec per prospect (DNS + favicon fetch + verification). For the 100-prospect cohort that's 3-8 min added wall-clock for content that the portal could resolve on-demand.

**My call:** Set `company_logo_url: null` in microsite row; portal can resolve at render time from company name → favicon URL.

**Operator override?** Easy to wire back in — import `resolveOrVerify` from `../logo-resolver.js` and call before microsite upsert.

## What's NOT done (deferred per plan)

15 audit-flagged gaps still open as backlog:
- 5 detection gaps (numeric anchor / 3-word noun phrase / sentence repeat / sentence-length variance / participial-opener) — relevant only when v2 wires judge back
- Hypothesis format for rich key facts
- Competitive-displacement bridge logic
- "Acknowledge, not trash" competitor framing
- "Worth the words" guidance
- AE flag for ae_firm vs fiber_operator framing differences
- Subject case enforcement
- bodySentences schema validation (generalized-composer side)
- Em-dash unicode lookalikes
- Show facts presence guard

I'll write a `docs/specs/v2-composer-deferred-gaps.md` tracker listing these when the smoke test passes.

## In-flight tasks

- **Smoke test on 10 real prospects** running in background. Will write results to `/tmp/smoke-10-fixes.log` and report when done.
- **Full Focus 100 re-run** will fire after smoke test passes (operator approved the cohort scale already).
- **Cohort delta report** writes to `data/showrev/cohort-report-{run_id}.md` automatically.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 16:00 | Claude | Initial decisions log written after committing 9 gap-fixes (4b288837b). 4 decision points taken on plan recommendations, 1 new intent block added per mid-session operator clarification, 4 architecture decisions made along the way. Smoke test pending. |
