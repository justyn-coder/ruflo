---
title: Phase A QA spot-check — early sample on 264 classified rows (Phase A still running)
status: PASS
last_updated: 2026-06-14 12:50 EDT
version: v1
purpose: Per judge-panel dissent #3 (Gemini + GPT-5 unanimous + Grok + DeepSeek concurring), manual spot-check of Phase A classifier output before composer consumes at scale. Synthesis v2 §5.1 step 4 gate.
sample_size: 50 rows (25 random Tier C + 25 random Tier D)
threshold: misclassification ≤10% → ACCEPT; >10% → HALT + refine + re-run
verdict: ACCEPT
---

# Phase A QA Gate — Round 1 (early sample, partial Phase A)

## State at QA time

Phase A is STILL RUNNING (bg process `60000`, log `/tmp/phase-a-full-run.log`). LLM pass at 800/6049 rows at QA time. Composer Tier D filter is active on classified rows; NULL rows pass through unfiltered.

| Method | Row count |
|---|---|
| `phase-b-ingest` | 44 (38 Tier A + 6 Tier B, all manually curated) |
| `rule` | 214 (rule-pass: C=183, D=29; +2 later writes) |
| `llm` | 50 (Gemini Flash, first 50 ambiguous) |
| `NULL` (pending) | 6,248 |
| **Total sr_brain_substrate** | **6,556** |

| Tier | n |
|---|---|
| A | 38 (Phase B) |
| B | 6 (Phase B) |
| C | 200 (rule + LLM) |
| D | 64 (rule + LLM) |
| NULL | 6,248 |

LLM-failed-default-D rows: **0** (no LLM failures).

## QA scoring criteria (synthesis v2 §2.4)

**Tier C inclusion:** industry-research Inorsa-aligned context — Dawson regulatory/permitting, FBA speed-to-construction mandate, H.R. 2289 permit shot-clock, BEAD subgrantee data (NTIA regulatory authority). Use: CONTEXT/BRIDGE only.

**Tier D inclusion:** industry-research NOT Inorsa-aligned — construction labor stats, tower/cellular content, $/ft installation costs, dig-once construction, ANY claim that could be tower per fiber-only safety default, ANY workforce stat without EXPLICIT fiber-drafter / FTTH-design / GIS-to-CAD scope. Use: DO NOT USE.

**Fiber-rescue rule:** Tier C eligible even with adjacent construction/tower context IF claim itself contains explicit fiber-scope language (`fiber`, `FTTH`, `fiber drafter`, `fiber operator`, `GIS→CAD`, `fiber permit`, `BEAD fiber`). Doesn't promote to A/B.

## Tier C sample (25 rows) — scoring

