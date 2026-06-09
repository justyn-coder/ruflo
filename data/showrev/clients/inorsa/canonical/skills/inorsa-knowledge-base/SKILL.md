---
name: inorsa-knowledge-base
description: "Comprehensive Inorsa company, product, industry, and sales intelligence reference. Use this skill as a knowledge base whenever working on any Inorsa-related task — account planning, pre-call briefs, prospecting, deal strategy, product positioning, competitive intelligence, or pricing. Contains synthesized intelligence from SKO 2026 transcripts, product demos, marketing deep dives, and engineering walkthroughs. This skill should be read FIRST before any other Inorsa sales skill is executed."
---

# ⚠ FIBER vs TOWER DEMARCATION (read this BEFORE using any section)

**Default assumption: TOWER (cellular) business unless content is EXPLICITLY about fiber.**

Inorsa's core business is cellular/tower telecom infrastructure document management. The fiber product line is a newer slice. When consuming this skill for a specific outreach context, filter accordingly.

### FIBER-ONLY sections (use for fiber operator outreach — ShowRev / Fiber Connect 2026)
- **Product Stack §Layer 3 → Fiber Drawings** (entire subsection — GIS→CAD product)
- **Industry Knowledge §Fiber Industry Context** (entire subsection)
- **ICP §ICP 3: Fiber Operators** (entire subsection)
- **GTM §Integration Partner: IQGeo** (fiber)
- **2026 Roadmap → April 17 (Fiber Drawing scalability) + July 10 (Fiber PLA)**
- **Engineering Credit Weights table → Fiber plan/profile (1.00), Fiber Drawing QC (0.75), PLA-Fiber (0.50)**
- **Sales Playbook → Drawings (Fiber) discovery question + Fiber-drawing don't-sell rules**

### TOWER-ONLY content (do NOT use in fiber outreach — risk of misframing)
- **Product Stack §Layer 3 → Structural Analysis, Mount Analysis, Macro Tower Drawings** (all tower)
- **Document Types: RFDS, SA, MA, MLA, ERI files** (all tower)
- **Asset Types: Macro cells, Small cells** (cellular)
- **Industry Workflow: Tower Modification** (tower)
- **Tower Owner Business Model** (tower)
- **A&E Firm Dynamic** ("~400-500 A&E engineering firms (tower side)" — explicitly tower)
- **ICP 1: A&E Firms** (tower per industry-knowledge context above)
- **ICP 2: Tower Companies** (obvious)
- **Named accounts: Harmony, Vertical Bridge, Ansco, Crown Castle, Symphony, CCI, TEP, MetroConnect, Everest** (all tower)
- **Antenna analysis, sector A/B/C, stacked antennas, feed lines** (cellular)
- **TNX Tower, AutoCAD Core reverse-engineering** (tower)
- **MicroStation guardrail** (tower drawings)

### SHARED / FOUNDATION (applies to both)
- Company Overview, Founding Story, Team Members
- **Product Stack §Layer 1: Data Suite** (document ingestion — both businesses)
- **Product Stack §Layer 2: Validation Suite** (cross-doc reconciliation — both)
- Nora AI (cross-suite layer)
- Pricing & Packaging framework (Bands A-D, Capability tiers, NDR target)
- Competitive Landscape (six categories — applies to both verticals)
- Most Sales Guardrails (Drawing QC silence, offshore sensitivity, TTFV targets)

**For ShowRev fiber outreach: use FIBER-ONLY + SHARED sections. Filter TOWER content out.**

---

# Inorsa Knowledge Base — SKO 2026 Master Reference

This document contains synthesized intelligence from Inorsa's 2026 Sales Kick-Off, including Sean's company/industry overview, Chris Balandran's marketing deep dive, Zane Admani's engineering/product demo, and Mark's product packaging slides. Use this as the primary reference for all Inorsa sales activities.

---

## Company Overview

