---
title: Pipeline v2 Composer Gap-Fix Plan — Triage Path C
status: ACTIVE
last_updated: 2026-06-09 14:30 EDT
version: v1
purpose: Plan to close pipeline-v2 composer gaps surfaced by 2026-06-09 audit. Triage path = fix 10 must-fix, defer 15 nice-to-have. INTENT-driven, NOT blind copy-paste from old code.
---

# V2 Composer Gap-Fix Plan

## Context

Operator flagged 3 v2 bugs (same PS, word ceiling, microsite 404). Audit fork surfaced **25 total gaps** in pipeline-v2 composers vs old pipeline rules. Path C = triage: close the 10 with biggest blast radius before next cohort run.

## Pop-quiz level-set (operator's 5 challenges)

Every gap-fix decision is judged against:
1. **ICP** — can we determine if prospect is ICP?
2. **Email** — can we find the address?
3. **Information** — what do we know that's real?
4. **Composition** — does it sound like a peer, not AI?
5. **Psychology** — using consumer-behavior research?

Plus the bar: "better than top 0.01% of AEs."

This plan organizes fixes by which challenge they serve. Most map to #4 (Composition).

---

## The 10 Must-Fix Gaps — Intent + Honest Approach

Numbering matches audit doc, ordered by implementation sequence (easy/cheap first).

### GROUP A — Prompt edits (30 min combined)

These are single-file changes to both composer prompts. No logic changes.

#### Fix 1 — 22-pattern AI-tell blacklist (audit #6)

**WHAT (rule):** Composer prompt forbids 22 specific phrases tagged as AI fingerprints.

**WHY (intent):** Phrases like "I'd love to" / "streamline" / "transformative" are statistical markers — humans recognize them as LLM-generated, spam filters detect them at scale. A cold prospect reading "I'd love to share" knows it's a robot before reading sentence 2.

**HOW v2 honors intent:**
- Pull the full 22-phrase list from `judge.ts:65-89`
- Add to composer prompt as banned list with examples of GOOD alternates
- NOT "add list and hope" — also add post-compose regex check that fires word-count-style retry if any banned phrase matches (max 2 retries)

**TEST:** Compose 5 emails, grep for any banned phrase → 0 matches.

#### Fix 2 — Tim kill-list 10 phrases (audit #7)

**WHAT (rule):** 10 phrases that Tim TC-1B testing flagged as causing peer-fiber-AE rejection.

**WHY (intent):** Tim is the GROUND TRUTH for "does this sound like a real AE." Phrases like "bleeding", "binding constraint", "or not the right time" are quintessential AE-LARP — sound like they're aping AE language without authenticity. Tim's empirical observation outranks any other rule.

**HOW v2 honors intent:**
- Same mechanism as Fix 1 — prompt blacklist + post-compose regex + retry
- These 10 are MORE important than the 22 generic AI tells (operator-tested)

**TEST:** Compose 5, grep, 0 matches.

#### Fix 3 — Product/industry guards (audit #8)

**WHAT (rule):** Composer must never mention out-of-scope products: "structural analysis", "Harmoni", "MicroStation", "drawings QC", "TNX", "mount analysis", "tower", "cellular".

