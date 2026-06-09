---
title: P2 Pilot — Operator-Vetted Alignment Document
status: ACTIVE
last_updated: 2026-06-09 02:30 EDT
version: v2.2
purpose: Single source of truth for the P2 pilot build. Codifies operator-stated scope, the architectural reframing from 2026-06-08, the post-critique amendments (synthesized from 4-angle adversarial workflow wf_45c688ad-620), and the C-portion scope cut. Drift from this without an explicit version bump = scope creep.
---

# P2 Pilot — Operator-Vetted Alignment Document (v2)

## Why this document exists

After ~12 hours of deep work on 2026-06-08, the project pivoted from "incremental judge-pass-rate optimization" to a system-level reframing led by the operator, then through an adversarial 4-angle critique, then through a scope-narrowing constraint (C-portion deferred). This v2 captures every decision so the next 2-3 weeks of build work has unambiguous direction.

If Claude proposes a path inconsistent with this doc, the operator should call it out. If the operator changes scope, this doc gets a version bump with the operator-named reason. **No drift in either direction.**

## The quality bar (operator-stated, 2026-06-08)

> "We have everything we need to generate an amazing cold prospecting campaign that's better performing than the top 0.01% of AEs."

This is the standard. Not "ship something defensible." Not "judge passes." **Better than top 0.01% of AEs.** Every architectural decision below traces back to this bar.