### What Inorsa Does
Inorsa is an AI-enabled service platform for telecom infrastructure document management. The platform automates the ingestion, validation, and generation of engineering documents across the telecom infrastructure lifecycle.

### Founding Story
- Founded by Sean (CEO), who has a structural engineering background
- Came from oil & gas industry, transitioned to telecom
- Built the company around the core problem: telecom infrastructure documents are fragmented, inconsistent, and manually processed

### Key Team Members
- **Sean**: CEO/Founder (structural engineer background, oil & gas → telecom)
- **Chris Balandran**: Head of Marketing (solo marketing person, runs GTM ops, HubSpot/Apollo admin)
- **Nathan Dunn (Tim)**: Sales leadership role
- **Geoffrey McDaniel (Jeff)**: Customer Success/Engineering SME (understands tower analysis deeply, former A&E background)
- **Kevin Maufer**: Product-related role
- **Zane Admani (Zain)**: Head of Engineering/Product — runs both Experience and Services teams
- **Nick Juelle**: Recently joined as head of business (customer success)
- **Tom**: Previous sales person (has 31 leads including MetroConnect hot leads)
- **Mark**: Product marketing, knowledge hub, product messaging
- **George**: Reviews marketing content
- **Ram**: Drafter (spends ~2 hours finishing automated drawings vs 8 hours previously)

### Engineering Org Structure
Two major teams:
1. **Experience Team**: Portal, UI, Nora AI, rendering, workbench — "how is the experience to do that thing"
2. **Services Team**: Core capabilities — structural analysis, validation, drawing generation — "can we do it? do we have the capability?"

---

## Product Stack — Three-Layer Architecture

### Layer 1: Data Suite (Enterprise Memory Layer / Data Room)
**What it does**: Ingestion, structuring, normalization, lineage, organization, and search of unstructured telecom documents.

**Key capabilities**:
- Document upload and processing (handles 65,000+ documents in a single data room)
- AI-powered document classification (customizable via AI Lab)
- Auto site matching (including multi-site matching)
- OCR + computer vision extraction (critical for old documents from the 90s)
- Intelligent fields — unstructured-to-structured data transformation (ask documents questions at scale)
- Auto renaming with customizable naming conventions using site data and intelligent fields
- Global search across all documents
- Built-in translation (important for international customers)
- Customizable summaries per document classification
- All AI decisions are reasoned (explainable, not black box)
- Export to Excel
- Reasoning available for all AI model decisions at different levels of detail

**AI Lab Configuration**:
- Customers can customize document classes, class descriptions, summary prompts, and intelligent fields
- No engineering resources required — CS person can do it
- Typically 2 onboarding sessions
- Customers can self-serve once trained

**Integrations (Current)**:
- Egnyte (Ignite)
- SharePoint
- Box and Dropbox (coming)
- Salesforce and SiteTracker (coming in weeks)

**Integration Flow**: Pull data from customer systems → Process in Inorsa → Push structured data back. Customer Harmony works this way — data flows through Egnyte, processed by Inorsa, metadata populated back automatically.

**Onboarding**: Easiest product to onboard. No engineering resources needed. 2 training sessions. Configuration-first approach. Target TTFV ≤14 days.

### Layer 2: Validation Suite
**What it does**: Cross-document reconciliation — surfaces conflicts, missing data, and readiness blockers.

**Key capabilities**:
- Basic site information checks (lat/long, FA codes, addresses)
- Antenna analysis (model numbers, equipment database, weights, azimuths, centerlines)
- Equipment alias resolution (T-Mobile, Crown, Verizon all call same equipment different names — Inorsa has a database for cross-referencing)
- Stacked antenna calculations
- Feed lines, cables, radios — full TME validation
- Sector analysis (A, B, C sectors with angle/tilt validation)
- Threshold-based deviation alerts (customizable, usually 1-1.5 feet)
- Draft readiness assessment (checks: has RFDS? has order form? MA passing? capacity < 90%? SA passing? metadata consistent?)
- HTML report output, exportable to PDF
- Everything sourced — click to see exact document location of each data point