**WHY (intent):** Composer hallucinating Inorsa capabilities outside drawings-only-fiber scope. "Harmoni" is the tower product. "Drawing QC" was killed per Tim (we don't do quality control). Mentioning these = false promise = trust damage.

**HOW v2 honors intent:**
- Prompt blacklist + post-compose regex + retry
- BUT — these guards should be COMPOSER-CONTEXT-AWARE. Pipeline-v2 only does fiber cold outreach today. So `tower`, `cellular` are universally banned. Specific to fiber outreach.

**TEST:** Compose 5, grep, 0 matches.

#### Fix 4 — India/offshore/outsource ban (audit #9)

**WHAT (rule):** Never frame Inorsa as offshore/outsourced.

**WHY (intent):** Outsource framing devalues positioning AND triggers AE skepticism ("oh, it's some India team"). Inorsa positioning is automated software, not human outsourcing.

**HOW v2 honors intent:**
- Blacklist + regex check
- These will rarely trigger because pipeline-v2 prompts don't mention team origin

**TEST:** Compose 5, grep, 0 matches.

#### Fix 5 — CTA library by ICP type (audit #10)

**WHAT (rule):** Pick the diagnostic question from a PREDEFINED bank of 4 questions per ICP type, don't invent your own.

**WHY (intent):** Generic "what's slowing you down?" reads soft. Specific operator-tested questions like "How long does GIS-to-permit-package translation take you today?" test for pain WHILE establishing peer credibility (the questioner knows the work). Tim/operator have empirical evidence on which 4 land per ICP.

**HOW v2 honors intent:**
- Embed `ICP_CTA_OPTIONS` (4 questions × 2 ICP types = 8 strings) in composer prompt
- LLM MUST pick exactly one, slightly adapt to flow, but NOT invent
- Post-compose verify the chosen question echoes one of the 8 (fuzzy-string-match)

**TEST:** Compose 10 across ICP types. Each question fuzzy-matches one of the 8 → 10/10 pass.

### GROUP B — Structural fixes (35 min combined)

These need code paths beyond the prompt.

#### Fix 6 — Company-name hard-lock (audit critical #1)

**WHAT (rule):** Composed body uses EXACTLY the company name from CSV input. No substitution to parent-co / subsidiary / abbreviation.

**WHY (intent):** **THIS IS THE ANDREW BUG.** Yesterday morning we almost shipped "Andrew at UECI" when his CSV row said "United Fiber". The substrate has aliases (UECI is parent co); LLM helpfully "corrects" the name. Damage: prospect reads wrong company → instant credibility loss + spam signal + likely auto-discard.

**HOW v2 honors intent (NEW, smarter than old code):**
- Prompt: explicit "Use EXACTLY '${prospect.company}' as written. The substrate may know aliases — do NOT substitute."
- Post-compose CHECK:
  - Extract every potential company-name mention from body (capitalized words near "your", "at", etc.)
  - Verify exact match against `prospect.company`
  - If mismatch (e.g., "Andrew at UECI" but CSV says "United Fiber"): retry with hint
  - Max 2 retries
- NOT in old code: post-process verification. Old just trusted the prompt.

**TEST:** Compose for Andrew Aeschliman / United Fiber. Body must contain "United Fiber" verbatim (or no mention) and zero "UECI"/"United Communications"/etc.

#### Fix 7 — 3-paragraph mechanical gate (audit critical #3)

**WHAT (rule):** Body is EXACTLY 3 paragraphs separated by single blank line.

**WHY (intent):** HubSpot Sequence variable substitution depends on positional paragraphs. 2 or 4 paragraphs breaks the sequence template. Beyond HubSpot — the 3-paragraph structure IS the email-architecture rule (open / bridge / close+pitch).

**HOW v2 honors intent:**
- Post-compose count `\n\n` separated paragraphs
- If != 3, retry with explicit "EXACTLY 3 paragraphs separated by single blank line"
- Max 2 retries
- This is structural, not stylistic — easier to mechanically enforce than to predict

**TEST:** Compose 10, every body has exactly 3 paragraphs.

### GROUP C — Architectural fixes (55 min combined)

These need new code paths in `run-pipeline-v2.ts` or new phases.

#### Fix 8 — MEDDPICC + intel_* columns (audit critical #4)

**WHAT (rule):** sr_engine_output has columns `persona_bucket`, `intel_fit_rationale`, `intel_signal_strength`, `meddpicc_identified_pain`, etc. Old pipeline populates them; v2 leaves them null. Portal expand-view shows empty intel.

**WHY (intent):** Portal review surface is the AE's COCKPIT. Empty intel columns mean the AE has the email but NO supporting why-this-prospect-now context. Slows review, increases skip-without-action, reduces send rate.

**HOW v2 honors intent (smarter than old code):**
- Old code generates each column with a separate LLM call (expensive).
- v2 has the TieredDossier already populated with all the substrate evidence
- DERIVE columns from dossier WITHOUT new LLM calls:
  - `persona_bucket` = detectPersona result (already known)
  - `intel_signal_strength` = "strong" if useDirectly ≥ 3 else "medium" if ≥ 1 else "weak"
  - `intel_fit_rationale` = `icp_volume_reasoning` (already in dossier)
  - `meddpicc_identified_pain` = templated from icpType + first USE_DIRECTLY company_fact claim
  - `meddpicc_decision_criteria` = templated from persona ("speed-to-revenue" for revenue_leader, etc.)
- Skip ones that genuinely need LLM extraction (e.g. `meddpicc_champion`) — leave null; operator fills via portal AE-notes
- This avoids 5-7 extra LLM calls per prospect

**TEST:** Portal expand-view on a v2-composed prospect shows populated intel sections. Spot-check rationale matches what dossier knows.

#### Fix 9 — Microsite content generation (audit critical #5)

**WHAT (rule):** Create `sr_microsites` row per prospect so /assess/{slug} doesn't 404.

**WHY (intent):** Cold-prospect clicks PS link → must arrive at a relevant page. 404 = email signal as spammy/broken to the prospect AND to email-reputation systems.

**HOW v2 honors intent (smarter than old code):**
- Old code generates rich per-prospect microsite content via LLM (~$0.02/microsite × 100 = $2)
- v2 minimum-viable: **templated microsite** by persona + ICP type
  - headline = persona-specific template (3 options across personas)
  - insight_text = templated framing + ICP-type-specific detail (substituted from dossier)
  - case_study_text = generic Inorsa case study (1 per ICP type — 2 total)
- status='draft' so it doesn't auto-appear public; operator promotes to 'live' from portal
- AE details + logo from `getAEDetails` + `resolveOrVerify` (already exists in old code, import into v2)
- BONUS: if dossier has rich substrate, optionally upgrade to LLM-generated content. Mode flag.

**TEST:** Pick 3 cohort prospects. Hit https://fiber.inorsa.com/assess/{slug} — must return 200, render the templated content.

### GROUP D — AE signature DECISION POINT

#### Fix 10 — AE signature in body (audit critical #2) — RECOMMEND DEFER

**WHAT (rule):** Old code appends `${aeName} | Inorsa | ${aeEmail}` to body.

**WHY (intent):** Personal accountability — reply-to context for prospect.

**HOW v2 SHOULD honor intent (NOT how old code does it):**
- C-portion (delivery via HubSpot Sequence) handles signatures at SEQUENCE/SENDER level, not body
- If pipeline-v2 emails ever go through HubSpot, body-side signature is REDUNDANT and would double-print
- Portal review surface needs to show signature for the AE to know what the prospect WILL see
- **Recommendation: SKIP body-side signature in composer. Portal renders signature for review.** Portal-side fix, not composer.

**Decision needed:** OK to defer to portal? (Effort: 30 min portal change vs 15 min composer change but with delivery-time bug risk)

---

## Implementation order + time

| # | Fix | Group | Effort |
|---|---|---|---|
| 1-5 | AI tells + Tim list + product guards + offshore + CTA library | Prompt + regex | 30 min |
| 6 | Company-name hard-lock | Post-process + retry | 20 min |
| 7 | 3-paragraph mechanical gate | Post-process + retry | 15 min |
| 8 | MEDDPICC + intel_* columns | Persist mapping | 25 min |
| 9 | Microsite content | New phase | 30 min |
| 10 | AE signature | Defer (portal) | 0 min in v2 |
| | **Total** | | **120 min** |

Plus 60-70 min for 3rd cohort re-run.

## Decisions needed from operator before I code

1. **Fix 10 — AE signature:** OK to leave out of composer body and add to portal review surface instead? (Recommended: yes)
2. **Fix 8 — MEDDPICC columns:** OK to derive from dossier (no extra LLM calls) instead of dedicated LLM extraction? Some fields (e.g. `meddpicc_champion`) will stay null. (Recommended: yes for now; revisit later if AEs need fuller data)
3. **Fix 9 — Microsite mode:** Templated content (free, instant) vs LLM-generated (~$0.02/prospect)? (Recommended: templated for cold cohort scale; LLM-upgrade later for high-value prospects)
4. **Fix 5 — CTA library:** Should I copy the ICP_CTA_OPTIONS from old code verbatim, or do you want me to red-team them against Tim TC-1B feedback first? (Recommended: copy verbatim now, red-team in a follow-up)

## What's DEFERRED to later

15 audit-flagged gaps not in this triage:

- Numeric-anchor-repeat / 3-word-noun-phrase-repeat / sentence-repeat / sentence-length-variance / participial-opener-density checks (5 detection gaps — judge runs these post-compose; v2 doesn't run judge yet, so these only matter when we wire judge back)
- Hypothesis format for rich key facts (composer style — nice-to-have)
- Competitive-displacement bridge logic (competitor categories — only matters when prospect has competitor signals in substrate)
- "Acknowledge, not trash" competitor framing rule (cosmetic; rarely triggers)
- "Worth the words" guidance (style, not safety)
- AE flag for ae_firm vs fiber_operator framing differences (already partially handled by persona-framing per ICP)
- Subject case enforcement (cosmetic)
- bodySentences schema validation (defensive; gen-composer fine without)
- Em-dash unicode lookalikes (rare)
- Show facts presence guard (cold campaign doesn't reference show, so non-issue today)

Will track as backlog under `docs/specs/v2-composer-deferred-gaps.md`.

## Test plan for the 3rd cohort run

After fixes commit:
1. Run pipeline-v2 on 10-prospect cohort first (smoke test, ~7 min)
2. Verify: 0 AI tells, 0 Tim phrases, 0 product guards triggered, 3-paragraph 10/10, 0 company-name mismatches, MEDDPICC columns populated, 10/10 microsites created
3. If smoke test clean: re-run full Focus 100 cohort (~70 min)
4. Generate delta report comparing before/after on email confidence + composer cleanliness

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 14:30 | Claude | Initial plan. INTENT-driven not copy-paste. 4 decisions flagged for operator. 15 gaps explicitly deferred. |
