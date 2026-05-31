---
title: Inorsa Source of Truth -- ShowRev FC2026 Pilot
status: ACTIVE
last_updated: 2026-05-29 10:31 EST
version: v1
purpose: Single canonical reference for all Inorsa product claims, positioning, and constraints used in ShowRev outreach. Every email, microsite, HubSpot property, and AE brief must be checked against this file before shipping.
---

# Inorsa Source of Truth

## 1. Pitch Verbatim (decisions.log #026, locked)

> "We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving."

**Rules:** Do NOT paraphrase in prospect-facing copy. Use this exact sentence or a structural variation that preserves the meaning. Do not expand scope beyond what this sentence claims.

---

## 2. Chris's One-Pager (Marketing Manager, week of 2026-05-19)

**Headline:** 10X Your Engineering
**Subhead:** Your fiber builds are scaling. Your engineering workflows aren't.
**Descriptor:** Inorsa generates construction and permit drawings from GIS and LLD inputs, so your team spends less time on manual production and more time executing builds.

**The Problem:**
Fiber deployment teams are under pressure to build faster with leaner teams and tighter margins. But the workflows powering these projects were never built for scale. Engineers spend hours manually producing drawings from LLD and GIS inputs. Change requests stack up. Manual coordination that worked at 50 miles breaks at 250. And while demand for fiber networks continues to rise, most teams are still buried in repetitive production work that drains resources and delays revenue. Outsourcing adds handoffs, increases risk, and leaves teams with less control over quality and timing. Hiring adds headcount without fixing the underlying problem. The status quo just can't keep up.

**The Inorsa Solution:**
Inorsa automates the generation of construction and permit drawings directly from your GIS and LLD inputs, so your team produces consistent, accurate deliverables at any build volume without the manual production overhead.

- **Ingest:** Inorsa structures GIS and LLD inputs into asset-level data. No manual extraction. No version confusion.
- **Generate:** Inorsa produces construction and permit drawings ready for engineer review and submission, directly from your structured data, with full traceability back to source documents.

**Outcomes:**
- Faster drawing turnaround across markets and teams
- Consistent documentation regardless of build volume
- Higher throughput without proportional increases in staff

**Why Inorsa:**
Inorsa is purpose-built for telecom infrastructure. Every output is deterministic and traceable back to source data, no AI guesswork, no black box. Your team gets construction and permit drawings with the documentation to back them up. We reshape how teams work by automating the ingestion and generation of infrastructure data, so fiber activations happen in days, not months.

**Trust line (use verbatim when needed):**
"Every output is deterministic and traceable back to source data. No AI guesswork. No black box."

---

## 3. Product Architecture (from inorsa.com/product)

**Tagline:** "The AI Operations Layer for Infrastructure Assets"

**Three Suites:**

| Suite | What it does | Fiber relevance |
|-------|-------------|-----------------|
| **Data Suite** | Transforms structured, semi-structured, and unstructured document data into maintained, asset-level intelligence | HIGH -- ingests GIS, LLD, leases, RFDs, permits, drawings |
| **Validation Suite** | Applies rules and reconciliation logic across documents to detect conflicts, missing inputs, inconsistencies | HIGH -- catches errors before permit submission |
| **Engineering Suite** | Generates engineering-grade outputs from validated data with review controls | HIGH -- produces construction and permit drawings |

**Workflow (3 phases):**
1. **Ingest & Structure** -- Extracts critical fields from leases, RFDs, permits, and drawings into structured asset-level intelligence
2. **Validate & Reconcile** -- Cross-checks sources to detect conflicts, missing inputs, and inconsistencies
3. **Generate Outputs** -- Creates engineering and operational deliverables with source data traceability

**AI Assistant:** Nora -- conversational interface across all suites. Augments human judgment through natural language interaction.

**NOTE:** For T1 outreach and initial microsites, use Chris's simpler 2-step framing (Ingest + Generate), not the full 3-suite architecture. Prospects don't need product architecture on first touch. Save suite-level detail for T2/demo conversations.

---

## 4. Fiber Solution Positioning (from inorsa.com/solutions/fiber)

**Hero:** "Execute Fiber Builds With Fewer Delays and Less Rework"
**Sub:** "Inorsa helps fiber operators keep build programs on track by reducing manual QA, improving consistency across planning and permitting inputs, and supporting predictable execution across large build programs."

**Three benefits as stated on site:**
1. Fewer Build Delays -- Reduced time lost to late stage permitting and rework
2. More Predictable Execution -- Improved consistency across engineering, permitting, and construction teams
3. Scalable Programs -- Ability to expand build footprints without proportional increases in manual effort

**Problem statement (from site):**
"Fiber operators navigate aggressive build schedules, complex permitting requirements, and coordination across linear assets spanning large geographic footprints."

**NOTE:** This site copy is softer/more generic than Chris's one-pager. For outreach, prefer Chris's language. For alignment with what prospects might see if they visit inorsa.com, be aware of this framing.

---

## 5. Pricing Model (from inorsa.com/packages)

**Headline:** "Built around how infrastructure work actually gets done"
**Model:** No seat licenses. No storage fees. Pricing scales with portfolio size + engineering output volume.