**Validation vs Nora distinction** (CRITICAL for sales messaging):
- Nora = single-element model, text in/text out, good for high-level metadata checks
- Validation = swarm of agents, extreme depth both visually and text-wise, vetted by SMEs, hundreds of samples checked
- Nora CANNOT do: deep equipment analysis, read construction drawings/CDs well, visual tasks like plumbing diagrams
- Validation is tested, guaranteed accuracy; Nora output varies
- Price point: ~$11 per validation report (Ansco pricing), $20-30 range mentioned
- Manual equivalent: minimum 1 hour per site, error-prone, requires multiple monitors and specialized knowledge

**Product Cannibalization Risk**: Nora getting good enough that it overlaps with validation. Sales team needs to:
- Set clear expectations on Nora limitations during sales process
- Position validation as "expert agent" — higher accuracy, SME-vetted, guaranteed quality
- Guardrails can be set on Nora to restrict validation-type queries unless validation suite is purchased
- Never let customer think Nora replaces validation — it doesn't for anything requiring visual analysis or deep cross-document equipment checks

**New Workbench** (coming): Interactive canvas with validation report + Nora sidebar for questions/adjustments. Moving from input→output to human-in-the-loop. Nora will become interactive (fix items, adjust output) in next 6 weeks.

**Onboarding**: Second easiest. Working toward zero-onboarding — goal is "send me documents for one site, I'll run validation live in the sales meeting." Expected by end of current month.

### Layer 3: Engineering Suite
**What it does**: Generates execution-grade outputs — drawings, analyses, and submission packages from validated data.

#### Structural Analysis (SA) — GENERAL AVAILABILITY
- Extracts data from previous structural analysis PDFs
- Builds TNX Tower models automatically (PDF → ERI file)
- Loads new equipment from RFDS into the model
- Runs analysis on Inorsa's hosted TNX server
- Produces full PDF reports
- Covers ~90% of work; ~10% manual tweaking at backend
- Two paths: (1) Full PDF-to-TNX modeling (no prior ERI), (2) ERI + RFDS → new loading only
- **TNX Relationship**: No formal partnership. Reverse-engineered ERI files (ugly text files). Host TNX on own server. License reviewed — supported. TNX has no visibility or say.
- New workbench version: Interactive structural reports in portal, Nora read-only (edit capabilities coming)
- **First customer target**: Vertical Bridge (did full in-person FTE, waiting on Softbank acquisition budget freeze to lift)
- **Upsell target**: Ansco (existing customer)

#### Mount Analysis (MA) — Coming April 2026
- Part of next major release (sprints 73-75)

#### Macro Tower Drawings (Construction Drawings/CDs)
- Full DWG package output, opens directly in AutoCAD
- ~10 minutes to generate
- Input: RFDS, mount analysis, order summary, CAD template files
- **AutoCAD Integration**: Reverse-engineered AutoCAD Core to generate valid DWG files without license. Autodesk doesn't know/can't stop it. Files are 100% valid because AutoCAD itself builds them.
- Supports: model space (to-scale), paper space (print layouts), dynamic blocks (jurisdiction-aware), Google Maps integration, dynamic notes
- Goal: zero typing — "paint by numbers" for drafters
- **Template Challenge**: Every customer has unique standards. Each template = significant implementation cost. Customers say they'll accept standard templates but rarely actually do.
- **Moving to configurable drawings**: Customers select from options rather than full customization. Market research ongoing.

