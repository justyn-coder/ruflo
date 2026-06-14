---
title: Forensic Diagnostic — Cold Prospecting System Data Quality Failure
date: 2026-06-12 (drafted)
authored_by: Claude (Opus 4.7, fresh session)
status: DRAFT for operator + judge panel review
purpose: Root cause analysis of substrate contamination and composer hallucination across the 15-prospect smoke + 182-prospect Tim-approved cohort
---

# Executive summary

**The question:** Did the substrate hallucinate, did the composer hallucinate, or both?

**Answer:** Both. And neither was caught at any of seven check points.

The system shipped 5-of-15 strip-recomposed emails because:

1. **Substrate ingested PROHIBITED domains (ZoomInfo, LeadIQ, RocketReach, Yelp) and tagged them with `source_kind: 'web_research_dated'`** — which maps to the highest tier ceiling (USE_DIRECTLY) in the active 2-tier system.
2. **The composer used those PROHIBITED-source "facts" verbatim in email bodies** because the active tier system has no domain awareness — it classifies harvest method, not source domain.
3. **The composer added inference language on top** ("active M&A mode", "full capture mode", "final stretch", "fresh growth strategy") that no primary source supports.
4. **No check stopped either failure mode:**
   - The pipeline has TWO tier systems in code. The domain-aware one (`verify-facts.ts`) is stranded — never wired in.
   - `mechanical_check_passed = true` for all 5 (those checks don't include source domain).
   - `judge_feedback_loop_attempts = 0` across all rows — the judge feedback loop never fired.
   - The send-confidence substrate axis **counted PROHIBITED-source claims as "directly-citable"** (Blake Griffin / CNE: 8 directly-citable claims including ZoomInfo → 81.7 high-confidence).
   - Tim approved on composition only ("does NOT check accuracy of info" — operator-confirmed).
   - The portal displayed high confidence scores → operator approved.
   - HS load did no domain check.

**Cohort impact:** 182 emails Tim-approved on craft. Substrate contamination is structural (loader behavior, not a one-off). Without a fix, every email in the 182 cohort and every future cohort carries the same risk.

---

# Section 1 — Empirical evidence (the smoking gun)

## 1.1 PROHIBITED domains found in `sr_company_evidence`

Queried directly from Supabase project `slttpknnuthbttjuzrnz` against the 5 strip-recomposed companies:

| Prospect | Company | Domain | source_kind tag | Resulting tier ceiling |
|---|---|---|---|---|
| Ben Lewis-Ramirez | CNE | zoominfo.com/c/communication-network-engineering | `web_research_dated` | **USE_DIRECTLY** |
| Ben Lewis-Ramirez | CNE | zoominfo.com (CAD/GIS, Dir of Ops hiring) | `web_research_dated` | **USE_DIRECTLY** |
| Ben Lewis-Ramirez | CNE | leadiq.com/c/communication-network-engineering | `web_research_dated` (persona) | **USE_DIRECTLY** |
| Ben Lewis-Ramirez | CNE | leadiq.com (Moore partnership) | `web_research_dated` | **USE_DIRECTLY** |
| Jesus Loya | PC Telcom | rocketreach.co/pc-telcom-profile (NTCA Gig) | `web_research` | USE_TO_SHAPE |
| Jesus Loya | PC Telcom | rocketreach.co/pc-telcom-profile ($64.6M revenue) | `web_research_dated` | **USE_DIRECTLY** |
| Jesus Loya | PC Telcom | leadiq.com (71 employees) | `web_research_dated` | **USE_DIRECTLY** |
| Jesus Loya | PC Telcom | yelp.com/biz/pc-telcom-holyoke (geographic claim) | `web_research_dated` | **USE_DIRECTLY** |
| Jesus Loya | PC Telcom | zoominfo.com/c/pc-telcom (managed Wi-Fi) | `web_research_dated` | **USE_DIRECTLY** |
| Zack Burnes | United Tel Supply | zoominfo.com/c/united-tel-supply (COO recruiting) | `web_research_dated` (persona) | **USE_DIRECTLY** |
| Zack Burnes | United Tel Supply | zoominfo.com (Fiber Connect 2026 exhibitor) | `web_research_dated` | **USE_DIRECTLY** |
| Zack Burnes | United Tel Supply | 9× LinkedIn personal profiles | `web_research` | USE_TO_SHAPE |

12 PROHIBITED-domain rows across 3 prospects, **all tagged with a SourceKind that allows them to reach the composer's body.**

## 1.2 Composer output — direct injection of PROHIBITED-source claims

**Blake Griffin / CNE** (`sr_engine_output`, composition_review = "approved" by Tim):

> "Blake, Communication Network Engineering's move to add CAD/GIS staff, a Director of Operations, and a Director of Business Development in the same window signals you're building for a materially larger project load."

That sentence is the ZoomInfo claim verbatim. The substrate evidence row from `zoominfo.com/c/communication-network-engineering-inc/348795604` says: *"CNE has been actively hiring OSP Technicians, CAD/GIS staff, and a Director of Operations."* The composer **fused the ZoomInfo claim with the LeadIQ Director of Business Development claim** to produce a sentence that derives entirely from PROHIBITED sources.

**Substrate confidence label:** `high` (81.7) — system was 81.7 / 100 confident in the substrate. The substrate axis explanation field literally says: *"8 directly-citable claims about this company (decent research)"* — counting ZoomInfo + LeadIQ rows as "directly-citable" because the loader tagged them `web_research_dated`.

**`mechanical_check_passed`:** `true`
**`judge_feedback_loop_attempts`:** `0`
**`composition_review`:** `"approved"` by Tim
**`send_status`:** `pending` (was queued to send)

## 1.3 Composer hallucination — inference on top of clean substrate

**Gabriel Gilliland / BRMEMC** (`sr_engine_output`, composition_review = "approved" by Tim, send_confidence_score 93.3):

> "Gabriel, BRMEMC Fiber's buildout into the final stretch puts real pressure on engineering throughput — the last mile is always the hardest to pace."

BRMEMC substrate is **clean** (no PROHIBITED domains). The themountainbuzz.com source says: *"BRMEMC Fiber recently surpassed 21,000 subscribers, representing approximately one-third of the cooperative's total meter count, with the network currently about two-thirds complete."*

**The composer turned "two-thirds complete" into "buildout into the final stretch."** That's editorialization — "final stretch" is composer-added rhetoric, not in any source.

Same pattern across the other 3 still-to-fix prospects:
- Laurie Turck: "active M&A mode" — composer added; PRNewswire source covers only the Olympus close
- Dara Leslie: "full capture mode" — composer added; Morgan Stanley source covers only the 510K passings target
- Ben Lewis-Ramirez (post-strip): "signals a fresh growth strategy" — composer added; CEO quote source covers only "advancing a growth strategy"

## 1.4 Multiple composer attempts, no convergence

Gabriel Gilliland's row history shows **5+ composition versions** in `sr_engine_output`. Some have `composition_review = "approved"` (by Tim). Others are `pending` or `flag`. **`judge_feedback_loop_attempts = 0` on every row** — the judge loop never fired even on the flagged ones.

---

# Section 2 — Root cause (the code-level failure cascade)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1: Upstream agent does "web research" via LLM with web access.     │
│         Receives URL: zoominfo.com/c/[company]                          │
│         Labels output as source_kind: "web-research-dated"              │
│         No domain check at this stage.                                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2: load-workflow-output.ts / load-email-workflow.ts                │
│         Maps "web-research-dated" → SourceKind 'web_research_dated'    │
│         No domain check.                                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3: substrate-query.ts → writeEvidence()                            │
│         Bulk inserts into sr_company_evidence with source_kind          │
│         No domain check at write time.                                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4: substrate-query.getCompanyEvidence()                            │
│         Returns row with tier = tierBySourceKind('web_research_dated') │
│                                  = 'USE_DIRECTLY'                       │
│         No domain check at read time.                                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5: evidence-tiering/orchestrator phase3TierAndEmit()               │
│         Groups by category. Concatenates with other USE_DIRECTLY        │
│         claims. No domain check.                                        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 6: send-confidence.computeSubstrateScore()                         │
│         Counts the row as use_directly_count++                          │
│         "8 directly-citable claims" → substrate axis = high             │
│         Composite score 81.7 — looks like rich data.                    │
│         No domain check.                                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 7: Composer (specific-composer / lean-composer / etc.)             │
│         Reads USE_DIRECTLY claims. Permission: "may reference, but      │
│         numeric claims still framed as approximations."                 │
│         The claim "CNE hiring CAD/GIS staff" is non-numeric → used      │
│         verbatim in body sentence.                                      │
│         No domain check.                                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 8: Mechanical checks (composer-constraints?)                       │
│         Pattern-based checks for AI tells, length, structure.           │
│         mechanical_check_passed = true. No source domain check.         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 9: Judge feedback loop                                             │
│         judge_feedback_loop_attempts = 0. NEVER FIRED.                 │
│         judge_excluded_claim_ids = []. NEVER EXCLUDED ANYTHING.        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 10: Tim review (composition_review = "approved")                   │
│         Tim approves on craft / human-likeness ONLY.                    │
│         Does NOT check source accuracy (operator-confirmed).            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 11: Portal display                                                 │
│         Shows substrate_label = "high", composite = 81.7, "approved".  │
│         Operator confidence dials all look green.                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 12: HubSpot load                                                   │
│         hubspot-loader.ts writes body to contact properties.            │
│         No domain check.                                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
                          ZoomInfo claim
                          fires to prospect
```

**11 steps. 0 domain checks. 1 judge loop that never fires.**

There is `verify-facts.ts` in the codebase with full domain awareness (Tier 1 / 2 / 3 / 4 + ZoomInfo / LeadIQ named). **It is stranded — never imported by orchestrator, composer, judge, or anyone in the active pipeline.**

---

# Section 3 — The 4-lens analysis

## 3.1 PM lens

**Scope:** 182 emails Tim-approved on craft, blocked by data confidence crisis. 15-prospect smoke is the canary sub-cohort. P2 cold target = 500 emails in the next week, scaling to 800 by July 25 per synthesis Section 7.

**Dependencies:**
- HubSpot load is unblocked technically — but blocked by quality bar.
- AE morning enrollment ritual depends on operator-approved roster.
- Brain function L2 (per-pattern learnings) can't compound until we have clean send → reply → outcome data.

**Risk register (before fixes):**

| Risk | Impact | Probability | Notes |
|---|---|---|---|
| ZoomInfo/LeadIQ claims in 167+ remaining cohort | Trust burn at scale | Near-certain | Same loader path produced same contamination |
| Inference language in nearly every body | Soft trust erosion | Near-certain | Composer behavior, not data-specific |
| Tim-approved-but-bad cohort sits stale | Reply window narrows | Certain | Days = relevance decay |
| Operator catches a leak post-send | Reputation event | Possible | Real cost |

**Open loops (operator-flagged):**
- P1 send data needs migration from 2nd Supabase instance.
- Old canonical docs still findable, marked stale 2026-05-12.
- AI-writing-detection hardening (DL-199): 3 research-validated checks for echoed structure / participial density / sentence-length variance.

## 3.2 Engineer lens

**Code-vs-spec gaps:**
- `verify-facts.ts` exists with full domain-aware tier system. **Not wired.** ~336 lines stranded.
- `sr_engine_output.judge_feedback_loop_attempts` field exists. **Never populated** (always 0 across queried rows).
- `sr_engine_output.judge_excluded_claim_ids` ARRAY field exists. **Always null**.
- `sr_engine_output.verified` field exists. **Always false** (no rows verified).
- `sr_engine_output.confidence_score` (integer) and `sr_engine_output.send_confidence` (jsonb) are **two parallel confidence systems**. The integer one is unset; the jsonb one drives portal.
- `sr_company_evidence.source_date` is **null on most rows** — staleness check can't fire if dates aren't populated.

**Architectural redundancies:**
- TWO tier systems (domain-aware vs source-kind-aware) — only one wired.
- TWO confidence systems (integer vs jsonb) — only one wired.
- THREE substrate surfaces (`sr_brain_substrate`, `sr_company_evidence`, semantic fallback) — read API spans all three but write paths and validation rules differ.
- TWO loader paths (`load-email-workflow.ts` + `load-workflow-output.ts`) with similar but not identical source-kind mappings.

**Test coverage:** `evidence-tiering/tests/rich-dossier.test.ts` exists. Doesn't test PROHIBITED-domain rejection.

**Dead code candidates:** `verify-facts.ts` (stranded but valuable — needs to be wired, not deleted).

## 3.3 Architect lens

**Single source of truth violations:**
- Tier classification is split across `verify-facts.ts` (domain-aware) and `types.ts` (source-kind-aware). No canonical authority.
- "What counts as a directly-citable claim" is computed in `send-confidence.computeSubstrateScore()` based on `use_directly_count` — but the underlying `USE_DIRECTLY` tier doesn't guarantee source quality.
- "PROHIBITED domains" exist as a concept in `verify-facts.ts` regex and in `synthesis Section 2` documentation, **but no canonical list** lives anywhere as data.

**Layer separation:**
- The substrate-query layer is well-bounded (good).
- The composer layer reads from substrate-query but has no contract for "source domain quality." Composers trust upstream.
- The judge layer has no read path back into the substrate to verify claims against source — it judges output text in isolation.

**Anti-patterns observed:**
- "Trust the upstream label" pattern at every step. Each step trusts the previous step's tag. No step independently re-validates.
- "Tier ceiling" model: USE_DIRECTLY is the ceiling, not the floor. Any source kind in that ceiling can be quoted. No constraint that USE_DIRECTLY must be a clean source.
- "Domain awareness exists but stranded" — verify-facts.ts is the architectural evidence that the team already knew this was a problem. Domain awareness lives one import away.

## 3.4 Biz Lead lens

**Direct OKR impact:**

| OKR | Current state | Fix value |
|---|---|---|
| **KR1 trust** | 0 PROHIBITED sources target → reality: 4+ PROHIBITED claims per affected prospect | High — fixing this is the KR1 |
| **KR2 send quality** | Bounce / spam / reply gates aren't compromised by data quality, BUT trust burn from bad facts shows up in reply rate downside | Medium-high — sustained reply rate depends on substrate quality |
| **KR3 tempo** | 30-60 sends/AE/day blocked by quality gate — can't scale to 500/week without clean cohort | High — unblocks the cadence |
| **KR4 empirical** | A/B tests can't run cleanly if substrate is contaminated (would be measuring noise) | Medium — cleans the signal for KR4 |
| **KR5 Brain** | Brain L0/L1/L2/L3 can't compound without clean outcome data | High over time |

**Cost of the gap:**
- Send 1 contaminated email to a Director of Business Development who knows ZoomInfo is wrong → that prospect is burned permanently AND tells industry peers.
- Inorsa is a pilot client. Quality failure here jeopardizes the Inorsa engagement AND reputational positioning for the next 5 enterprise pilot conversations.

**Cost of the fix:**
- Plan A: ~6 hours of focused code work to wire domain-aware tier check + activate judge loop + back-fill PROHIBITED detection on existing rows. Then re-substrate (or filter) and re-compose 167 emails. **Net: 24-48 hours wall-clock to ship clean 500-email week.**
- Plan B: 1-3 weeks of architecture for sentence-level attribution, claim-verification table, multi-source corroboration, Brain learning loop wiring.

**Strategic position:** Plan A is mandatory to keep Inorsa pilot on track. Plan B is the compounding moat — what differentiates us from "another cold email tool."

---

# Section 4 — What we got right

Worth naming, because the architecture isn't broken — it's gappy:

- 2-tier model (`USE_DIRECTLY` / `USE_TO_SHAPE`) is sound, just needs domain-awareness layered in.
- 3-axis confidence (ICP / email / substrate) decomposition is right — composite hides too much; the per-axis breakdown gives operator the right surface.
- Sentence-level attribution types (`AttributedSentence`, `ComposedEmail`) exist — they're just not populated. The data model already supports click-sentence-see-source.
- FCC BDC integration (`getFccCoverage`) is wired and would be USE_DIRECTLY — once the regulatory data is loaded.
- `apollo_cross` (Apollo + 2nd source <12mo cross-confirmation) is conceptually right — would lift Apollo from USE_TO_SHAPE to USE_DIRECTLY.
- `substrate_quoted` (substrate quote where speaker.company === prospect.company AND speaker.role qualifies) is the gold pattern for in-substrate authority.
- `verify-facts.ts` was the right idea — just stranded.
- Portal three-role review (System self-grades, Tim craft, Operator confidence dials) is the right org pattern.

# Open questions for the judge panel

1. **Domain blocklist data location** — config file, database table, or hard-coded constant? Argument for each.
2. **Where to enforce the check** — at substrate write time only, at substrate read time only, at every composer-input step (defense in depth)?
3. **What to do with the existing contaminated `sr_company_evidence` rows** — hard delete, soft mark + filter on read, or rebuild from clean re-research?
4. **Judge feedback loop** — should it be required (block on judge failure) or advisory (log + allow)?
5. **Tim's craft review** — does Tim's "approved" carry forward when bodies change after his review, or does it reset?
6. **Composer inference language** — pattern-list and reject ("active mode", "full capture", etc.) or LLM-judge it ("does this body contain unsupported modifiers")?
7. **How aggressive should the staleness check be** — synthesis says 90 days; some sources (cooperative case studies) are structurally older but accurate. Per-tier configurability?
8. **The dummy contacts in the smoke** — Chad's content currently. Should we change the dummies for the Plan A pre-fire smoke?

---

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 23:50 | Claude (Opus 4.7, fresh session) | Initial diagnostic. Empirical findings from Supabase + code review. Ready for Plan A drafting. |