The substrate is the differentiator. Inorsa positioning (Chris's one-pager, value prop framing, sales playbook), Brain entities, Substrate (4,005+ industry files: podcasts, articles, NTIA, Cartesian, Dawson blog, Community Broadband Bits, Fiber for Breakfast), and 1st-party data on every prospect's region/segment/peer set — when fully aggregated this is more context than 0.01% of AEs ever have access to. The build's job is to make Claude USE all of it, not waste 99% of it the way the current pipeline does.

## Reframing — the 5 operator-defined challenges

Operator-stated, 2026-06-08, replacing my prior failure-mode catalog. **Verbatim, do not paraphrase.**

1. **ICP**: Is this prospect company an ICP, or do we have reason to believe they might be?
2. **Email confidence + sending order**: Can we find the contact's email to a degree of certainty we're comfortable assuming the risk? Alternatively, run the full list and send the highest-confidence first, work down the list (better for avoiding spam flags).
3. **Information verification tiers** (the load-bearing one): The info we source — objective, pains, gains, JTBD — can we verify it?
   - **Verified** → use directly, willing to stake reputation on it
   - **Likely** → use to shape the pitch but don't quote the exact claim
   - **Not confident** → don't use; find second-best, or third
   - **Nothing usable** → generalized statement inferred from similar companies
4. **Tone**: Professional human speaking to a peer they've just met. Pitch is about THEIR pain/gain/JTBD and how our product addresses one — so they connect to hear if it's a fit. Avoid AI tells. Don't force company-name personalization.
5. **Psychology / funnel**: Subject → email → microsite. Open → click → consider → connect. Best practices from consumer behavior/psychology research.

**Operator stance on ideal vs. pilot**: The 5 above are the ideal. The pilot bar is lower. Don't let perfect get in the way of done. For prospects we don't feel good about, either flag them and find solutions later, OR send a generalized email — we have generalized templates that are bulletproof. We have ~2,300 contacts and email warming throttles daily volume anyway, so substrate is not the constraint.

## The architectural inversion (operator-stated, 2026-06-08)

Original pipeline (current): linear. Email-find blocks composition. Operator reviews emails for prospects who may never receive them.

**New pipeline (operator-designed)**: two tracks, decoupled.

- **A — Composition track** (this spec, IN SCOPE): ICP → research → substrate-tiering → composition → judge → microsite → operator approval. Runs unattended. Parallel workers (20+). Output: composed package + ICP_fit + research_quality ranking.
- **B — Email-finder track** (sibling spec, separate build stream): two-path Apollo direct + multi-agent peer/web/MX inference. Runs as approved-content prospects accumulate.
- **C — Delivery track** (deferred, operator scope cut 2026-06-08): send queue with warming + circuit-breaker + bounce monitoring, HubSpot Sequence loader, post-send reporting. Not in current build scope; revisit after A+B+portal review surface is live.

This document and the substrate-tiering spec cover **A only, up to operator gate/portal**. Spec stops at "operator approves on portal." Everything downstream is C.

## Claude's responsibility for fact-quality (operator-stated)

Per operator: "Tim, nor I, nor any human can evaluate whether the substrate/facts/data that you are using to compose those emails is correct. We're relying on you to rationalize the truth."

This is the load-bearing responsibility for the build. The composition layer is already approved by Tim — that's not the issue. **The unsolved problem is upstream: substrate-tiering.** Claude decides:

- What's verified enough to assert
- What's likely enough to shape the pitch but not quote
- What's too uncertain to use at all
- When to fall back to generalized framing that is bulletproof

The composer never decides what's true. It dresses up whatever Claude hands it. Claude's job at the tiering layer is to hand it only claims worth defending.

## v2 amendment (2026-06-09 00:30 EDT) — Substrate-first / Apollo-as-fallback

Operator-driven pivot after end of 2-hour autonomy window. Apollo was load-bearing in the v2 spec because it was the only structured-fact source I had wired in. Operator pointed out — correctly — that we have a huge owned data asset (6,512-chunk substrate + Firecrawl scraping infrastructure) that's strictly cheaper and more authoritative than Apollo's crowdsourced data.

### What changed

**Primary structured-fact sources (revised priority order, 2026-06-09):**

1. **FCC BDC** (Broadband Data Collection) — **PROMOTED to #1 for fiber operators**. Authoritative regulatory filing. ~115M location records per snapshot, twice-yearly since 2022. Free, public. Gives us per-ISP location count (proxy for fiber miles via location density), geographic coverage, technology mix, and growth trajectory across snapshots. Replaces Apollo's `short_description` mining entirely.
2. **Substrate** (already paid for) — tagged by company mention enables company-specific queries. Best for industry context + speaker-attributed company quotes.
3. **Company website scrape** (Firecrawl, ~$0.01-0.03/prospect) — 1st-party authoritative for product info, leadership, press, named projects.
4. **LinkedIn / trade press** — authoritative external sources with speaker affiliation.
5. **Trade association deep dive** — board/committee bios, annual plans, blogs, meeting docs.
6. **Multi-year conference speaker bios** (people stay at companies 3-5 yrs; old bios still ~80% accurate).
7. **Apollo** — DEMOTED to fallback for email-find (where it's still good) + tie-breaker when 1-6 are silent. NO ongoing subscription dependency.

**Note on FCC BDC promotion (2026-06-09)**: Initially deferred to post-pilot. Operator pushback: dismissal was lazy not analytical. FCC BDC at ~3B accumulated records IS the RuVector use case, free, the most authoritative single dataset for US fiber operators, and replaces Apollo's biggest claim-to-fame. Added as Step 0.5 work (3 days: BDC download + RuVector setup + ingestion pipeline + substrate-query integration).

**Cost shift:** ~$60-90 ONE-TIME multi-source evidence-base build vs ongoing Apollo subscription. The build is in flight as Workflow `wei06huvu` (6 parallel agents).

**Substrate ranks higher than Apollo because:**
- Substrate quotes from CEOs about their own companies = direct evidence
- Apollo `short_description` is crowdsourced/scraped and often stale
- Substrate is already paid for; we just need to tag it

### Step 0 prerequisites — REVISED

Replaces v2 spec §7 prerequisites:

1. **Substrate company-tagging pass** (was: Apollo audit). Run Haiku extraction across 6,512 chunks tagging by company mention + speaker affiliation + topic. Cost ~$30-60. After this, substrate is queryable by company name. Workflow agent A is doing this.
2. **Multi-source enrichment build** (NEW). Agents B/C/D/E/F populate `sr_company_evidence` + `sr_company_contacts` with 1st-party data from websites, FCC BDC, trade press, multi-year conference bios, trade associations.
3. **Apollo demoted to fallback API** — wire it as a backstop in the email-finder + as a tie-breaker when substrate + websites are silent. Keep the existing apollo-fallback.ts integration; do NOT pay for a higher subscription tier.
4. **Calibration-first N** — still applies. Run orchestrator on 28 cold prospects, pick SPECIFIC_MODE_THRESHOLD from real distribution.

### New evidence-base data model

Three storage surfaces (designed by `evidence-tiering/substrate-query.ts`):

| Table | Purpose | Populated by |
|---|---|---|
| `sr_brain_substrate` (existing, extended) | 6,512 chunks + new metadata column (companies_mentioned, speaker_name, speaker_company, speaker_role, topics) | Agent A |
| `sr_company_evidence` (NEW) | Per-(company, claim) rows. Tagged by tier + source_kind | Agents B-F |
| `sr_company_contacts` (NEW) | Per-(person, company) rows. Optional email/linkedin | Agents E + F primarily |

The query API (`substrate-query.ts`) abstracts these three tables behind one interface that both generalized AND specific composers call.

### Implications for previous decisions

- **Brain Level 2 + Level 3 cut → STAYS cut.** Substrate tagging accomplishes most of what BL-003 wanted.
- **Substrate entity-tagging "post-pilot" → MOVED to Step 0.** The operator-corrected scope (900 companies, not 100) made this work too valuable to defer.
- **Apollo demotion in tier rules → still applies but lower stakes**, because Apollo is no longer load-bearing.
- **"Top 0.01% of AEs" quality bar** — substrate-first + 1st-party source ranking is the architectural piece that makes this achievable.

### Cost comparison (revised)

| Approach | Source | Cost |
|---|---|---|
| Original v2 | Apollo subscription as primary | ~$199/mo recurring |
| Revised | Substrate tag pass + Firecrawl scrapes | ~$60-90 ONE TIME |
| Ongoing | Substrate-query API (free) + occasional Firecrawl re-scrape (~$10/mo) | ~$10/mo recurring |

Annual: $2,388 vs $180 → saves ~$2,200/yr while delivering more authoritative data.

---

## Post-critique amendments — v2 design (locked 2026-06-08)

Adversarial critique workflow `wf_45c688ad-620` ran 4 angles in parallel (operator-alignment, technical-feasibility, consequence-of-being-wrong, simplicity-cut) and synthesized to `ship_with_amendments`. All amendments accepted on operator's standing authority ("make a decision and start building").

### Tier model — 2 tiers + 1 mode (was 4 tiers)

| Operator's word | Internal name | Composer usage |
|---|---|---|
| Verified | **USE_DIRECTLY** | May reference. Numeric claims framed as approximations ("north of 1,500 miles") unless cross-source confirmed within 12 months — closes the stale-Apollo failure mode. |
| Likely | **USE_TO_SHAPE** | Informs POV. NEVER quoted as fact. Frame implicitly ("for operators at this scale…"). |
| Not confident | (discarded) | No record kept. Orchestrator must trigger second-best gap-fill loop before declaring a category empty. |
| Nothing usable | `composer_mode='generalized'` | Not a tier — a composer mode switch. Industry/region/peer framing only. Zero company-specific factual claims. |

### Orchestrator — 3 phases (was 5)

1. **Phase 1 — Pull facts**: Apollo + existing Brain entity lookup in parallel.
2. **Phase 2 — Gap-fill research**: only what Phase 1 didn't cover; with second-best re-query loop per operator's tier-3 instruction.
3. **Phase 3 — Tier + emit dossier**: deterministic source-kind table only (no LLM tier-consolidator).

### Apollo demoted to USE_TO_SHAPE

Apollo data is crowdsourced/scraped, not authoritative. Apollo alone never gets USE_DIRECTLY. Apollo + concordance with a 2nd source dated <12 months → `apollo_cross` source kind → USE_DIRECTLY. Closes the wrong-but-confident-fact reputation risk the critique surfaced as the single point of failure.

### Generalized mode built FIRST (Day 1-2, not Step 6)

Every prospect has a defensible path immediately. Specific-mode is an upgrade for high-substrate prospects, not the default. This inverts the prior build order. Pulls from Inorsa SoT positioning + Brain peer patterns + Substrate industry framing. Zero forced company-name shoehorning.

### Sentence-level sources_used (was email-level)

Composer emits `bodySentences: Array<{text, claim_ids}>`. Portal renders click-sentence-see-source. Without this, BL-002 promise (operator clicks sentence → sees source) can't be delivered.

### Portal source-click view ships BEFORE specific-mode goes live

Per critique consequence-analysis amendment: Operator/Tim cannot catch tier errors at 90s/email review without the click-sentence-see-source view. Composer specific mode does not ship without 10-claim manual source-attribution audit passing zero misattributions.

### Cut from v1 spec

- Brain Level 2 (peer-pattern store) — defer post-pilot. Cold P2 has thin Brain anyway.
- Brain Level 3 (inference cache) — defer post-pilot. No invalidation policy designed; cache-poisoning risk.
- Substrate entity-tagging backfill of 4,005 files — defer post-pilot. Phase B works without it.
- Phase E LLM tier-consolidator — cut. Deterministic source-kind rules only.
- 4-tier taxonomy with WEAKLY_INFERRED as distinct tier — collapsed to discard.

### Step 0 prerequisites (must complete before tier rules ship)

1. **Pick canonical substrate store** — Supabase `sr_brain_substrate` OR AgentDB substrate namespace, not both. Currently dual-pathed.
2. **Re-verify Apollo `short_description` quality** on 5-10 of the 28 true-cold P2 prospects. If unreliable, USE_DIRECTLY tier is poisoned at root; build becomes generalized-only pilot.
3. **Calibration-first N**: run orchestrator on 28 true-cold prospects before picking N=3 threshold. Hard floor: if >70% would hit generalized mode at chosen N, ship generalized-only.

## Cuts from prior plans

- Phase 5 outcome-learning loop — defer (C-portion)
- Phase 3 evidence-first redesign as separate phase — wrong framing; the substrate-tiering layer IS the evidence-first work
- Tim calibration sub-loop — Tim already approves most emails; rely on portal review at small batch sizes
- Phase 5 measurement loop (#5 in operator's 5) — defer; numbers game works without it for the pilot
- **C portion**: send queue + HubSpot Sequence loader + bounce monitoring + warming + reporting (operator scope cut 2026-06-08 23:00 EDT)

## Keeps (still in scope)

- Engine-qa-test-plan as validation gate (Tests 1 + 2)
- Regression suite (5-frozen-prospect)
- Domain-sanity pre-check at portal review (catches Andrew-class issues before send queue)
- Pain-first composer prompt rewrite (light revision; Tim already approves base composer)
- Generalized-mode composer (now Day 1-2 priority per critique)

## Definition of "P2 Focus 100 portal-ready" (A+B scope, before C)

A composition+review surface we can trust at scale means ALL of:

1. ✓ **Composition pipeline parallel-capable** at 20+ concurrent workers
2. ✓ **Substrate-tiering layer functioning** — every claim carries USE_DIRECTLY/USE_TO_SHAPE + source citation + tierReason
3. ✓ **Generalized-fallback mode functioning** — composer produces defensible email when verified facts are thin; uses substrate + Inorsa positioning at top-0.01%-AE quality
4. ✓ **Email-finder two-path service** delivering Path A (~50-60% hit) + Path B (incremental ~25-30%)
5. ✓ **Operator portal** shows ranked composition output sortable by (ICP_fit × research_quality × email_confidence), with click-sentence-see-source attribution
6. ✓ **Source-attribution audit** — 10 random USE_DIRECTLY claims manually traced to source by operator; zero misattributions
7. ✓ **Domain-sanity pre-check** firing at portal review (Andrew-class detection)
8. ✓ **Engine-qa Test 1 + 2 pass** on a fresh 10-prospect cohort
9. ✓ **Operator timed-review test**: 10 emails in <15 min, zero rewrites
10. ✓ **Hidden trust points verified or explicitly accepted** (see §below)
11. ✓ **Top-0.01%-AE quality test**: 5 generalized + 5 specific emails reviewed by Tim; he cannot distinguish quality (only specificity)

C portion (delivery + reporting) is separate; ship-ready against the bar above does NOT include circuit-breaker, warming, bounce monitoring, or HubSpot Sequence load.

## What "ICP rank" means (used everywhere)

A computed ranking per prospect, used to prioritize portal review queue + email-finder queue + (eventually) C-portion send order. Composite score from:

- ICP volume verdict (fit > leaning_fit > miss)
- Research quality (high > medium > low — based on USE_DIRECTLY count)
- Persona fit (per pipeline `getPersonaFraming`)
- Substrate density (rich peer/regional context > thin)

Formal scoring rubric lives in the architecture spec.

## What "Email confidence" means (used everywhere)

Output of confidence-gate against email-finder result. Existing scale: green (90+) / yellow (50-89) / red (<50). Surfaces in:

- Email-finder Path A vs Path B routing (red after Path A → Path B; red after Path B → uncertainty pool)
- Operator portal (Email Deliverability section, surfaced 2026-06-08)
- (C portion) Send queue eligibility filter

## Open decisions — operator must answer

| # | Decision | Default if no answer | Confirmed |
|---|---|---|---|
| 1 | Where does claim-tier verification live? | Inside composition pipeline, post-research, pre-composer | ✓ confirmed |
| 2 | Generalized fallback emails — already written and where? | If not, draft 3-6 per persona × ICP segment using Inorsa positioning + Substrate | OPEN — need inventory |
| 3 | Email-finder priority — strict ICP order or batched? | Always work on highest available | ✓ confirmed |
| 4 | Per-paragraph properties for HubSpot — wire now or later? | LATER (C-portion) | ✓ deferred |
| 5 | Generalized-fallback trigger threshold N? | Calibrate during Step 0 on 28 prospects | OPEN — calibration first |
| 6 | **AE calendar URL master list** | Need operator | **OPEN — pop quiz #7 gap** |
| 7 | **Focus 100 ↔ FC attendee match step location** | Goes between CSV intake and pipeline kickoff | OPEN — needs build |
| 8 | **Focus 100 ICP labels alignment with SoT §15 two types** | Audit 100 rows before pipeline kickoff | OPEN |

## Hidden trust points to re-verify before ship

- **Apollo short_description**: Cross-check ≥3 with their own websites (Step 0 prerequisite)
- **Brain entities**: Phase 0 staleness audit (drop entities >30d old or tag with provenance)
- **Pitch variants** (2026-06-07): Re-ratify with operator
- **ICP volume floors** (250 mi / 500 drawings, SKO 2026): Re-ratify post-ACV-decoupling
- **Anti-AI-tell regex** (2025 research): Refresh with 2026 sources
- **ICP_CTA_OPTIONS per segment**: Last review unknown — operator re-ratify

## Backlog items folded into this build

Filed as deferrals but belong inside the substrate-tiering layer build:

- **BL-001**: Substrate dead code → fixed by unified evidence layer
- **BL-002**: Composer has no attribution/tracing → fixed by sentence-level sources_used + portal click-trace
- **BL-005**: Brain + Substrate disconnected → fixed by Phase 1 unified retrieval
- **BL-007**: Research confidence has no rubric → fixed by computed-from-source-kind rubric
- **BL-012**: Research + Substrate coordination → fixed by Phase 2 gap-fill orchestrator
- **BL-014**: Apollo enrichment → folded into Phase 1 (now Step 0 quality-audited)
- **BL-013**: Apollo company-name suffix strip → folded into Apollo client wrapper
- **BL-015**: Apollo peer-pattern derivation → folded into email-finder Path B (sibling spec, B-track)

Deferred (NOT in this build):
- **BL-003**: Brain as intelligence engine → post-pilot
- **BL-004**: Substrate entity tagging → post-pilot

## SoT Lock List — canonical document index (NEW v2)

To prevent drift, every fact this build references must come from one of these documents. If two docs disagree, the higher-rank one wins.

| Rank | Doc | Canonical for |
|---|---|---|
| 1 | `data/showrev/P2-PILOT-ALIGNMENT.md` (this doc) | Scope, decisions, ship-ready definition, open decisions, build amendments |
| 2 | `data/showrev/inorsa-source-of-truth.md` | Inorsa positioning, pitch variants, AE roster, P.S. variants, CSV input contract, ICP volume floors, deployment domains |
| 3 | `docs/specs/substrate-tiering-architecture-spec.md` | Technical implementation details for the substrate-tiering layer |
| 4 | `data/showrev/engine-methodology-canonical.md` | Composer prompt structure, mechanical checks, judge dimensions, HubSpot configuration |
| 5 | `data/showrev/industry-intelligence-kb.md` | BEAD/ReConnect state-by-state, fiber program timelines, market dynamics |
| 6 | `data/showrev/pipeline-backlog.md` | Backlog items + their status |
| 7 | Auto-memory files (`~/.claude/projects/.../memory/*.md`) | Operator-stated facts that haven't yet been promoted to a canonical doc |

**Drift rule**: if Claude sees an internal fact in code or comments that contradicts one of these docs, the doc wins. Code gets updated. If Claude sees one of these docs contradict another, higher rank wins. If the contradiction is unclear, ESCALATE to operator before building further.

**Update rule**: amendments to rank-1 or rank-2 docs require explicit operator approval and a version bump in the doc's frontmatter. Lower-rank docs can be amended by Claude with operator-notification in the next response.

## What this doc is NOT

- It is NOT the architecture spec. That doc enumerates code structure, schemas, sequence diagrams. Lives at `docs/specs/substrate-tiering-architecture-spec.md`.
- It is NOT the build plan. That's a separate doc once the spec is finalized.
- It is NOT the operator-test plan. That references `engine-qa-test-plan.md`.

This doc is the contract. Spec details what to build to honor the contract. Build plan sequences the work.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v2.2 | 2026-06-09 02:30 | Claude | FCC BDC promoted to #1 source for fiber operators. RuVector moved in-scope for the BDC's ~3B records. Apollo demoted further. Acknowledged that initial dismissal of FCC BDC was lazy not analytical (operator pushback caught it). New Step 0.5 (3 days work). |
| v2.1 | 2026-06-09 00:30 | Claude | Substrate-first pivot codified — Apollo demoted to fallback. 6-agent workflow `wei06huvu` launched. Cost model shifted: $199/mo recurring → ~$60-90 one-time + ~$10/mo Firecrawl. |
| v2 | 2026-06-08 22:55 | Claude | C-portion scope cut codified. Post-critique amendments (2 tiers + 1 mode, 3-phase orchestrator, Apollo→USE_TO_SHAPE, sentence-level sources_used, generalized mode built Day 1, cuts: Brain L2/L3, substrate backfill, Phase E LLM). Pop-quiz gaps added to open decisions. SoT Lock List section added. Top-0.01%-AE quality bar codified. |
| v1 | 2026-06-08 21:30 | Claude | Initial alignment doc captured from operator-driven reframing 2026-06-08. |