**Qualification for Macro Drawings**:
- Minimum ~1,000 drawings/year overall, OR 500+ on 1-2 templates
- Key qualifier: per-template volume, not just total volume
- Must ask: "How many templates?" then "Is it truly different templates or just jurisdictional page variations?" (jurisdictional variations are easy for Inorsa)
- Repeatability is the crux — AT&T-only shop doing 300-400 of same template = good fit
- Need SME vetting before any drawing customer gets in the door
- Pricing: ~$205 per drawing at high end, based on single template, maybe up to 3 templates
- Onboarding: Heavy, lengthy. Heaviest product to implement. Separate platform fee from per-template setup cost.
- **BricsCad**: Supports DWG, should work with our output. Not yet validated.
- **MicroStation**: STAY AWAY. Legacy garbage. Had a customer churn on it. Files don't convert.

**Crown Castle**: Sold this to them. 10-15,000 drawings. Reference case for high-volume.

#### Fiber Drawings — GENERAL AVAILABILITY
- Brand new product, most configurable drawing built to date
- Input: GIS files (any standard — KML, KMZ, GeoJSON, shapefiles)
- Output: CAD file (DWG)
- Works with all GIS platforms: IQGeo (actual partner), Esri, QGIS, ArcGIS
- **Key differentiator vs basic GIS import**: Reads individual metadata per point/line. Places specific blocks (Toby boxes, handholes, bore pits). Maps lines to correct layers. Referential callouts. Page splitting (gridding or line-following algorithms). Per-page entity counts. Address point callouts. Smart callouts (LLM-generated from metadata).
- **One-to-one GIS→CAD transfer** — eliminates the mismatch problem where drafters change things in CAD
- **Implementation**: Hours, not weeks/months. Configuration-based on scoping sheet. Much lighter than tower drawings.
- **One customer today** — brand new product, built out late last year
- **Selling fiber drawings**: Demo-led. If prospect is impressed → they need it. If not impressed → they have existing automation. Ask: "What does your current GIS to CAD pipeline look like?"
- **TEP example**: Tower Engineering Professionals — too sophisticated for fiber drawings. Their GIS pipeline was better than anyone Inorsa had seen. Not a fit.
- **Adoption insight (Zane)**: Must save significant time to overcome change resistance. 10% savings isn't enough if it adds ANY process friction. Target unsophisticated companies first.
- **Lifespan risk**: GIS platforms trying to replace CAD for permitting. ~2 years out. Jurisdictions still require specific print sets. IQGeo's own PDF printing was publicly panned at their own conference. Inorsa demoed at IQGeo conference to huge reception.

**Drawing QC**: NOT on roadmap. Pure R&D. Do NOT mention to customers. Zane was explicit: "I do not wanna mention this to a customer at all until we can prove it out."

### Nora AI — Cross-Suite Intelligence Layer
- Chat interface for querying documents and data
- User-specific memory (~250K tokens, ~1M characters, graceful degradation)
- Can answer geographic queries (e.g., "show me all California sites and their readiness")
- Currently read-only for reports; interactive/edit capabilities coming
- Cannot export to Word/PDF today (copy only). Export features on roadmap.
- No organization-level prompts yet (planned — allow admins to set system prompts, prepackaged prompt templates)
- **Nora limitation**: Visual tasks (CDs, plumbing diagrams) don't work well. Text-based tasks = strong. Visual = weak.
- **Sales positioning**: Nora is included with base platform. Validation and Engineering are separate modules. If Nora triggers validation-type questions without validation purchased, it can be configured to redirect to sales.

---

## Industry Knowledge

### Telecom Infrastructure Ecosystem
- ~400,000 towers in the US
- Crown Castle averages ~2.3 tenants per tower
- ~400-500 A&E engineering firms (tower side)
- ~1,200 fiber engineering firms

### Key Document Types
- **RFDS** (Radio Frequency Design Specification): The starting input. Contains equipment specs, frequencies, power. Inorsa's RFDS OCR is a major differentiator — 95%+ accuracy on inconsistent PDF formats.
- **Structural Analysis (SA)**: Physics-based simulation of tower loading. Run in TNX Tower. 36-100+ page reports.
- **Mount Analysis (MA)**: Analysis of mounting hardware and positions.
- **Construction Drawings (CD)**: Detailed engineering drawings for field construction. DWG format.
- **PLA** (Pole Load Analysis): For small cells (utility poles/light poles) and fiber.
- **MLA** (Master Lease Agreement): Legal documents governing tower space leasing.
- **Applications**: Permit and regulatory submissions.
- **ERI files**: TNX Tower input files — ugly text files with parameters. A&E firms typically withhold these from tower owners to maintain competitive advantage (forces tower owner to come back to same A&E firm).

