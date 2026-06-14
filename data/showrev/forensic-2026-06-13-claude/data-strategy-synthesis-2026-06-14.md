---
title: Data strategy synthesis — Inorsa fiber outreach, market+product audit 2026-06-14
status: DRAFT (pending judge panel + operator ratification)
last_updated: 2026-06-14 03:20 EDT
version: v1
authored_by: Claude (Opus 4.7) — fix-sprint Sunday session, post-Nick-feedback red-team
audience: Operator + cross-family judge panel + next-session Claude
purpose: Forensic audit of (a) market-side ICP/persona/JTBD landscape and (b) product-side Inorsa value-prop scope, with red-team of my own initial Nick-feedback interpretation. Feeds judge panel rubric.
---

# Data strategy synthesis — Inorsa fiber outreach

## Executive read (60 seconds)

I red-teamed my own initial Nick-feedback interpretation against the full canonical Inorsa knowledge base. I was **partly wrong** and **mostly missing context**. The Nick canon (2026-06-04) already validates 6 of 7 JTBDs, the JTBD matrix already pairs each JTBD with the Nick-approved pain language, and the composer-constraints.ts already enforces 5 of Nick's hardest kill-list items. The problem Nick surfaced on the /brief/chris review is **not a system-wide failure** — it's a **substrate-source tiering gap**: external industry research (Doug Dawson, Cartesian, FBA workforce studies) was being mixed in with internal Inorsa-validated substrate (Mike/Lucas/Nathan emails, Chris one-pager, deck proof points, booth observations) without rank-ordering by relevance-to-Inorsa-scope.

**Right intervention is NOT a kill-list extension.** It's a substrate tiering layer (Tier A/B/C/D by relevance-to-Inorsa-scope) + composer preference for Tier A/B as lead claims + judge-time check that headline claims are lead-eligible.

**Worth a judge panel?** Yes. The rubric proposal is in §7. Proposed launch via `scripts/judge-panel-2026-06-13.mjs` reused with this doc as input + the §7 rubric.

---

## 1. Red-team of my initial Nick-feedback interpretation

### What I got RIGHT (keep)

1. **Construction-vs-Engineering boundary is real and Inorsa-canonical.** Confirmed in §7 of `inorsa-source-of-truth.md` v10 + §"What Inorsa does NOT do" in Nick canon. Inorsa impacts design-side throughput. Does NOT impact construction $/ft, labor productivity in field, crew availability.

2. **Engineer-vs-Drafter distinction is real.** Per Inorsa KB: Ram (drafter) does ~2 hrs finishing automated drawings vs 8 hrs previously. The fiber drawings product is for DRAFTERS, not licensed engineers. Per Nick: "Most of the engineering work in fiber is done by technicians (drafters), not engineers."

3. **F3 substrate-tier classifier doesn't catch relevance-to-scope.** F3 grades source TRUSTWORTHINESS by URL domain. All Doug Dawson / Cartesian / FBA sources are T1/T2 — legitimate. Doesn't catch "is the CLAIM in Inorsa scope."

### What I got WRONG (correct)

1. **"45% rejected, 40% useless = system-wide contamination" was too binary.** Nick's "doesn't help our case" approval is NOT a rejection — it's saying "this fact is true but can't carry the lead." The fact can still be supporting context. My binary framing missed the 3-tier reality: lead-eligible / context-only / out-of-scope.

2. **"JTBDs need rebuilding" was wrong.** Per Nick canon 2026-06-04, JTBDs 1-2-4-5-6-7 are YES (some with nuance) and JTBD 3 was reframed (already corrected in `jtbd-matrix.md` v1 as JTBD 6 "Deliver Faster, Protect the Relationship"). The JTBDs are sound. The substrate-to-JTBD pairing at the claim level is the bug.

3. **"Need a kill-list extension on composer-constraints.ts" was hasty.** The existing PRODUCT_GUARDS already has 7 entries including 5 BL-016 Nick kill-list items. Adding "construction claim" patterns would over-block — those claims CAN be valid context (BEAD-pressure setup) within a Nick-approved JTBD if positioned right. The right intervention is upstream of the composer, at substrate ingestion.