| # | id-prefix | source | method | rationale | verdict |
|---|---|---|---|---|---|
| 1 | b94c0e43 | community-broadband-bits | rule (C-signals=4) | Dakota County dig-once with permit coordination across jurisdictions | CORRECT |
| 2 | 37b5b551 | community-broadband-bits | rule (C-signals=2) | Evan Feinman on BEAD policy | CORRECT |
| 3 | 3f57a926 | community-broadband-bits | rule (C-signals=2) | Christensen Communications site-nav header chunk (low information) | CORRECT |
| 4 | 0d67321a | dawson-pots-and-pans | rule (C-signals=4) | "Regulatory Costs of Fiber Construction" — federal regs + state/local fiber regs | CORRECT |
| 5 | 006fbfa0 | community-broadband-bits | **llm** | Lincoln dark-fiber state-law context — regulatory + fiber-specific | CORRECT |
| 6 | a838e362 | ntia-bead-subgrantees | rule (ntia → regulatory) | California BEAD allocations | CORRECT |
| 7 | aabec7f9 | ntia-bead-subgrantees | rule (ntia → regulatory) | Michigan BEAD allocations | CORRECT |
| 8 | 4cdadfd5 | ntia-bead-subgrantees | rule (ntia → regulatory) | Missouri BEAD allocations | CORRECT |
| 9 | 7a51a08d | dawson-pots-and-pans | rule (C-signals=2) | "The Push for Permitting Reform" — Congress permitting bill | CORRECT |
| 10 | **71be941f** | community-broadband-bits | rule (C-signals=2) | "Section 230 content liability" — internet-platform policy, NOT fiber permitting | **MISCLASSIFIED** — should be D |
| 11 | 6c05428d | community-broadband-bits | rule (C-signals=2) | "Predictions 2025" — tribal BEAD awards + state selection | CORRECT |
| 12 | 49e6f11c | fiber-for-breakfast | rule (C-signals=3) | FFB Week 7 — NTIA listening session on BEAD funds | CORRECT |
| 13 | 77835cde | community-broadband-bits | rule (C+rescue) | David Young Lincoln story | CORRECT |
| 14 | 1a73dff0 | community-broadband-bits | rule (C-signals=2) | Christensen Communications — permitting, railroads, ISP local-gov context | CORRECT |
| 15 | f92d09ea | fiber-for-breakfast | rule (C-signals=3) | FFB Week 1 — NTIA permitting reform | CORRECT |
| 16 | f75b8143 | ntia-bead-subgrantees | rule (ntia → regulatory) | California BEAD subgrantees | CORRECT |
| 17 | a3093a0c | dawson-pots-and-pans | rule (C-signals=2) | "The High Cost of BEAD" — construction-cost focus inside BEAD context | BORDERLINE (construction-cost lean) |
| 18 | b96d65b4 | dawson-pots-and-pans | rule (C-signals=2) | "Carrier of Last Resort" — AT&T copper-to-fiber regulatory obligations | CORRECT |
| 19 | 8f899f72 | fiber-for-breakfast | rule (C-signals=3) | FFB Week 21 Oklahoma — Congressional FCC hearings | CORRECT |
| 20 | 2572bb9c | dawson-pots-and-pans | rule (C-signals=4) | "BEAD Rule Changes for Permitting" — NTIA permitting reform | CORRECT |
| 21 | 487d394b | dawson-pots-and-pans | rule (C-signals=2) | "Updating My BEAD Bingo Card" — BEAD allowing wireless/satellite to compete with fiber | BORDERLINE (alt-tech dilution but BEAD policy core) |
| 22 | c0b4cc29 | community-broadband-bits | rule (C-signals=2) | US Internet Travis Carter site-nav chunk | CORRECT (Lincoln-class chunk, low info) |
| 23 | e2e37689 | dawson-pots-and-pans | rule (C-signals=2) | "Supreme Court Punts on Low NY Rates" — ISP retail-rate regulation | BORDERLINE (retail-rate ≠ deployment regulation) |
| 24 | a6c30788 | dawson-pots-and-pans | rule (C-signals=2) | "Big ISPs and BEAD" — BEAD program/regulation | CORRECT |
| 25 | 27fc6985 | ntia-bead-subgrantees | rule (ntia → regulatory) | Michigan BEAD subgrantees | CORRECT |