### Asset Types
- **Macro cells**: Towers and rooftops — primary focus
- **Small cells**: Utility poles, light poles — future product focus
- **Fiber**: Underground and overhead — active product development

### Industry Workflow (Tower Modification)
1. Carrier (Verizon, AT&T, T-Mobile) decides to modify/upgrade a site
2. Tower owner receives request
3. A&E firm gets project with data dump (50+ unlabeled documents)
4. A&E firm must: classify documents, validate data consistency, produce structural analysis, produce drawings
5. Drawings go to jurisdiction for permitting
6. Construction

### Industry Pricing Benchmarks
- SA, MA, CD each from carriers direct: $1,200-$1,500
- Subcontracted: $600-$800 per document
- Offshore (India): ~$150 per document + $150 QC = ~$300 total
- Industry standard (Indian outsourcing): ~$550
- **Inorsa target**: ~$150-$200 per automated output
- Standard turnaround: 10-day/2-week per document type

### Offshore Outsourcing Dynamic
- Work on US infrastructure technically not allowed to be outsourced offshore
- Nearly everyone does it anyway
- T-Mobile network hack traced to offshore team's SharePoint folder — cautionary example
- Too sensitive to use aggressively in sales, but a long-term leverage point

### Tower Owner Business Model
- Tower owners lease space to carriers
- Revenue = lease payments from carriers
- Growth model: Build/buy towers → lease up → securitize assets → raise capital → build/buy more
- Recapitalization happens every few years based on lease-up progress or interest rates
- **Sales insight**: Tower owners with capacity data can proactively reach out to carriers ("you have room on Tower X") instead of waiting — Harmony is doing this. Revenue-generating use case for Nora.