### What I MISSED entirely (the bigger context)

1. **The internal Inorsa-validated substrate is already documented as the highest-quality source** — and I treated it as if it didn't exist. `jtbd-matrix.md` v1 has each JTBD pinned to Mike Rutski / Lucas Spencer / Nathan Dunn email quotes verbatim ("Every permit return on an FTTX package means your team redesigns on your dime, not the client's"). These are NICK-CONTEXT-aware AE language. WAY more powerful than Dawson workforce stats.

2. **Booth observations are PRIMARY substrate.** Spencer Kariniemi at Booker reached out INBOUND asking about "automated basemap drafting." Jackie at Dallas firm with 250 active fiber projects asked for a single platform to standardize. Indus CAD with 200+ employees and offshore team still doing manual GIS-to-CAD conversion. These are direct prospect-language observations. The brief/chris page where Nick reviewed was using Doug Dawson industry quotes — not these primary observations.

3. **Engagement data from prior sends is documented.** Per `jtbd-matrix.md`: `challenger_insight` pattern got 75% reply rate for `permit_cycle` persona on JTBD 1. `loss_aversion` only worked for `capital_efficiency` persona on JTBD 3. This is empirical signal — should weight heavily in pattern selection.

4. **The 40-50% permit rejection rate** is THE narrative anchor (Nick-confirmed, locked at 30-40% for outreach use). Combined with "Kickback delays are MONTHS. Production delays are DAYS" — this is the core Inorsa pitch. None of the q1-q20 substrate Nick reviewed actually USED this anchor directly. He was reviewing weaker secondary substrate.

5. **`composer-constraints.ts` already has the framework for kill-listing.** The Tim kill-list (10 entries observed from TC-1B-v2 testing) is the precedent. Any addition follows that pattern. But the bigger question is whether the FAILURE happens at compose-time (current scope) or at substrate-ingestion-time (different layer).

---

## 2. Market side audit — ICPs, personas, JTBDs, pains

### 2.1 The 3 ICPs (canonical per inorsa-knowledge-base + Inorsa SOT §15)

