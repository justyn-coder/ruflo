---
title: Inorsa Source of Truth -- ShowRev FC2026 Pilot
status: ACTIVE
last_updated: 2026-06-07 18:07 EST
version: v5
purpose: Single canonical reference for all Inorsa product claims, positioning, and constraints used in ShowRev outreach. Every email, microsite, HubSpot property, and AE brief must be checked against this file before shipping.
---

# Inorsa Source of Truth

## 1. Pitch Variants (3 approved, rotate for spam differentiation + A/B testing)

**Variant A (ops_builder default):**
> "We convert your GIS and LLD data into construction and permit drawings in minutes, so your team takes on more work without adding headcount."

**Variant B (technical_designer):**
> "We convert your GIS and LLD data into construction and permit drawings in minutes. Deterministic output, full traceability back to source."

**Variant C (revenue_leader):**
> "We convert your GIS and LLD data into construction and permit drawings in minutes, so projects get to construction faster without adding headcount."

**Rules:** Use one variant per email, char-for-char. Rotate variants across touches and prospects to avoid spam-filter fingerprinting. All three are Nick-validated (2026-06-03 framing: speed, capacity, traceability). The mechanism ("GIS and LLD data → drawings in minutes") is the differentiator — keep it in every variant.

**Supersedes:** decisions.log #026 original pitch ("permit-ready construction drawings / Quality control is built in") — retired 2026-06-07 per Nick corrections + operator directive.

---