### A&E Firm Dynamic
- A&E firms think in "projects" not "assets" — they don't own the assets
- Same site can be multiple projects over time
- ERI file withholding creates competitive moat for A&E firms (tower owner has to come back to them)
- Inorsa's PDF-to-TNX capability breaks this paradigm
- **Jeff's insight on CD validation**: A&E firms' biggest bottleneck is NOT drawing generation (they've figured out offshoring). It's QA/validation — they bring work onshore for manual checking. Validation suite plugs in here.
- **CD Revision use case**: When carriers change equipment mid-project, A&E firms need to figure out which CDs need to change. Huge pain point for validation.

### Fiber Industry Context
- Fiber operators more technologically advanced than tower companies
- They model in real-time GIS software (IQGeo, Esri)
- Still must produce CAD prints for permitting — this is the "last mile" pain
- Mismatch problem: GIS data ≠ what drafter puts in CAD ≠ what gets built
- Pricing based on linear feet/miles, not per drawing (drawings can vary massively in linear feet content)

---

## ICP Qualification Thresholds (Updated at SKO)

### ICP 1: A&E Firms
- **Volume threshold**: 500+ combined drawings/analysis per year (updated from 250 during SKO)
- **Revenue target**: $100K+ per customer, ideally $500K+
- **Drawing qualification**: 1,000+/year overall or 500+ on 1-2 templates
- **Key questions**: How many SAs/year? How many templates? Are template differences real or just jurisdictional?

### ICP 2: Tower Companies
- **Asset threshold**: 200+ towers minimum, sweet spot 500-2,000, focus on 1,000+
- **Key use cases**: Portfolio remediation, carrier upgrade cycles, data room cleanup, structural capacity analysis

### ICP 3: Fiber Operators
- **Volume threshold**: 250 miles/year (~1.3M linear feet), ~3M feet over 5 years
- **Sophistication check**: Ask about current GIS→CAD pipeline. If they have 50-60%+ automated, value proposition declines quickly.
- **Best targets**: Less sophisticated companies where this is "magic" to them. Build reference cases, then go upmarket.

---

## Pricing & Packaging (From Product Slides)

### Framework
- **Scale metric**: Active Assets (annual) — assets with at least one qualifying operational engagement
- **No seats, no tokens, unlimited ingestion and storage**
- **Land**: Data + Validation (Nora included). $40K+ target entry ACV. ≤14-day TTFV.
- **Expand**: ↑ Active Assets, ↑ Capability tier, Engineering Suite attachment, Workflow Extensions

### Scale Bands
| Band | Active Assets | Typical Customer |
|------|--------------|-----------------|
| A | <300 | Mid-market, pilots |
| B | 301-750 | Upper mid-market |
| C | 751-1,500 | Large portfolios |
| D | 1,501-3,000 | Whales, portfolio-wide |

**What activates an asset**: Validation workflow run, asset-level report/export/action, engineering output generated, extension outcome. **NOT**: Bulk upload, passive viewing, portfolio queries without asset-level outputs, background sync.

### Capability Tiers
1. **Essentials** (Future): AI-assisted prep with human review
2. **Professional** (Current): AI-driven validation and readiness decisions with explanations
3. **Elite** (Future): Auditability, reproducibility, fallback at operational scale

### Data + Validation Pricing
| Tier | Band A | Band B | Band C | Band D |
|------|--------|--------|--------|--------|
| Essentials | $35K | $40K | $55K | $70K |
| Professional | $40K | $60K | $90K | $120K |
| Elite | $120K | $160K | $200K | $300K |

### Engineering Credits
| Annual Commitment | Price/Credit |
|------------------|-------------|
| 0-500 | Not a fit |
| 501-2,000 | $195/credit |
| 2,001-5,000 | $175/credit |
| 5,001+ | $150/credit |

### Engineering Credit Weights
| Output Type | Weight | Status |
|------------|--------|--------|
| SA | 1.00 | Available |
| MA | 1.50 | Available |
| Fiber plan/profile | 1.00 | Available |
| Tower drawing (standard mod) | 1.00 | Future |
| Small cell drawing | 0.50 | Future |
| PLA - Small Cell | 0.25 | Future |
| PLA - Fiber (per 10 poles) | 0.50 | Future |
| Analysis Output QC | 0.25 | Future |
| Tower Drawing QC | 0.50 | Future |
| Fiber Drawing QC | 0.75 | Future |
| Permit package | 0.25 | Future |

**Target NDR**: ≥130%

---

## Competitive Landscape (From Product Slides)

### Six Competitor Categories

1. **Systems of Record** (SiteTracker, IQGeo): "We manage workflow and record asset data." Counter: Systems of record store what humans enter — they don't validate truth. Inorsa validates across documents and generates outputs. We integrate INTO your SoR.
2. **Outsourcing** (Human labor, offshoring): "We can do this with people — safer." Counter: Hiring scales cost linearly. Inorsa scales throughput. Validation catches conflicts early. Engineering outputs become repeatable, not person-dependent.
3. **Homegrown Systems** (Spreadsheets, custom apps, GPT+RAG): "We have engineers, we'll build it." Counter: This isn't a chatbot. Cross-document validation and execution-grade outputs are the hard parts. We prove value in weeks — internal builds take quarters and stall at reliability.
4. **Horizontal AI** (Generic AI, document chat): "Ask questions about your documents." Counter: Summaries aren't readiness. Inorsa validates conflicts and produces decision-grade truth. We generate execution outputs — not just answers.
5. **Document Repositories** (SharePoint, Box, Drive): "Centralized document source." Counter: Storage ≠ operational truth. Inorsa structures and validates across documents. Cross-document reconciliation identifies conflicts and readiness blockers.
6. **Engineering Software** (Autodesk, RISA, TNX Tower): "Industry-standard precision tools." Counter: Traditional tools analyze individual designs — Inorsa automates end-to-end engineering workflow, dramatically increasing throughput.

---

## GTM Stack & Marketing Intelligence

### Tools
- **CRM**: HubSpot (marketing hub, sales hub, service hub)
- **Enrichment**: Apollo
- **Content Calendar**: Monday.com
- **Communication**: Slack
- **Integration Partner**: IQGeo (fiber)
- **Future Integration**: SiteTracker

### Marketing Funnel (as of SKO)
- 307 target accounts (new logos only)
- 105 showing active interest
- 25 converted to leads (31 total open leads)
- 15 MQL, 7 SQL
- Quarterly targets: 21 MQLs converting to 16 SQLs

### Key Accounts & Deal Intelligence
- **Harmony**: Most mature customer. Uses Egnyte integration. SVP of Technology is champion (DJ). Created "rip sheets" for sites using Nora. Working on competitive analysis of tower portfolio. Wants to proactively reach out to carriers about available capacity.
- **Vertical Bridge**: SA first customer target. Full in-person FTE completed. Waiting on Softbank acquisition budget freeze. CIO is a blocker (building internal tech). Strategy: sell SA to deployment team outside of IT. No integration initially.
- **Ansco**: Existing customer. Upsell target for SA. Currently paying $11/report for validation.
- **Crown Castle**: Sold drawings to them. 10-15K drawings. Reference case. ~2.3 tenants/tower average.
- **Symphony**: Current customer using SharePoint→Inorsa→SiteTracker integration flow.
- **CCI**: Recent call. Discussed SA volume, drawings. Asked about BricsCad compatibility.
- **TEP (Tower Engineering Professionals)**: Too sophisticated for fiber drawings. Their GIS pipeline was better than anyone Inorsa had seen. Not a fit currently.
- **MetroConnect**: Hot leads from Tom.
- **Everest**: Deal in progress. Nathan walking through it as training example.

### Cannibalization Dynamic
- Selling to tower owners (like Crown Castle) can cannibalize A&E firms who previously did that work
- A&E firms may become aware of Inorsa through their tower owner clients' automation
- **Reframe**: This should motivate A&E firms to adopt automation themselves to stay competitive

---

## 2026 Product Roadmap

### Strategic Themes
1. Productize the Telecom Wedge
2. Make Onboarding Predictable (TTFV ≤14 days)
3. Unify the Platform
4. Expand the System Surface (partners, integrations, verticals)
5. Enable Autonomous Asset Ops (multi-vertical agents)

### Release Schedule
| Date | Focus |
|------|-------|
| March 6 | Validation foundation + SA + Project Workbench + Nora performance |
| April 17 | Mount Analysis + Fiber Drawing scalability + data connectivity |
| May 29 | Validation hardening + Nora workflow triggering + TTFV acceleration |
| July 10 | Fiber PLA + integration SDK maturity |
| August 21 | Configurable Drawings + platform unification |
| October 2 | Add-on Extensions maturity |
| November 13 | AI compounding loops |
| December 25 | Multi-vertical expansion |

### Future Extensions (Proposed)
- Regulatory (compliance management)
- Document (permits, forms, regulatory reports)
- Field (mobile tools, drone integration)
- Commercial (BOM generation, cost modeling, ROI analysis)
- Simulation (predictive modeling, scenario planning)

---

## Sales Playbook Notes (From SKO Discussions)

### Key Discovery Questions by Product

**Data Room**: "How do you currently organize and find documents across projects? How much time do you spend classifying and naming files?"

**Validation**: "How many hours does someone spend cross-checking documents before engineering can start? What percentage of projects require rework due to document conflicts?"

**Structural Analysis**: "How many structural analyses do you run per year? Do you have the previous ERI files, or are you working from PDFs?"

**Drawings (Tower)**: "How many drawing packages per year? How many unique templates? Are differences real or just jurisdictional?"

**Drawings (Fiber)**: "What does your current GIS to CAD pipeline look like? How much of the transformation is already automated?"

### Selling SA to Tower Owners (Revenue Use Case)
- Use Nora to show tower capacity across portfolio
- Position as: "We can tell you which towers have capacity for new equipment"
- Tower owners can proactively go to carriers: "You have room on Tower X"
- This is an outcome-driven, revenue-generating pitch
- Harmony is already doing this with DJ

### When NOT to Sell
- Fiber drawings to sophisticated companies (>50-60% existing automation)
- Tower drawings under 500/year on single template
- Drawing QC (not on roadmap — do NOT mention)
- Microstation users (stay away)
- Companies doing <500 combined drawings/analysis per year (A&E)
- Tower companies with <200 towers

### Objection Handling: "We'll Build It Ourselves"
- Vertical Bridge CIO is building internal — it's a rabbit hole, not their core business
- Cross-document validation and execution-grade outputs are the hard parts
- Internal builds stall at reliability
- Counter: We prove value in weeks. You can help shape our roadmap by partnering early (Harmony model).

### Upsell Motion
- Land with Data + Validation (Nora included)
- Expand: ↑ assets → ↑ capability tier → attach Engineering Suite → attach Extensions
- Engineering Suite is the strategic revenue engine — deepens lock-in, raises switching costs
- Target NDR ≥130%

---

## Quick Reference: Product Module Decision Tree

**Starting Point: You have documents to organize?**
→ Data Suite (Data Room) — Always the entry point.

**Then: You need to verify consistency/readiness?**
→ Validation Suite — Recommend strongly for any engineering workflow.

**Then: You need execution outputs?**
- Structural analysis? → SA module
- Tower drawings? → Macro tower drawings (qualify carefully on template count)
- Fiber drawings? → Fiber drawings (qualify on GIS sophistication)

**Throughout: Need to ask questions or find data across documents?**
→ Nora AI — Included in base platform, read-only today, becoming interactive.

---

## Critical Sales Guardrails

1. **Nora vs Validation**: Never position Nora as a replacement for Validation. Nora is good at text-based queries; Validation does cross-document reconciliation with SME-vetted accuracy.
2. **Drawing QC**: This is not a real product. Do NOT mention it to customers under any circumstances.
3. **Offshore Sensitivity**: US infrastructure work shouldn't be outsourced offshore. This is technically illegal. Don't use aggressively in sales, but it's a long-term advantage point for Inorsa.
4. **Template Reality Check**: Customers always say they want custom templates. They rarely actually implement them. Dig deep: ask about how many templates, and whether differences are real or just jurisdictional variations.
5. **Cannibalization Awareness**: Selling to tower owners may cannibalize traditional A&E firm revenue. This is a feature, not a bug — reframe it as: A&E firms should adopt Inorsa themselves to stay competitive.
6. **TNX Tower Relationship**: Inorsa reverse-engineered ERI files and hosts TNX internally. TNX has no formal partnership and no visibility. This is legal but keep it quiet. Never mention TNX licensing concerns to customers.
7. **AutoCAD Core Reverse-Engineering**: Inorsa reverse-engineered AutoCAD DWG generation without a license. It's technically unsupported but works perfectly. Don't volunteer this information, but don't deny it either if asked directly by a technical customer.
8. **MicroStation**: Do not sell to MicroStation customers. We tried it, files don't convert properly, customer churned. Not a fit.
9. **TTFV Targets**: Data Suite should hit ≤14 days. Validation approaching zero-onboarding (goal: run live in sales meeting by end of month). Drawings are heavy implementations.
10. **ICP Thresholds**: A&E firms need 500+/year combined volume. Tower companies need 200+ towers minimum (ideal 500-2,000). Fiber operators need sophisticated GIS workflows where we can save significant time.