| ICP | Volume floor | Definition | Best target shape |
|---|---|---|---|
| **Fiber operators** | ≥250 mi/yr (~1.3M LF) | ISPs / muni broadband / RECs building fiber networks | Mid-size + less-automated; BEAD sub-grantees; multi-state operators |
| **A&E firms** (fiber side) | ≥500 combined drawings/yr | Engineering firms producing CDs + permit packages | Multi-client A&E; doing manual GIS→CAD; not heavily offshored already |
| **Construction contractors** | (not formally specified) | Field construction firms feeding off A&E drawings | Idle-crew-cost-aware (Lucas's Ohio Gig framing) |

**Hard disqualifiers:**
- >50-60% existing GIS→CAD automation (TEP rejected for this)
- MicroStation users (legacy, doesn't convert, prior customer churned)
- Tower-only A&E firms (Inorsa fiber is fiber-only)
- Sole proprietors / very small shops (volume floor)

### 2.2 Personas within each ICP

Per `jtbd-matrix.md` mapping + sr_prospects substrate (71 P1 dossiers):

| Persona bucket | Count (P1) | Primary JTBD | Best influence pattern | Engagement signal |
|---|---|---|---|---|
| **permit_cycle** | 17 | JTBD 1 (Permit bottleneck) | challenger_insight | 75% reply rate (highest) |
| **build_pace** | 16 | JTBD 2 (Scale) + JTBD 5 (Crews) | challenger_insight or social_proof | 6 Strong signals (highest density) |
| **program_leverage** | 8 | JTBD 7 (Win BEAD) | challenger_insight | Under-tested |
| **drawings_quality** | 3 | JTBD 6 (Protect relationship) | social_proof | Smallest bucket |
| **capital_efficiency** | 2 | JTBD 3 (BEAD econ) | loss_aversion | Only segment loss_aversion worked |
| **cycle_time_exec** | (unspecified) | JTBD 1/2/3 overlap | mixed | Under-tested |

### 2.3 The 7 JTBDs (all Nick-validated per canon 2026-06-04)

| # | JTBD | ICP | Status | Nick framing nuance |
|---|---|---|---|---|
| 1 | Break the Permit Bottleneck | Both | YES | Speed → time → QC. NOT "Inorsa validates inputs." |
| 2 | Scale Without Hiring | A&E (primary) | YES | Don't promise % without file review |
| 3 | Make BEAD Economics Work | Operator (primary) | YES | Acceleration of paypoints, not construction cost reduction |
| 4 | Standardize Across Markets | A&E (primary) | YES | Output to each client's standard from one input process |
| 5 | Keep Crews Moving | Contractor | YES | Engineering drawings never the bottleneck |
| 6 | Deliver Faster, Protect Relationship | A&E (specific) | YES | Reframed from "validates inputs" — now "faster delivery + more QC time" |
| 7 | Win the BEAD Bid | A&E (primary) | YES with nuance | Capacity multiplier, don't promise 80% |

### 2.4 Pain language — the substrate triage (THIS is the core insight)

**FIBER-ONLY SAFETY DEFAULT (operator-locked 2026-06-14):** When a substrate claim is ambiguous between fiber and tower context, **assume tower** (out-of-scope) and exclude. Don't reframe ambiguous-context claims as fiber. Tower content in a fiber email risks credibility + AE trust + Nick relationship — the entire pilot. Memory: `feedback_fiber_only_when_in_doubt_assume_tower`.

**FIBER-RESCUE RULE (added v2 per judge panel R1 dissent — all 4 judges flagged the safety default risked over-exclusion):** A claim is eligible for Tier C even if surrounding context mentions construction or tower IF the claim itself contains EXPLICIT fiber-scope language: `fiber`, `FTTH`, `fiber drafter`, `fiber operator`, `GIS→CAD`, `fiber permit`, `BEAD fiber`. Example: "BEAD workforce stats specifically about fiber drafters" — rescue-eligible Tier C, NOT Tier D, despite adjacent workforce-shortage context. Fiber-rescue does NOT promote to Tier A/B. The default still excludes when EITHER (a) no explicit fiber language present OR (b) Inorsa-scope boundary crossed.

Substrate that paints prospect pain falls into 4 tiers by relevance-to-Inorsa-scope:

| Tier | Source type | Example | Use in email |
|---|---|---|---|
| **A — Lead-eligible (gold)** | Internal Inorsa AE emails + Chris one-pager + Nick canon + deck proof points | "Every permit return on an FTTX package means your team redesigns on your dime, not the client's" (Mike Rutski email to Indus CAD). 40-50% rejection rate (Nick). 70% cycle time reduction (deck). | LEAD claim |
| **B — Prospect-validated (silver)** | Booth observations + customer email threads + AE call recaps | Spencer Kariniemi (Booker) reached out INBOUND for "automated basemap drafting." Indus CAD doing manual GIS→CAD with 200+ employees + offshore team. Jackie at Dallas firm with 250 active projects asking for single standardization platform. | LEAD or SUPPORT |
| **C — Industry-research, Inorsa-aligned (context)** | Doug Dawson regulatory/permitting context + Chris one-pager industry framing + FBA Gary Bolton speed-to-construction mandate | H.R. 2289 permit shot-clock bill. FBA CEO on speed-to-construction political mandate. "Industry on hold" tension. | CONTEXT/BRIDGE only |
| **D — Industry-research NOT Inorsa-aligned (off-target) + AMBIGUOUS tower/fiber claims** | Construction labor stats + fiber tech / splicer / bore operator shortage + $/ft installation costs + dig-once construction efficiency + ANY claim that could be tower per fiber-only safety default | Cartesian $18/ft underground. 205K fiber techs needed. 58K new + 120K replacement = 178K gap. $50K poaching. Any workforce stat that doesn't EXPLICITLY say "fiber drafters" / "FTTH design" / "GIS-to-CAD" or similar fiber-specific scope. | DO NOT USE |

**This is what Nick was actually flagging in the brief/chris review.** Of the 20 quotes:
- 0 were Tier A (none came from internal AE quotes; the brief was pulling external research only)
- 0 were Tier B (none came from booth/customer threads either)
- 8 were Tier C (the ones he marked "approved but doesn't help our case")
- 9 were Tier D (the ones he rejected as construction-not-engineering)
- 3 were edge/conditional (q2 conditional, q5 engineer-vs-drafter, q10 standalone-clarity)

**The brief/chris page Nick reviewed was sourcing exclusively from Tier C/D.** That's the actual bug. The composer-constraints.ts kill-list is correctly blocking Tier-D *language* but the substrate-LIBRARY is over-weighted toward Tier C/D research.

### 2.5 Where the data is thin (gaps to address)

Per `jtbd-matrix.md` §Gaps + my audit:
- Tier B substrate is small (we have 71 P1 dossiers + booth obs but limited cross-prospect patterns)
- No CFO/finance persona for JTBD 3 economics framing (currently using `capital_efficiency` with N=2)
- Reply content not classified — we know who replied but not WHAT they responded to
- BEAD sub-grantee data not yet structured

---

## 3. Product side audit — Inorsa value prop scope

### 3.1 What Inorsa actually does for fiber (canonical, Nick-verified, post-F2)

**The mechanism (Variant A, ops_builder default):**
> "We convert your GIS and LLD data into construction and permit drawings in minutes, so your team takes on more work without adding headcount."

**Two-step framing (Chris one-pager + SoT §3):**
1. **Ingest:** Inorsa structures GIS and LLD inputs into asset-level data. No manual extraction.
2. **Generate:** Inorsa produces construction and permit drawings ready for engineer review and submission, with full traceability back to source.

**Key claims SAFE TO USE (SoT §7 verbatim):**
- ~10 min source data → preliminary drawing
- Deterministic, traceable output (not AI hallucination)
- Scales drafting capacity 2-5x with existing headcount (range, not guarantee)
- Accelerates production so teams have more time for their own QC
- Output to each jurisdiction's standard from one input process
- Token-based pricing scales with build volume, not headcount

**Best deck proof points (Nick + Chris approved):**
- "70% reduction in construction drawing cycle time"
- "~10 min source data to preliminary drawing"
- "A week of manual drafting can compress to minutes"
- "56 hours to under 3 minutes" (customer thread)

### 3.2 What Inorsa does NOT do (hard boundaries per Nick canon)

| What | Why it's not Inorsa |
|---|---|
| Validate input correctness | Errors in GIS = errors in output |
| Catch errors in upstream network management tool | Per Nick: "errors in their network management tool translate directly as errors in the Inorsa output" |
| Do QC on generated drawings | Per Nick: "We won't catch the errors, but now they have more time to" |
| Reduce permit return rates directly | Speed gives time for better QC, but Inorsa doesn't do the QC |
| Conflict avoidance against utility GIS layers | Can ingest those layers, but conflict avoidance is future |
| Impact construction costs or efficiency | "We get construction activities approved sooner, but we don't impact the actual construction activities" (Nick on brief/chris review) |
| Replace GIS | Ingests FROM GIS, not a GIS replacement |
| Visualization tool | (The Nvidia confusion from booth) |
| Construction management platform | SiteTracker's job |
| Guarantee a specific automation % | Per Nick: "Don't claim a fixed % without a file review" |

### 3.3 The 4 value-prop angles (Nick framing 2026-06-03)

These are the ONLY frames the AE should use:

1. **Revenue Acceleration** — do the work faster, get paid sooner (cycle time)
2. **Revenue Generation** — accept more work without adding headcount (volume)
3. **Opportunity** — your team isn't stuck on this work, can do other things (capacity unlock)
4. **Mistake proofing** — ONLY where a key input is missing (NOT general QA)

### 3.4 Pricing structure (do NOT quote in outreach)

- Asset Data Foundation + Deliverable Capacity + Ecosystem Connectors
- No seats, no tokens, unlimited storage
- Pay-as-you-go: tokens consumed as drawings generate
- Outreach rule: "scales with your build volume, not your headcount" is the only structural reference

---

## 4. Connection points — where market pain meets Inorsa value (NOVEL)

### 4.1 The core narrative bridge (Nick-validated, under-utilized)

**"Speed creates time creates quality."**

Most fiber operators / A&E firms treat the permit-rejection problem as a JURISDICTION problem. The Nick canon insight is that the REAL constraint is RUSHED QC because drawing production is too slow. If your drawings take a week, your team rushes QC. If they take 10 minutes, your team properly reviews before submission.

**Bridge math (40-50% rejection rate + 3-6 weeks per kickback + 4 simultaneous builds):**
- 50% × 4 builds = 2 kickbacks/cycle
- 2 × 4.5 weeks median = 9 weeks of redesign work
- Per month of build pace: 9 weeks of EXTRA DRAFTING work routed to the queue (NOT "crew-idle" — Inorsa doesn't impact construction labor per §3.2; the math is drafter-cycle redo, not field-crew idle time)
- ROI lever: Inorsa shifts time allocation from 80% drafting / 20% QC to 20% finishing / 80% QC

**v2 self-correction per judge panel R1 (GPT-5 dissent):** The original v1 framing said "9 weeks of crew-idle + redesign cost." GPT-5 flagged this drifted into construction-impact framing and contradicted §3.2 boundary ("we get construction activities approved sooner, but we don't impact the actual construction activities"). Corrected: the math is about DRAFTER cycles redo'd, not field crews sitting idle. Inorsa accelerates drafting; downstream construction timing is a derivative effect, not a direct lever.

### 4.2 The "scale without hiring" bridge (B-tier substrate primary)

Inorsa's "Scale without hiring" promise = scale DRAFTING output (not engineer hiring). The market pressure narrative SUPPORT can come from broader BEAD-workforce-shortage data, but the LEAD claim must be DRAFTER-specific:

- LEAD: "Indus CAD has 200+ employees + offshore team and is still doing manual GIS→CAD. The bottleneck isn't headcount — it's per-drafter throughput."
- BRIDGE (Tier C): "BEAD is pushing 4x normal investment into the industry but the workforce can only grow 15%/year (FBA CEO Gary Bolton)."
- INORSA LEVER: "Design throughput is the controllable variable — Inorsa scales it 2-5x with the team you already have."

### 4.3 The BEAD economics bridge (Tier A/B primary)

JTBD 3 (Make BEAD Economics Work) — Nick validated YES. The right framing per Nick: "Accelerated production accelerates revenue with cost reduction."

- LEAD (Tier A): "Profitability at BEAD-funded rates (20-30 cents/LF) requires predictable engineering cost per linear foot" (Nathan's B+T call recap).
- BRIDGE (Tier C): "88% of fiber operators expect cost increases in 2026 (Cartesian)." — STRIP construction-cost framing, KEEP cost-pressure context.
- INORSA LEVER: "Token-based pricing scales with linear feet, not headcount. The throughput gain covers the OPEX."

### 4.4 The kickback cascade bridge (Tier A primary)

This is the strongest narrative — fully Tier-A substrate.

- LEAD: Mike Rutski's verbatim email language: "Every permit return on an FTTX package means your team redesigns on your dime, not the client's."
- ANCHOR: "40-50% rejection on first pass. Kickback delays are months. Production delays are days." (Nick canon)
- INORSA LEVER: "If your drawings take a week, you rush QC. If they take 10 minutes, you QC properly."

### 4.5 The standardize bridge (Tier B/A primary)

- LEAD: Jackie at Dallas firm — "Multiple design vendors submit different drawing standards. Wants single platform to standardize." (Booth obs, B-tier)
- ANCHOR: Nathan Dunn email to Cyient: "GIS designs move fast, but converting them to construction-grade AutoCAD remains manual, slow, and different for each client's drawing standard." (A-tier)
- INORSA LEVER: "Generate AutoCAD output to each jurisdiction's standard from one input process."

---

## 5. Recommended data strategy (REVISED — supersedes my initial reaction)

### 5.1 What to do

1. **Build substrate-source TIERING into the substrate library.** New column on `sr_brain_substrate` (or `sr_company_evidence`): `inorsa_scope_tier` ∈ {A, B, C, D}. A = internal Inorsa-AE, B = direct prospect obs, C = industry-research aligned (with fiber-rescue rule from §2.4 v2), D = industry-research off-target / ambiguous-tower-or-fiber. This is a layer ABOVE F3 (which grades URL trust).

2. **Composer prefers Tier A/B for LEAD claim, allows Tier C for bridge/context, BANS Tier D.** Add a soft constraint to the composer prompt + a hard mechanical check at compose-time: "If headline claim source is Tier C or D, recompose with a Tier A/B lead." Tier D never appears in any email.

3. **Backfill the tier on existing 6,512 sr_brain_substrate rows + 1,536 sr_company_evidence rows.** Use Nick canon kill-list + this synthesis's Tier criteria as inputs. ~1-2 hr backfill script.

4. **NEW v2 — Backfill QA sampling gate (per judge panel R1 Gemini + GPT-5 dissent):** After auto-tier classification, **MANUAL spot-check 100 stratified rows** (25 per tier) before composer consumes the tiered substrate. If misclassification rate >10% on the sample → halt + refine classifier + re-run. If <10% → accept + flag the misclassified rows for re-tagging. ~30 min QA time.

5. **DO NOT add a blanket construction-claim kill-list to composer-constraints.ts** — this would over-block valid Tier C bridging language. The fix is upstream of compose.

6. **Test the E2E system (operator's mainline ask) on a small slice (1-3 prospects) BEFORE Sunday smoke** — ICP qualify → rich data → top 1% AE email → email lookup. Use the result to validate the data strategy in practice.

7. **NEW v2 — Persona-pattern weights are DEFAULT not GOSPEL (per all 4 judges N=17 small-N flag):** The `challenger_insight 75% for permit_cycle` data is N=17. Treat as starting point, not statistical truth. Re-evaluate after each P2 cohort wave for drift.

8. **NEW v2 — Narrative-utility judge dimension is Phase 2 trigger (per Gemini dissent):** If post-smoke replies underperform baseline (operator-defined threshold), add narrative-utility as 6th judge dimension. Until then, defer.

9. **NEW v2 — Tier C lead-by-exception for program_leverage × JTBD 7 (per Grok dissent):** External regulatory authority (e.g., H.R. 2289 shot-clock specifics) MAY outperform internal AE quotes when targeting program_leverage persona on Win-BEAD-Bid JTBD. Composer prompt: "permit Tier C lead claim IFF persona=program_leverage AND primary_jtbd=7."

### 5.2 What to NOT do

1. Don't rebuild the JTBD framework — it's Nick-validated.
2. Don't extend the kill-list on a 1-day, 1-reviewer, n=20 sample without judge panel ratification.
3. Don't add a "narrative utility" judge dimension YET — let the Tier A/B preference do the work first; add judge dimension if Tier-A leads are still falling flat empirically.
4. Don't audit P1 retroactively (already-sent, already-clicked emails) — focus energy on P2.
5. Don't restructure JTBD 2 — Nick validated it; the substrate WAS wrong-tagged, not the JTBD.

### 5.3 Email strategy that motivates connection (per highlevelae skill talk-track doctrine)

**Structure:** Name the failure → Describe friction → Explain Inorsa fix → Connect to outcome.

1. **LEAD with a real operational failure** — Tier A or B substrate. Mike's "Every permit return on an FTTX package means your team redesigns on your dime" or a direct booth observation.

2. **Friction:** quantify what the failure costs (40-50% rejection × 3-6 weeks per kickback × multiple simultaneous builds = X weeks of crew-idle + redesign).

3. **Inorsa fix:** ONE Inorsa sentence per email (per SoT §11). Use Variant A/B/C from §1. Don't promise %s, don't claim QC.

4. **Outcome connection:** Speed → time → quality. Or scale → capacity. Or BEAD-bid → revenue acceleration. Match to the prospect's primary JTBD.

5. **CTA:** Diagnostic question from `jtbd-matrix.md` per-JTBD "Best CTA" field. Never "worth 20 minutes" (Tim kill-list).

6. **Verify the email address** via Apollo + SMTP chain per CSV input contract §16.

**Persona-pattern preference (from past engagement data):**
- permit_cycle → challenger_insight (75% reply)
- build_pace → challenger_insight or social_proof
- capital_efficiency → loss_aversion (only place it works)
- drawings_quality → social_proof

---

## 6. What changes vs current state

### Current state (per code review + SoT)

- `composer-constraints.ts` has 22 AI-tells + 10 Tim-kill + 7 PRODUCT_GUARDS (incl. 5 BL-016 Nick) + 3 OFFSHORE_GUARDS + ungrounded-claim guards
- `jtbd-matrix.md` v1 has 7 Nick-validated JTBDs with internal-source primary substrate
- F1+F3 substrate gates active in production
- `inorsa-source-of-truth.md` v10 reflects F2 Nick alignment
- `sr_brain_substrate` has 6,512 rows tagged by F3 URL trust tier, NOT by Inorsa-scope tier

### Proposed delta (this strategy)

- **NEW:** `inorsa_scope_tier` column on substrate, backfilled
- **NEW:** Composer prompt change — "lead claim must be Tier A or B"
- **NEW:** Compose-time mechanical check — block Tier D, warn on Tier C lead
- **NEW:** E2E test plan (small-slice; 1-3 prospects) before any broad change
- **UNCHANGED:** JTBDs, composer-constraints.ts kill-lists, F1+F3 gates, judge dimensions
- **NOT YET:** Narrative utility judge dimension (defer, evaluate after Tier preference is in effect)

### Effort estimate

- Substrate tier column + backfill: ~2 hr
- Composer prompt + mechanical check: ~1 hr
- E2E test on 3 prospects: ~1 hr
- Documentation: ~30 min
- **Total: ~4-5 hr** (within Sunday smoke prep window)

---

## 7. Proposed evaluation rubric for cross-family judge panel

10 dimensions, scored 0-10 each, max 100. Threshold to ship: 80+ aggregate AND no dimension below 6.

| # | Dimension | What "10" looks like | What "0" looks like |
|---|---|---|---|
| 1 | **Boundary fidelity** — does this respect Nick's Construction-vs-Engineering boundary? | All recommendations stay within Inorsa's design-side scope; no construction-impact claims | Recommends content that crosses Nick's boundary |
| 2 | **Substrate tiering coherence** — is the 4-tier (A/B/C/D) scheme actually distinguishable? | Each tier has clear inclusion criteria + example + non-example | Tiers blur into each other; can't classify a new substrate row deterministically |
| 3 | **JTBD preservation** — does this maintain the 7 Nick-validated JTBDs without recasting? | No JTBD framework changes; only substrate tagging changes | Restructures or renames JTBDs |
| 4 | **Persona-pattern fidelity** — does this preserve documented engagement signal (challenger 75% for permit_cycle, etc.)? | Honors the empirical signal; doesn't override with a priori reasoning | Ignores documented engagement data |
| 5 | **Talk-track doctrine alignment** — does this follow Name-failure / Friction / Inorsa-fix / Outcome? | Strategy maps cleanly to the doctrine | Breaks the doctrine in subtle ways |
| 6 | **Bridging mechanism clarity** — is the path from market pain to Inorsa value explicit? | Each connection point is named + bridged + Inorsa-lever stated | Connection points are implicit or hand-wavy |
| 7 | **Risk of over-correction** — does this avoid throwing out valid Tier C bridging language? | Tier C is preserved as bridge/context; Tier D is the only ban | Bans too much Tier C content along with Tier D |
| 8 | **Empirical grounding** — is the strategy grounded in observed data (booth + Nick canon + engagement signals) vs theory? | All claims trace to canonical sources or empirical signal | Reasons from first principles without grounding |
| 9 | **Implementability** — can this be built in 4-5 hr and tested before Sunday smoke? | Discrete, scoped, has clear effort estimate + test plan | Sweeping, multi-week, no test plan |
| 10 | **Reversibility** — if this strategy is wrong, can it be rolled back without losing P2 send timing? | All changes are additive, taggable, revertable | Changes are destructive or block the smoke fire |

**Aggregate target: ≥80/100. Minimum any-dimension: 6/10. Adversarial dissent required from at least 2 of 4 judges.**

---

## 8. Proposed judge panel call

**Script:** `scripts/judge-panel-2026-06-13.mjs` (already wired with all 4 cross-family keys, used last sprint).

**Input artifact:** this document (`data-strategy-synthesis-2026-06-14.md`).

**Rubric:** §7 above (10 dimensions).

**Models:** Gemini 2.5 Pro + GPT-5 + Grok + DeepSeek (cross-family per stay-inside-ruflo + memory `feedback_cross_model_judging`).

**Expected output:** per-dimension scores from each judge + aggregate + dissent items (each judge MUST surface ≥1 specific dissent per memory `mentor-pm anti-sycophancy clause`).

**Decision protocol:**
- If aggregate ≥80 AND no dimension <6 across 3+ judges → operator decides ship
- If aggregate <80 OR any dimension <6 on ≥2 judges → iterate (max 3 rounds)
- If still <80 at round 3 → escalate to operator per `feedback_judge_iteration_cap`

**Estimated cost:** 4 cross-family API calls × ~$0.50 each = ~$2 total.

---

## 9. Open assumptions (for judge panel + operator to flag)

1. The 4-tier substrate model assumes Tier A/B "internal" substrate is INHERENTLY more relevant than Tier C/D research. This holds for headline claims. For bridging context, the boundary is fuzzier.

2. "Empirical engagement data" (challenger_insight 75% for permit_cycle) is from N=17 contacts on a single cohort. Statistical confidence is moderate. Don't treat as gospel.

3. Nick is one product expert at one point in time (2026-06-04 / 2026-06-14). Operator warned: things have evolved since the 6-week-old Nick docs. Current SoT v10 + Nick canon v3 reflect the latest known state. Material drift between 2026-06-04 and 2026-06-14 should be flagged.

4. The "narrative utility" judge dimension is deferred. If post-strategy ship the Tier A/B-led emails still don't move replies above baseline, consider adding it.

---

## 10. What this synthesis does NOT do

- Does not draft P2 emails (that's the next step after strategy ratified)
- Does not modify code (proposes changes; doesn't execute)
- Does not modify substrate library (proposes tagging; doesn't backfill)
- Does not change `jtbd-matrix.md` or `inorsa-source-of-truth.md` (canonical, operator-only update authority)
- Does not propose changes to F1+F3 (those are working as designed)
- Does not propose changes to JTBD numbering or framing (Nick-validated)
- Does not propose changes to PRODUCT_GUARDS in composer-constraints.ts (current state correct)

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 03:20 EDT | Claude (Opus 4.7) | Initial synthesis. Red-team of Nick-feedback interpretation. Market+product audit. 4-tier substrate model proposal. 10-dimension judge rubric. Pending judge panel + operator ratification. |
| v2 | 2026-06-14 04:05 EDT | Claude (Opus 4.7) | Judge panel R1 ratified SHIP at 98.6/100 with 5 substantive dissents — all incorporated: (1) Fiber-rescue rule added to §2.4 — claims with explicit fiber language eligible for Tier C even with adjacent tower context; (2) §4.1 "crew-idle" framing fixed to "extra drafting work" — was drifting into construction-impact territory per GPT-5; (3) Backfill QA sampling gate added to §5.1 step 4 — manual 25/tier spot-check before composer consumes; (4) Persona-pattern weights annotated as N=17 default not gospel per §5.1 step 7; (5) Narrative-utility judge dim documented as Phase 2 trigger per §5.1 step 8; (6) Bonus — Tier C lead-by-exception added for program_leverage × JTBD 7 per Grok dissent. Judge artifacts at judge-panel-data-strategy-round-1.md + sibling .json. Operator-authorized implementation 2026-06-14 04:00 EDT. |