## 2. Chris Balandran's One-Pager (Head of Marketing, week of 2026-05-19)

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
- Generates construction drawings from GIS and LLD inputs at dramatically faster speed (~10 min vs hours/days)
- Produces consistent AutoCAD output to each jurisdiction's standard from one input process
- Scales drafting capacity 2-5x with existing headcount (cite as range, not guarantee — actual automation depends on prospect's GIS data quality)
- Accelerates production so teams have more time for their own QC before jurisdictional submission
- Deterministic, traceable outputs (not AI hallucination)

**What Inorsa does NOT do for fiber (NEVER claim — confirmed by Nick McManus 2026-06-03):**
- Does NOT validate inputs or catch errors in the GIS data — errors in GIS = errors in output
- Does NOT reduce permit return rates directly — speed gives time for better QC, but Inorsa does not do QC
- Does NOT guarantee a specific automation percentage without reviewing the prospect's files first
- NOT a GIS replacement (ingests FROM GIS, does not replace ArcGIS/IQGeo/3GIS)
- NOT a visualization tool (the Nvidia confusion from the booth)
- NOT a construction management platform (SiteTracker's job)
- NOT structural analysis for towers (RISA/TNX via Harmoni, tower-side only)
- Does NOT support conflict avoidance today (can ingest utility GIS layers but conflict avoidance is future)

**The real value proposition (Nick McManus framing, 2026-06-03):**
1. Revenue Acceleration — do the work faster, get paid sooner
2. Revenue Generation — accept more work without adding headcount
3. Opportunity — your team isn't stuck on this work, can do other things
4. Mistake proofing — ONLY where a key input is missing (not general QA)

**Known prospect objections (from Nick + sales threads):**
1. "Our GIS data is conceptual, not construction-grade" — network management tools are conceptual; CAD parity still requires drafter intervention. Counter: Inorsa maximizes what CAN be automated and partners to improve over time.
2. "The price doesn't match the value yet" — product is recent, still growing into pricing model. Focus on time/capacity ROI.
3. "We can't capitalize it" — SaaS/OPEX only. Frame as: throughput gain covers the OPEX.

**Industry reality (Nick confirmed):**
- 40-50% of permit submissions rejected on first pass (NOT 8-12% as previously cited)
- Kickback delays are MONTHS. Production delays are DAYS. This is the biggest problem in the industry.

**Product scope for outreach:**
- Engineering Suite + Data Suite = the fiber story
- Fiber-only. Harmoni is tower-side only. Do NOT cross-reference tower capabilities in fiber outreach.

---

## 8. HubSpot Configuration

| Property | Value |
|----------|-------|
| Sales Hub | Professional |
| Marketing Hub | Yes (tier TBD — confirm Starter/Pro/Enterprise) |
| Portal ID | (in .env as HUBSPOT_PORTAL_ID) |
| Private App | ShowRev Loader (scopes: contacts r/w, companies r/w, schemas r, lists) |
| Sequences | Active — 3 AE sequences for FC2026 |

**Reporting capabilities (Sales Hub Pro + Marketing Hub):**

- Custom reports: up to 100, single- and cross-object
- Dashboards: up to 25 (10 reports per dashboard)
- Sequences reporting: enrollment status, step-level metrics
- Email analytics: opens, clicks, replies (via Marketing Hub email events API)
- Attribution reporting: NO (Enterprise only)
- Revenue analytics: NO (Enterprise only)

---

## 9. AE Roster

| AE | Territory | HubSpot Owner ID | Email |
|----|-----------|-------------------|-------|
| Mike Rutski | East | 89105202 | mike@inorsa.com |
| Nathan Dunn | Central | 89105203 | nathan@inorsa.com |
| Lucas Spencer | West/spread | 163468117 | lucas@inorsa.com |

**Tom Marciano:** INERT. Booth asset only. NEVER a sender. NEVER a From name. NEVER a voice config. (Sovereign Operator directive, 2026-05-01)

**Default for unassigned territory:** Lucas Spencer

---

## 10. Show Facts (canonical per wiki-459-mirror)

- **Show:** Fiber Connect (always two words, always with a space)
- **Dates:** May 18-19, 2026 (Mon-Tue). May 17 = setup day, NOT show floor.
- **Location:** Gaylord Palms Resort, Kissimmee FL.
- **Booth:** 1728
- **Days post-show (as of 2026-05-29):** 10

---

## 11. Salutation and Copy Rules

- Salutation: strictly `[FirstName],` (comma only). NO greeting word ("Hey", "Hi", "Hello", "Dear", "Greetings").
- No em-dashes in prospect-facing copy. Use commas or periods.
- No "I wanted to" framing. Lead with prospect's situation.
- Under 80 words per email body (T1 and T2). Under 60 for T3. +10% flex ceiling (88w / 66w) ONLY to complete a thought naturally — not extra budget. Mechanical gate rejects above ceiling.
- One Inorsa sentence per email. Described by outcome, not by feature.
- No "following up on my previous email" in T2/T3. Each touch stands alone.
- No cheeky, slang, or non-executive-level dialog. (Tim directive)

---

## 12. MEDDPICC Alignment

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

## 13. Deployment Domains (Vercel prj_8Pfr4uUoe0h26wvveeYANnOyvSjN)

Single Next.js app, two domains, different audiences:

| Domain | Audience | Routes | Purpose |
|--------|----------|--------|---------|
| **fiber.inorsa.com** | Prospects | `/brief/[slug]` | ABM microsites ONLY. Prospect-facing. What goes in email P.S. links. |
| **showrev-microsites.vercel.app** | Operators (Justyn, Tim, AEs) | `/ops`, `/ops/queue`, `/ops/pipeline`, `/ops/brain`, `/ops/intelligence` | Internal Mission Control portal + staging. Never shared with prospects. |

**Hard rules:**
- Prospect emails link to `fiber.inorsa.com/brief/[slug]` — NEVER the showrev-microsites domain.
- Operator portal URLs (`/ops/*`) should NEVER be exposed to prospects or Inorsa stakeholders.
- Both domains serve from the same Vercel deployment. Code changes deploy to both simultaneously.

---

## 14. P.S. Variants (cold prospects only, 6 approved)

Cold-prospect P.S. used to be a single template — "We scored [Company]'s drawing workflow against 300+ fiber firms…" Two problems killed it:

1. The 5-dim judge consistently flagged it as misleading ("implies a completed analysis that doesn't exist; reframe to 'See how X benchmarks against…'") — caused 3 of 4 drafts in run-20260608-drsr.
2. Identical P.S. across every cold prospect is a spam-filter and recipient-comparison fingerprint.

Replaced with 6 variants designed against the Assessment Microsite Behavioral Audit (2026-06-08). Each variant invokes a different audit principle. Variants rotate by persona × touch number × deterministic company-hash.

### The 6 variants

| Key | Persona | Touch | Principle invoked |
|---|---|---|---|
| `quiet_diagnostic` | ops_builder | T1 | Curiosity gap, honest framing, personalization |
| `industry_data_hook` | technical_designer | T1 | Third-party authority (FBA), no overclaim |
| `loss_frame_anchor` | revenue_leader | T1 | Quantified loss frame + FBA source |
| `question_no_link` | any | T1 alt / T3 | Specific question as reply hook (no link CTA) |
| `named_peer` | any | T2 follow-up | Peer-operator authority + curiosity gap on outcome |
| `walkthrough_high_commit` | revenue_leader | T2 | High-commit booking CTA, gated specifics (Zeigarnik) |

**Verbatim text and rotation matrix:** `src/showrev/m1-email-find/influence.ts` → `PS_VARIANTS` + `pickPSVariantKey()`.

### Rules

- Each variant is char-for-char verbatim. Composers and recomposers must not paraphrase the claim or the source.
- Replacing "Fiber Broadband Association" with "industry sources" or similar generic language is a credibility downgrade and will fail the judge.
- The variants are for cold prospects only. Post-show follow-ups (when `hasAeNotes` is true) keep the brief-link template: `P.S. Put together a brief on [Company]'s drawing workflow. https://fiber.inorsa.com/brief/[slug]`
- T3 (binary close) gets `question_no_link` — no link CTA. The body IS the close.
- Variant selection is deterministic on `(persona, touchNumber, companyHash)`. Same prospect = same variant on re-runs.

### Audit principles applied (citation for each)

- **No overclaim** — "Claiming you've benchmarked 300+ is asserting you've assessed 20-30% of the industry. A VP will know most of their peers by name."
- **Third-party authority** — "Quoting your own salesperson as a source of industry insight is the fastest way to trigger 'this is marketing.'"
- **Honest framing of what the link delivers** — "If [prospect] clicks and gets a quiz rather than a completed report, the credibility damage outweighs the CTA benefit."
- **Curiosity gap (Zeigarnik)** — "Show the WHAT but gate the HOW. Walkthrough is where the specifics live."
- **Loss frame > vague opportunity** — "Technical people respond more to quantified loss than to vague opportunity."

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v6 | 2026-06-08 17:30 | Claude | Added §14 P.S. Variants (6 cold-prospect variants rotating by persona × touch). Retired single canonical cold P.S. ("We scored [Company]'s drawing workflow against 300+ fiber firms") which failed judge 3 of 4 prospects in run-20260608-drsr. New variants designed against Assessment Microsite Behavioral Audit principles. Composer + recomposer use `selectPSVariant()` for cold; post-show retains brief-link template. |
| v5 | 2026-06-07 18:07 | Claude | §1 rewritten: single locked pitch → 3 rotatable variants (A/B/C). "permit-ready" and "Quality control is built in" retired per Nick corrections + operator directive. New mechanism: "GIS and LLD data → construction and permit drawings in minutes." |
| v4 | 2026-06-06 12:04 | Claude | Added §13 Deployment Domains — fiber.inorsa.com (prospect-facing) vs showrev-microsites.vercel.app (internal ops portal). |
| v3 | 2026-06-04 00:30 | Claude | Nick McManus corrections: removed validation/error-catching claims, added 40-50% rejection rate, added "conceptual GIS" + pricing objections, reframed value prop as speed→time→QC (not direct quality assurance). |
| v2 | 2026-06-02 17:49 | Claude | Added §8 HubSpot Configuration (Sales Hub Pro + Marketing Hub, reporting capabilities). Renumbered §9-12. |
| v1 | 2026-05-29 10:31 | Claude | Initial SOT. Sources: pitch verbatim (decisions.log #026), Chris one-pager (2026-05-19), inorsa.com/product, inorsa.com/solutions/fiber, inorsa.com/packages, wiki-459-mirror show facts, Tim voice directives, operator constraints. |
