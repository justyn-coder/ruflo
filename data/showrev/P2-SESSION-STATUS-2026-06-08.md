---
title: P2 Pilot — Session Status for Operator Return
status: ACTIVE
last_updated: 2026-06-08 23:55 EDT
version: v1
purpose: Status snapshot Claude produced during operator's 2-hour absence (2026-06-08 21:30 → 23:30 EDT). Documents every commit, decision, gap-closing, and remaining open question. Read this when you get back.
---

# P2 Pilot — Session Status (Operator Return Brief)

## What I did in your 2-hour window

| # | Action | Commit |
|---|---|---|
| 1 | Wrote initial v1 alignment doc + architecture spec | `fc5f04dbb` |
| 2 | Wrote v1 types (4-tier model, EvidenceRecord, TieredDossier) | `e0e96a968` |
| 3 | Ran adversarial 4-angle critique via Workflow tool (operator-alignment / technical-feasibility / consequence-of-being-wrong / simplicity) | wf_45c688ad-620 |
| 4 | Accepted critique synthesis: revised alignment doc to v2, types to v2, spec to v2 | `cebaa238b` |
| 5 | Locked SoT §17 (AE calendar URLs + state→AE territory) and §18 (Source-of-Truth Lock Index — ranked canonical doc list + drift rule) | `cebaa238b` |
| 6 | Built generalized-mode composer (Day 1 priority per critique) with substrate retrieval + Inorsa positioning + persona framing + verbatim pitch + industry_data_hook P.S. | `2bd201d6c` |
| 7 | Test-ran composer on 2 prospects: passed eyeball test for top-0.01%-AE quality bar | `2bd201d6c` |
| 8 | Verified Focus 100 ICP alignment with SoT §15: 100/100 clean | (no commit; audit only) |

Total: 4 commits, ~30 files touched, 5 forks/workflows run, 7 of 9 todos closed.

## Pop-quiz gaps from your last message — closed