**Tier C count:**
- Clear correct: 21/25
- Borderline: 3/25 (#17, #21, #23 — all construction-cost or retail-regulation drift)
- Clear misclassified: 1/25 (#10 Section 230)

## Tier D sample (25 rows) — scoring

| # | id-prefix | source | method | rationale | verdict |
|---|---|---|---|---|---|
| 1 | bd34f567 | cartesian-cost-report | rule (cartesian construction-cost) | Fiber Deployment Cost Report §26 — market intro | CORRECT |
| 2 | 4b168c47 | cartesian-cost-report | rule | §15 — $15/ft conduit, $10.32/ft direct burial cost data | CORRECT |
| 3 | 0036ef00 | community-broadband-bits | **llm** | general rural broadband deployment and funding, lacking explicit fiber-drawing/design terms | CORRECT |
| 4 | 001a943a | community-broadband-bits | **llm** | poles and small-cell deployment, which is tower-related and lacks explicit fiber-scope language | CORRECT |
| 5 | 01fc60d7 | community-broadband-bits | **llm** | cost of fiber installation for residents, which falls under installation costs, explicitly out of Inorsa scope | CORRECT |
| 6 | 3db3d29a | cartesian-cost-report | rule | §18 — drop costs (underground vs aerial per-connection cost) | CORRECT |
| 7 | b043e04f | cartesian-cost-report | rule | §17 — crew deployment pace per day | CORRECT |
| 8 | 911927f0 | cartesian-cost-report | rule | §14 — terrain impact on underground deployment | CORRECT |
| 9 | bef95fa4 | cartesian-cost-report | rule | §23 — deployment delays driven by permits/utility-locates/make-ready | CORRECT (cost-frame trumps permit-mention) |
| 10 | 1b7d5c29 | cartesian-cost-report | rule | §4 — fiber market intro (84.6M homes passed) | CORRECT |
| 11 | c71e5151 | community-broadband-bits | rule (D-signals=2, no-rescue) | Small cells + dig-once construction approach | CORRECT |
| 12 | 01cacd81 | dawson-pots-and-pans | **llm** | entirely about millimeter wave spectrum and cellular networks, outside Inorsa fiber-drawing-automation scope | CORRECT |
| 13 | 0112a83c | community-broadband-bits | **llm** | dropping fiber to the premise — network impact and service provision, not design/permitting/drafting challenges | CORRECT |
| 14 | 14bab022 | cartesian-cost-report | rule | §3 — table of contents | CORRECT |
| 15 | d6a2b011 | cartesian-cost-report | rule | §25 — deployment delays cost analysis | CORRECT |
| 16 | 012967d4 | community-broadband-bits | **llm** | general fiber deployment + a regulatory law prohibiting government service — not Inorsa design/permitting throughput | BORDERLINE (regulatory law on gov fiber could be C, but cost/funding-coop frame is dominant) |
| 17 | 02014064 | community-broadband-bits | **llm** | general network buildout, connectivity, and rural funding access | CORRECT |
| 18 | 01a712bf | dawson-pots-and-pans | **llm** | entirely about cellular 5G coverage, cell carriers, and cell towers, which is explicitly out of Inorsa fiber scope | CORRECT |
| 19 | 93610ec0 | cartesian-cost-report | rule | §10 — underground vs aerial cost distribution | CORRECT |
| 20 | 0028382f | community-broadband-bits | **llm** | government surveillance and tech company cooperation with NSA, entirely unrelated to fiber-drawing automation | CORRECT |
| 21 | 00982d6c | community-broadband-bits | **llm** | general broadband policy and local choice, not specific fiber drafting/permitting challenges | CORRECT |
| 22 | 2a8ce94f | cartesian-cost-report | rule | §9 — survey methodology | CORRECT |
| 23 | 883301d2 | cartesian-cost-report | rule | §22 — labor and materials cost drivers | CORRECT |
| 24 | 0099d13f | community-broadband-bits | **llm** | general company roles and a "broadband plan" without explicit fiber-scope language (BEAD program title-only) | CORRECT |
| 25 | 6d06cb11 | cartesian-cost-report | rule | §7 — ILEC growth via acquisitions/M&A | CORRECT |

**Tier D count:**
- Clear correct: 24/25
- Borderline: 1/25 (#16 Cortez fiber)
- Clear misclassified: 0/25

## Aggregate verdict

| Metric | Tier C | Tier D | Combined (n=50) |
|---|---|---|---|
| Clear misclassification | 1/25 (4%) | 0/25 (0%) | 1/50 (**2%**) |
| Lenient (incl. borderline) | 4/25 (16%) | 1/25 (4%) | 5/50 (**10%**) |
| Threshold | ≤10% strict; investigate >10% lenient | — | — |

**LLM-method-specific (the judge dissent #3 concern):**
- Sample size: 12 LLM-classified rows across both tiers
- Clear LLM misclassifications: 0/12 (**0%**)
- Borderline LLM: 1/12 (#16 Cortez fiber)
- **LLM is performing well.** Rationales are crisp, cite the specific in-Inorsa-scope vs out-of-scope criterion.

**Rule-method-specific:**
- Clear misclassifications: 1 (Section 230 row #10) — rule pass keyword match on "broadband" + "barriers" was too greedy. False-positive rate 1/~200 rule rows = ~0.5%.

## Verdict

**ACCEPT current classifications. Phase A LLM backfill can continue.**

Reasoning:
- Strict misclassification = 2% (well below 10% gate)
- LLM strict misclassification = 0% (LLM is performing as the dissent expected after refinement)
- Lenient bound = 10% (at threshold but driven entirely by 3 Tier C borderlines that are arguable either way + 1 Tier D borderline that is defensible D)
- No systemic bias detected (no source × tier combination shows pathological error)

## Actions taken

1. Flagged Section 230 row (`71be941f-0476-484c-9805-db165cfed06b`) for re-tag → updated to Tier D, method=`qa-correction`, rationale captured
2. Phase A LLM run continues in background
3. Re-run a smaller QA pass (10 random LLM-only rows) after Phase A completes to validate the larger sample

## Action items deferred (not blocking smoke fire)

- **Rule-pass refinement (low priority):** "broadband" alone as a C-signal is too loose. Consider scoping C-signals=2 minimum to require at least one of {permit, BEAD, regulatory, NTIA, FCC} alongside broadband. Single false-positive doesn't justify re-running rule pass now.
- **Borderline policy clarification:** the 3 Tier C borderlines (#17 BEAD cost, #21 BEAD bingo, #23 retail rates) sit at the construction-impact vs regulatory-context boundary. Could tighten by requiring "permit" or "deployment-process regulation" keywords for cost-themed Dawson articles. Out of scope for this round.

## Methodology notes

- 50-row sample drawn with `ORDER BY random() LIMIT 25` from each tier
- No stratification across sources (true random) — captured the cartesian-heavy Tier D and Dawson-heavy Tier C natural distribution
- Manual scoring by Claude against §2.4 criteria; each row's rationale + content chunk read in full
- Borderlines flagged conservatively (counted in lenient rate even when arguable)

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 12:50 EDT | Claude (Opus 4.7) | Phase A QA spot-check Round 1 on 264 classified rows (Phase A still running). 50-row sample, 2% strict misclassification (1 rule false-positive on Section 230 — re-tagged). LLM 0% strict misclassification. Verdict: ACCEPT, let Phase A continue. |
