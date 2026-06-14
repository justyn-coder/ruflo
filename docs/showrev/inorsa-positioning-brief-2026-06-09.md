---
title: Inorsa Positioning Brief — What Inorsa Says About Itself
status: ACTIVE
last_updated: 2026-06-09
version: v1
purpose: Operator-facing synthesis of Inorsa's self-described positioning, value prop, pains/gains/JTBD as captured in ruflo canon as of 2026-06-09. Every claim cited file:line. Will be cross-referenced against sr_company_evidence by a Phase 3 agent.
scope_caveat: Drawn STRICTLY from files inside /Users/justynszymczyk/Documents/GitHub/ruflo. The referenced canonical SoT cites "wiki-459-mirror" (showrev repo) as the source of show facts; that file was NOT read for this brief.
---

# Inorsa Positioning Brief — 2026-06-09

**Convention** — `ATTRIBUTED-TO-INORSA` = verbatim from Inorsa's marketing, sales team, or named Inorsa staff (Chris Balandran, Nick McManus, Tom Marciano, the AEs). `DERIVED` = ShowRev/operator interpretation. `[single-source]` = only one citation found.

---

## 1. Product / What Inorsa Does

### Tagline (ATTRIBUTED-TO-INORSA, from inorsa.com/product)
> "The AI Operations Layer for Infrastructure Assets" — `data/showrev/inorsa-source-of-truth.md:58` (v5, 2026-06-07)

### Three suites (ATTRIBUTED-TO-INORSA, from inorsa.com/product)
- **Data Suite** — "Transforms structured, semi-structured, and unstructured document data into maintained, asset-level intelligence" — `inorsa-source-of-truth.md:64`
- **Validation Suite** — "Applies rules and reconciliation logic across documents to detect conflicts, missing inputs, inconsistencies" — `inorsa-source-of-truth.md:65`
- **Engineering Suite** — "Generates engineering-grade outputs from validated data with review controls" — `inorsa-source-of-truth.md:66`

### Three-phase workflow (ATTRIBUTED-TO-INORSA)
1. "Ingest & Structure" — `inorsa-source-of-truth.md:69`
2. "Validate & Reconcile" — `inorsa-source-of-truth.md:70`
3. "Generate Outputs" — `inorsa-source-of-truth.md:71`

### Nora AI Assistant (ATTRIBUTED-TO-INORSA) [single-source]
> "Nora — conversational interface across all suites. Augments human judgment through natural language interaction." — `inorsa-source-of-truth.md:73`

### Product GA status (auto-memory, SKO 2026 reference)
| Product | Status |
|---|---|
| Data Suite (Data Room) | GA — `~/.claude/.../memory/reference_inorsa_icp_qualification_guardrails.md:22` |
| Validation Suite | GA — same:23 |
| Structural Analysis (SA), tower-side | GA — same:24 |
| Mount Analysis (MA), tower-side | "Coming April 2026" — same:25 |
| Fiber Drawings | "GA. One customer, brand new, most configurable drawing built to date" — same:26 |
| Drawing QC | "NOT on roadmap. Pure R&D. Do NOT mention to customers (Zane explicit)" — same:27 |

### Fiber Drawings mechanism (ATTRIBUTED-TO-INORSA, auto-memory)
> "GIS files (KML, KMZ, GeoJSON, shapefiles) → CAD file (DWG). One-to-one transfer." — `memory/reference_inorsa_fiber_drawings_product.md:11`
> Differentiator: "Reads individual metadata per point/line. Places specific blocks (Toby boxes, handholes, bore pits)... Page splitting... Smart callouts (LLM-generated from metadata)." — same:14