**Three components:**
1. **Asset Data Foundation** -- Annual subscription based on portfolio size. Covers document ingestion and asset-level data structuring.
2. **Deliverable Capacity** -- Right-sized output blocks. ~500 validation reports or ~250 structural analyses per block. Blocks combinable across types. Higher commitments = better per-block pricing.
3. **Ecosystem Connectors** -- Integrations (see section 6).

**Included in all packages:**
- Unlimited users (no per-seat fees)
- Unlimited document storage
- Nora AI across all suites
- Dedicated onboarding and support

**Outreach rule:** Do NOT quote pricing numbers. Do NOT promise "no seat fees" in emails. Pricing is a demo/sales conversation topic. The only acceptable reference is structural: "scales with your build volume, not your headcount."

---

## 6. Integrations

| Integration | Type | Fiber relevance |
|-------------|------|-----------------|
| **AutoCAD** | Design platform | HIGH -- most fiber A&E firms use this |
| **IQGeo** | GIS platform | MEDIUM -- some fiber operators use this |
| **SiteTracker** | Project management for telecom | HIGH -- construction tracking |
| **Egnyte** | Document management | MEDIUM -- document storage |
| **SharePoint** | Document management | MEDIUM -- enterprise document storage |
| **RISA** | Structural analysis | LOW -- tower-side, not fiber |
| **TNX** | Structural analysis | LOW -- tower-side, not fiber |
| **Salesforce** | CRM | LOW for outreach, HIGH for HubSpot loader context |

**Outreach rule:** Only reference integrations that match the prospect's known stack. Do NOT list all integrations. If we know they use AutoCAD (most do), mention AutoCAD. If we know they use 3GIS or Katapult Pro (which are NOT listed as integrations), do NOT claim Inorsa integrates with those.

---

## 7. Value Prop Scope (hard constraints)

**What Inorsa does for fiber (safe to claim):**
- Generates construction and permit drawings from GIS and LLD inputs
- Validates design data before drawings are produced
- Structures/ingests documents into asset-level intelligence
- Catches input conflicts that cause permit returns
- Produces consistent deliverables at any build volume
- Deterministic, traceable outputs (not AI hallucination)

**What Inorsa is NOT (never claim or imply):**
- NOT a GIS replacement (it ingests FROM GIS, does not replace ArcGIS/IQGeo/3GIS)
- NOT a visualization tool (the Nvidia confusion from the booth)
- NOT a construction management platform (that is SiteTracker's job)
- NOT structural analysis for towers (that is RISA/TNX via Harmoni product, tower-side only)
- NOT a Validation-only product for fiber (Validation Suite exists but fiber pitch is Engineering + Data)

**Product scope for FC2026 outreach:**
- Engineering Suite + Data Suite = the fiber story
- Validation is part of the workflow but not the lead message
- Fiber-only. Harmoni is tower-side only. Do NOT cross-reference tower capabilities in fiber outreach.

---

## 8. AE Roster and Territories

| AE | Territory | HubSpot Owner ID | Email |
|----|-----------|-------------------|-------|
| Mike Rutski | East | 89105202 | mike@inorsa.com |
| Nathan Dunn | Central | 89105203 | nathan@inorsa.com |
| Lucas Spencer | West/spread | 163468117 | lucas@inorsa.com |

**Tom Marciano:** INERT. Booth asset only. NEVER a sender. NEVER a From name. NEVER a voice config. (Sovereign Operator directive, 2026-05-01)

**Default for unassigned territory:** Lucas Spencer

---

## 9. Show Facts (canonical per wiki-459-mirror)

- **Show:** Fiber Connect (always two words, always with a space)
- **Dates:** May 18-19, 2026 (Mon-Tue). May 17 = setup day, NOT show floor.
- **Location:** Gaylord Palms Resort, Kissimmee FL.
- **Booth:** 1728
- **Days post-show (as of 2026-05-29):** 10

---

## 10. Salutation and Copy Rules

- Salutation: strictly `[FirstName],` (comma only). NO greeting word ("Hey", "Hi", "Hello", "Dear", "Greetings").
- No em-dashes in prospect-facing copy. Use commas or periods.
- No "I wanted to" framing. Lead with prospect's situation.
- Under 80 words per email body (T1 and T2). Under 60 for T3.
- One Inorsa sentence per email. Described by outcome, not by feature.
- No "following up on my previous email" in T2/T3. Each touch stands alone.
- No cheeky, slang, or non-executive-level dialog. (Tim directive)

---

## 11. MEDDPICC Alignment

Inorsa uses MEDDPICC sales qualification in HubSpot. ShowRev dossiers should map to:

| MEDDPICC Element | ShowRev Mapping |
|------------------|----------------|
| **Metrics** | sr_fit_rationale (quantified business case) |
| **Economic Buyer** | sr_decision_authority |
| **Decision Criteria** | sr_likely_objections |
| **Decision Process** | Research notes on buying process |
| **Paper Process** | Research notes on procurement |
| **Identified Pain** | sr_challenger_insight + hero insight |
| **Champion** | sr_next_best_action (who to cultivate) |
| **Competition** | Competitor intelligence KB |

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-29 10:31 | Claude | Initial SOT. Sources: pitch verbatim (decisions.log #026), Chris one-pager (2026-05-19), inorsa.com/product, inorsa.com/solutions/fiber, inorsa.com/packages, wiki-459-mirror show facts, Tim voice directives, operator constraints. |