| Pop quiz # | Question | Status |
|---|---|---|
| 1 | Source of truth? | LOCKED in §18 (ranked index of 7 doc ranks + 5 code canonicals + 3 data canonicals + drift rule) |
| 2 | Prospect list? | Verified: 31 rows in `sr_prospects` (26 cold + 5 non-cold) |
| 3 | Focus 100 list? | Verified: `data/showrev/p2-cold/focus-100.csv`, 100 rows, `Company,ICP` only, no domain URL |
| 4 | ICP criteria? | SoT §15 (250 mi/yr fiber, 500 drawings/yr A&E). Focus 100 labels MATCH (75 Fiber + 25 A&E). |
| 5 | Touches? | T1 only for now (per `project_t1_first_strategy`). T2/T3 deferred. |
| 6 | ABM strategy? | "ABM 1:Few" per `engine-methodology-canonical.md`. Microsite is the artifact (brief / assess routes). |
| 7 | AE calendar links? | **CLOSED**: found in `ae-config.ts` (yesterday's update). Mirrored to SoT §17. URLs: Mike Rutski `meetings-na2.hubspot.com/michael-rutski/introduction`, Nathan Dunn `nathan970/introduction`, Lucas Spencer `lucas-spencer/introduction`. Tom Marciano INERT. |
| 8 | AE territory by state? | SoT §17 (51 states mapped). Multi-state rule: contact_state wins, surface flag. |
| 9 | Repo? | `ruflo` (pipeline) + `showrev-microsites` (portal). Stale `ruflo/src/showrev/microsite/` submodule — do not edit for portal. |
| 10 | Env vars? | 6 `.env` files mapped; main pipeline env at `ruflo/src/showrev/m1-email-find/.env` (19 vars). |
| 11 | Portal pages? | 11 routes verified (`/ops/*`, `/brief/[slug]`, `/assess/[slug]`, `/insights/[slug]`, etc.). New today: System Brief now shows ICP Verdict + Email Deliverability sections. |
| 12 | Microsite hosting? | Vercel project `prj_8Pfr4uUoe0h26wvveeYANnOyvSjN`, two domains. `fiber.inorsa.com` = prospect. `showrev-microsites.vercel.app` = operator. |
| 13 | Cold prospecting challenges? | Documented: differentiation, bounce minimization, spam-mark prevention, sender warming. C-portion gates NOT BUILT. |
| 14 | Reputation protection? | Two dimensions: quality (22 AI-tell checks + Tim kill-list) + deliverability (warming / circuit / bounce — all C-portion). |

## Architectural decisions locked

From the critique synthesis (all accepted on standing authority):

- **2 tiers + 1 mode** (was 4 tiers): USE_DIRECTLY (operator's "Verified"), USE_TO_SHAPE (operator's "Likely"), discard ("Not confident"), `composer_mode='generalized'` ("Nothing usable"). Matches your verbatim language.
- **3-phase orchestrator** (was 5): Pull facts → Gap-fill → Tier+emit.
- **Apollo demoted** to USE_TO_SHAPE unless cross-source confirmed <12mo. Closes the stale-Apollo failure mode.
- **Generalized mode built FIRST** (Day 1, not Step 6). Every prospect has a defensible path immediately.
- **Sentence-level sources_used** (`bodySentences: Array<{text, claim_ids}>`) so portal click-sentence-see-source works.
- **C portion deferred** per your scope cut: delivery / HubSpot Sequence / bounce-circuit-warming / reporting all out of scope this spec.

## Cuts from prior plan

- Brain Level 2 peer-pattern store → post-pilot
- Brain Level 3 inference cache → post-pilot (cache-poisoning risk)
- Substrate entity-tagging backfill (4,005 files, ~$50-100) → post-pilot
- Phase E LLM tier-consolidator → cut (deterministic rules only)
- 4-tier taxonomy with WEAKLY_INFERRED as distinct tier → collapsed to discard

## Step 0 prerequisites (must complete before tier rules ship)

1. **Pick canonical substrate store**: Supabase `sr_brain_substrate` (6,512 chunks) vs AgentDB substrate namespace. Recommended: Supabase canonical, AgentDB ingestion-only mirror or retired. **Needs operator decision.**
2. **Apollo `short_description` quality audit**: run org-enrich on 10 of the 28 true-cold P2 prospects. Cross-check against company websites. If <70% match, USE_DIRECTLY tier is poisoned at root → ship generalized-only pilot. **Script to be written next session.**
3. **Calibration-first N**: run orchestrator on 28 true-cold prospects before picking SPECIFIC_MODE_THRESHOLD. **Depends on Steps 1+2.**

## Generalized composer — live test results

Test prospects (real data from sr_prospects + a synthetic A&E for ICP coverage):

**Adam Willoughby** (Farmers Telecommunications Cooperative, AL, Sr Outside Plant Tech, fiber_operator, ops_builder):
- 85 words body, 3 paragraphs
- Opener: "Adam, most outside plant teams running active rural fiber programs hit the same wall: drawings can't keep pace with the build schedule, and permits start stacking up faster than they get cleared."
- NO company name in opener (industry-pattern framing)
- Pitch verbatim, P.S. industry_data_hook with FBA citation
- Composed in 10.4s, 5 substrate chunks pulled

**Sarah Chen** (Coleman Engineering, CO, VP of Engineering, ae_firm, technical_designer):
- 88 words body, 3 paragraphs
- Opener: "Sarah, engineering teams running BEAD-funded fiber programs are hitting a familiar wall: construction crews are ready, but drawing production and permitting can't keep pace."
- NO company name in opener
- Composed in 8.1s

Both emails read like a senior AE who knows the industry cold. None of:
- "I hope this finds you well" / "I wanted to reach out" (AI tells blocked)
- Forced "[Company] is doing X" personalization (the opener is industry-level)
- Generic "we help companies like yours" framing (substrate gives real industry texture)

## What's verified to ship-ready quality

- ✓ Composition pipeline (Tim approved most emails before today; today's run-zobi showed conciseness was the only consistent dim issue)
- ✓ Generalized composer (Day 1 priority, built + tested)
- ✓ Portal microsite routes (live + draft both render per `c3e4648`)
- ✓ Portal System Brief renders ICP Verdict + Email Deliverability sections
- ✓ Andrew-class red-confidence flag write + retry queue (Q1+Q2 commit `e46521449`)
- ✓ ICP volume verdict landing in DB (Q5 commit)
- ✓ HubSpot 3-body-paragraph composer mandate working
- ✓ AE territory + calendar URLs canonical (SoT §17)
- ✓ SoT drift rule + lock index (SoT §18)
- ✓ Focus 100 + FC2026 attendee CSVs operator-contract compliant

## Open decisions remaining for operator

| # | Decision | Why it matters | When needed |
|---|---|---|---|
| 1 | Pick canonical substrate store (Supabase vs AgentDB) | Phase B retrieval has two paths today | Before Step 3 (orchestrator skeleton) |
| 2 | Generalized templates inventory — do they exist or do I draft? | Affects Step 4 composer prompt | Before Step 5 cohort test |
| 3 | Apollo quality audit threshold — what % match is "good enough"? | Gates whether specific-mode ships at all | Before Step 6 |
| 4 | SPECIFIC_MODE_THRESHOLD N — pick after running calibration on 28 cold prospects | Composer mode trigger | Before Step 6 |
| 5 | Re-ratify pitch variants A/B/C (last touched 2026-06-07) | Hidden trust point | Before any send |
| 6 | Re-ratify ICP volume floors (250 mi / 500 drawings, SKO 2026) | Hidden trust point | Before any send |
| 7 | Re-ratify anti-AI-tell regex (2025 research, may be stale) | Hidden trust point | Before any send |
| 8 | Re-ratify ICP_CTA_OPTIONS per segment | Hidden trust point | Before any send |

## Timeline forward (revised from critique)

| Step | Effort | Cumulative |
|---|---|---|
| 0 — Step 0 prerequisites (substrate store + Apollo audit + N calibration) | 1 day | Day 1 |
| 1 — Types (DONE) | 0.5 day | Day 1 |
| 2 — Apollo client wrapper (BL-013/014) | 1 day | Day 2 |
| 3 — Shadow-emit orchestrator | 1 day | Day 3 |
| 4 — Generalized composer (DONE — committed early) | 1 day | Day 4 (1 day ahead) |
| 5 — Portal click-sentence-see-source view | 1.5 days | Day 5.5 |
| 6 — Specific-mode composer | 1 day | Day 6.5 |
| 7 — Domain-sanity pre-check | 0.5 day | Day 7 |
| 8 — Engine-qa Test 1 + 2 cohort run | 1 day | Day 8 |
| 9 — Operator timed-review + source-attribution audit | 1 day | Day 9 |

**~9 days to portal-ready (A track).** Email-finder (B track) + delivery (C portion) are separate streams.

## What I'd start next session

In order of impact:
1. Apollo `short_description` quality audit on 5-10 of the 28 true-cold prospects (Step 0.2 — the make-or-break gate)
2. Apollo client wrapper with BL-013 (suffix strip) + BL-014 (volume signal mining)
3. Canonical substrate store decision + cleanup
4. Shadow-emit orchestrator skeleton

## Files written / committed this session (in order)

1. `data/showrev/P2-PILOT-ALIGNMENT.md` (v1 → v2)
2. `docs/specs/substrate-tiering-architecture-spec.md` (v1 → v2)
3. `src/showrev/m1-email-find/evidence-tiering/types.ts` (v1 → v2)
4. `data/showrev/inorsa-source-of-truth.md` (v8 → v9, added §17 + §18)
5. `src/showrev/m1-email-find/evidence-tiering/generalized-composer.ts` (NEW)
6. `src/showrev/m1-email-find/evidence-tiering/test-generalized.ts` (NEW)
7. This status doc

## Anything I'd want a sanity-check on

- **The 2-tier collapse**: critique said collapse 4→2, I accepted. If you'd rather keep the explicit STRONGLY_INFERRED label for clarity, easy revert.
- **Generalized mode shipping first**: critique flipped the build order vs my original spec. If you'd rather do specific-mode first because your gut says most Focus 100 will have rich substrate, easy revert.
- **Apollo demotion to USE_TO_SHAPE**: this is the single biggest architectural decision. If your gut says Apollo is reliable enough to use as USE_DIRECTLY directly, the wrong-but-confident-fact reputation risk gets reopened.
- **C-portion scope cut**: explicit acknowledgment that the catastrophic-risk infra (warming, circuit, bounce) is deferred. Until C is built, we can review on portal but can't safely send at volume.

Welcome back. Ready to start Step 0 next session.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-08 23:55 | Claude | Initial status snapshot at end of operator's 2-hour autonomy window. |