### What Inorsa EXPLICITLY DOES NOT do (ATTRIBUTED-TO-INORSA via Nick McManus 2026-06-03, "NEVER claim")
- Does NOT validate inputs or catch errors in the GIS data — errors in GIS = errors in output — `inorsa-source-of-truth.md:143`
- Does NOT reduce permit return rates directly — same:144
- Does NOT guarantee a specific automation percentage without file review — same:145
- NOT a GIS replacement — same:146
- NOT a visualization tool — same:147 (the "Nvidia confusion from the booth")
- NOT a construction management platform (SiteTracker's job) — same:148
- NOT structural analysis for towers (RISA/TNX via Harmoni, tower-side only) — same:149
- Does NOT support conflict avoidance today — same:150
- **Drawing QC NOT on roadmap** — Zane explicit: "I do not wanna mention this to a customer at all until we can prove it out." — `memory/reference_inorsa_fiber_drawings_product.md:32`
- MicroStation customers — "Do NOT sell to MicroStation customers. Files don't convert. Customer churned." — `memory/reference_inorsa_sales_playbook.md:64`

---

## 2. Target Market / ICP

### Fiber operator ICP (ATTRIBUTED-TO-INORSA, SKO 2026)
- "Volume: 250 miles/year (~1.3M linear feet), ~3M feet over 5 years" — `memory/reference_inorsa_sales_playbook.md:42`
- Sophistication check: "What does your current GIS→CAD pipeline look like? If 50-60%+ automated → value prop declines" — same:43
- "Best targets: less sophisticated companies where this is 'magic'" — same:44

### A&E firm ICP (ATTRIBUTED-TO-INORSA, SKO 2026)
- "Volume: 500+ combined drawings/analysis per year (updated from 250 at SKO)" — `memory/reference_inorsa_sales_playbook.md:34`
- "Revenue: $100K+ per customer, ideally $500K+" — same:35
- "Drawing qualification: 1,000+/year overall OR 500+ on 1-2 templates" — same:36

### Volume floors as canonized in SoT
| ICP type | Volume floor |
|---|---|
| Fiber operator | "≥250 miles/year (~1.3M linear feet) of active fiber build" — `inorsa-source-of-truth.md:351` |
| A&E firm | "≥500 combined drawings/analyses per year" — `inorsa-source-of-truth.md:352` |

### Disqualifiers (ATTRIBUTED-TO-INORSA, auto-memory)
- "Automation disqualifier: If >50-60% GIS-to-CAD automated, value prop declines" — `memory/reference_inorsa_icp_qualification_guardrails.md:16`
- "TEP (Tower Engineering Professionals) — too sophisticated... Not a fit." — `memory/reference_inorsa_fiber_drawings_product.md:26`
- "Minimum ACV: $100K target, ideally $500K+" — `memory/reference_inorsa_icp_qualification_guardrails.md:12`
- "Urgency: <=12 months (else nurture)" — same:13
- MicroStation stack — `memory/reference_inorsa_sales_playbook.md:64`

### ICP disagreement [single-source vs canonical]
SKO 2026 playbook lists a hard $100K ACV floor and ≤12mo urgency (`memory/reference_inorsa_icp_qualification_guardrails.md:12-13`). The canonical SoT §15 (v7, 2026-06-08) explicitly **rejects** both for the outreach gate: "Ignored at this stage: ACV minimum, urgency, automation level, decision-maker seniority" — `inorsa-source-of-truth.md:354`. **The SoT supersedes** ("inform-only label, not a gate" — same:343). The SKO criteria likely apply at a later sales stage. DERIVED.

---

## 3. Value Proposition

### Top-line pitch — three Nick-validated variants (ATTRIBUTED-TO-INORSA, 2026-06-07)
- **Variant A (ops_builder default):** "We convert your GIS and LLD data into construction and permit drawings in minutes, so your team takes on more work without adding headcount." — `inorsa-source-of-truth.md:14`
- **Variant B (technical_designer):** "...Deterministic output, full traceability back to source." — same:17
- **Variant C (revenue_leader):** "...so projects get to construction faster without adding headcount." — same:20

> "The mechanism ('GIS and LLD data → drawings in minutes') is the differentiator — keep it in every variant." — `inorsa-source-of-truth.md:22`

### Chris Balandran one-pager (ATTRIBUTED-TO-INORSA, 2026-05-19)
- **Headline:** "10X Your Engineering" — `inorsa-source-of-truth.md:30`
- **Subhead:** "Your fiber builds are scaling. Your engineering workflows aren't." — same:31
- **Trust line (verbatim):** "Every output is deterministic and traceable back to source data. No AI guesswork. No black box." — same:52

### Real value prop, Nick McManus framing (ATTRIBUTED-TO-INORSA, 2026-06-03)
1. "Revenue Acceleration — do the work faster, get paid sooner" — `inorsa-source-of-truth.md:153`
2. "Revenue Generation — accept more work without adding headcount" — same:154
3. "Opportunity — your team isn't stuck on this work, can do other things" — same:155
4. "Mistake proofing — ONLY where a key input is missing (not general QA)" — same:156

### Operator-ratified vs proposed
- **Ratified by Nick (2026-06-03):** Three pitch variants, speed-not-validation framing, 40-50% permit rejection rate, ICP volume floors — `inorsa-source-of-truth.md:22, 142-156, 164-165`
- **Ratified by Chris (week of 2026-05-19):** "10X Your Engineering" one-pager language, trust line, "Ingest + Generate" 2-step framing for first touch — `inorsa-source-of-truth.md:28-52, 75`
- **Retired:** "permit-ready" and "Quality control is built in" — `inorsa-source-of-truth.md:24` (per Nick corrections)
- **Pending Chris approval:** "56 hours reduced to under 3 minutes" proof point — `data/showrev/product-intelligence-brief.md:32` (may be NDA'd)

---

## 4. Pains / Gains / JTBD (per the client)

Seven JTBDs synthesized from Inorsa sales threads, Chris one-pager, Nick discussions, and 6,512-chunk industry substrate — `data/showrev/jtbd-matrix.md:7,277`. Job 1 was explicitly revised per Nick McManus 2026-06-03.

### Pains Inorsa says customers experience

**Permit kickback cascade (Nick-confirmed 2026-06-03):**
> "Kickback cascade is the biggest problem in the industry. Cycle time production delays are days. Kickback delays are months." — `jtbd-matrix.md:20`
> "40-50% of permit submissions rejected on first pass (NOT 8-12% as previously cited)" — `inorsa-source-of-truth.md:164`

**Scale ceiling (Chris one-pager):**
> "Engineers spend hours manually producing drawings from LLD and GIS inputs. Change requests stack up. Manual coordination that worked at 50 miles breaks at 250." — `inorsa-source-of-truth.md:35`
> "Outsourcing adds handoffs, increases risk... Hiring adds headcount without fixing the underlying problem." — same:35

**Multi-jurisdiction reformatting (Nathan Dunn → Cyient):**
> "GIS designs move fast, but converting them to construction-grade AutoCAD remains manual, slow, and different for each client's drawing standard" — `data/showrev/product-intelligence-brief.md:49`

**Crew idle time (Lucas Spencer → Ohio Gig):**
> "The bottleneck is not crews or equipment. It is whether CAD-ready drawings stay ahead of the construction schedule." — `jtbd-matrix.md:139`

**BEAD margin pressure (real customer objection):**
> "Our CEO/CFO have come to the unfortunate conclusion that the cost is too high and will have a direct impact on EBITDA since we can't capitalize any of it" — `jtbd-matrix.md:81`

### Gains Inorsa promises
- "Faster drawing turnaround across markets and teams" — `inorsa-source-of-truth.md:44`
- "Consistent documentation regardless of build volume" — same:45
- "Higher throughput without proportional increases in staff" — same:46
- "Fewer Build Delays — Reduced time lost to late stage permitting and rework" — same:85 (inorsa.com/solutions/fiber)
- "More Predictable Execution" — same:86
- "Scalable Programs — Ability to expand build footprints without proportional increases in manual effort" — same:87
- "Scales drafting capacity 2-5x with existing headcount (cite as range, not guarantee)" — same:137
- "~10 min source data to preliminary drawing" — `jtbd-matrix.md:32`
- "70% reduction in construction drawing cycle time (approved)" — same:32

### Jobs-to-be-done (canonical 7, source: `data/showrev/jtbd-matrix.md`)
1. Break the Permit Bottleneck (revised per Nick 2026-06-03) — lines 16-40
2. Scale Without Hiring — 42-70
3. Make BEAD Economics Work (predictable per-LF at 20-30¢/LF) — 72-99
4. Standardize Across Markets — 101-128
5. Keep Crews Moving — 130-156
6. Deliver Faster, Protect the Relationship (revised per Nick 2026-06-03) — 158-183
7. Win the BEAD Bid — 185-211

### Nick correction on JTBD 1 mechanism
Originally "Inorsa catches input errors before submission" — `nick-mcmanus-jtbd-review.md:41`. Revised: "SPEED, not validation. We won't catch the errors, but now they have more time to" — `jtbd-matrix.md:30`

---

## 5. Recent Client Updates (since 2026-06-02)

34 files modified in last 7 days. Full manifest: `docs/showrev/inorsa-recent-uploads-manifest-2026-06-09.md`.

**Significant deltas:**
- **2026-06-03** — `nick-mcmanus-jtbd-review.md` sent; review drove Job 1 + Job 6 rewrites
- **2026-06-03** — `jtbd-matrix.md` synthesized 7 JTBDs from sales threads + booth + 6,512-chunk substrate
- **2026-06-03** — `persona-profiles-from-substrate.md` role-by-scale personas from podcast transcripts
- **2026-06-04** — `curated-substrate-quotes.md` 20 hand-picked quotes (Cartesian, Dawson, FBA, MercuryZ, Wireless Estimator) awaiting Nick novel/common-knowledge marking
- **2026-06-04** — Chris Balandran shared brand manual (purple #AD63C0, navy #081E3F, Utily Black + Poppins) — `memory/reference_inorsa_brand_manual.md:13-22`
- **2026-06-04** — Chris feedback: "Steps 1-3 of the brief: green light. Step 4 (insights review): go to Nick" + "Experience 2 (schematic): 'very cool but doesn't look like our product or brand, could be misleading'" — same:38-43
- **2026-06-05** — Five SKO 2026 reference memories created (sales playbook, ICP guardrails, fiber drawings product, account recap, brand manual)
- **2026-06-07** — SoT v5: three rotatable pitch variants replacing single locked pitch — `inorsa-source-of-truth.md:466`
- **2026-06-08** — SoT v6-v9: P.S. variant matrix, CSV input contract (no email/website), ICP volume floors as inform-only label, AE territory canonical, SoT lock index — same:461-465

---

## 6. Open positioning questions / known uncertainty

### Asked of Nick — answered in corpus [single-source]
- Permit rejection rate "8-12%"? → 40-50% (`inorsa-source-of-truth.md:164`)
- Utility GIS layer ingestion for conflict avoidance? → not yet, future (`:150`)
- CAPEX professional-services structuring standard? → no, deal-specific (`product-intelligence-brief.md:68`)

### Asked of Chris, status open [single-source]
- "Can we use '56 hours to 3 minutes'?" — `data/showrev/product-intelligence-brief.md:37, 114` — listed PENDING in proof-points table
- "Can Inorsa produce a sample output from a prospect's GIS data?" — `data/showrev/chris-balandran-comprehensive-brief.md:50` and `product-intelligence-brief.md:115`
- "Customer testimonials: Any quotes approved for use?" — `product-intelligence-brief.md:116`
- "Nora AI assistant: How does it fit in the fiber story? Currently not mentioned in outreach." — `product-intelligence-brief.md:118`
- "Multi-client spec standardization: Is this a real capability or aspiration?" — `product-intelligence-brief.md:119`
- "Marketing Hub tier TBD — confirm Starter/Pro/Enterprise" — `inorsa-source-of-truth.md:178`

### Operator-flagged for further clarification
- JTBD 6 (A&E client relationship) — substrate has 0 quotes — `curated-substrate-quotes.md:190`
- Contractor voice — "Thinnest persona data" — `persona-profiles-from-substrate.md:131`
- Finance persona — "Not in our current persona buckets" — `persona-profiles-from-substrate.md:76`
- 20 curated industry quotes still need Nick's novel/common-knowledge marking — `curated-substrate-quotes.md:11`

### Data scope caveat
SoT cites `wiki-459-mirror` for show facts (`inorsa-source-of-truth.md:208`); that file lives in showrev repo, NOT read here. SoT §10 restates: Fiber Connect, May 18-19 2026, Gaylord Palms Kissimmee FL, booth 1728.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Initial brief. Drawn from `data/showrev/inorsa-source-of-truth.md` v9, `data/showrev/jtbd-matrix.md` v1, `data/showrev/persona-profiles-from-substrate.md` v1, `data/showrev/curated-substrate-quotes.md` v1, `data/showrev/product-intelligence-brief.md` v1, `data/showrev/nick-mcmanus-jtbd-review.md`, `data/showrev/chris-balandran-comprehensive-brief.md`, `data/showrev/abm-ceo-brief.md`, and 5 ruflo auto-memory files (`reference_inorsa_*.md`). |
