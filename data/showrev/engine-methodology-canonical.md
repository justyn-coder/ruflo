---
title: ShowRev Engine Methodology -- Canonical Reference
status: ACTIVE
last_updated: 2026-05-31 01:30 EST
version: v1
purpose: Single canonical reference for ShowRev research, ICP gating, email composition, and HubSpot loading. A fresh session reads this and can replicate the quality without re-learning from the operator.
---

# ShowRev Engine Methodology

## §1 Research Method

### Approach: Hypothesis-Driven Inference (Heuer ACH)

Do NOT walk a source checklist. Instead:
1. Form a specific hypothesis about the company's 1-3 year goals and how the contact's role creates exposure to fiber design/drafting needs
2. Search to confirm or DISCONFIRM (disconfirming evidence weighted higher)
3. If hypothesis survives, refine and search again
4. If it dies, form new hypothesis from what evidence surfaced
5. 3-5 iterations max

### STORM Multi-Persona Research (Premium Pipeline)

Three AI personas research independently, then cross-examine each other's findings:

**Industry Analyst** -- market dynamics, competitive landscape, regulatory environment, growth signals
- Priority sources: trade press (fiercenetwork, lightreading, telecompetitor), conference speaker bios, state broadband offices, podcasts
- Cross-reference against industry intelligence KB for macro forces (BEAD, fiber prices, labor, M&A)

**AE Proxy** -- buying signals, decision authority, budget timing, objections, sales angle
- Priority sources: LinkedIn (role, career, tenure), conference appearances, company leadership page, booth-scan list (multi-threading)
- Best find: direct quote from this person about their challenges (podcast, panel, trade press)

**Technical Evaluator** -- current tools, workflow, technical pain points, integration fit
- Priority sources: job postings (single best signal for tools, team size, growth), vendor case studies naming the prospect as customer, tech stack identification
- Cross-reference: AE booth notes for tool mentions

### Cross-Examination

After independent research, each persona challenges the others:
- AE Proxy asks Analyst: "Is the company in a BUYING position or survival mode?"
- Tech Eval asks Analyst: "Does engineering capacity match stated buildout targets?"
- Analyst asks AE Proxy: "Are there other stakeholders who could block?"
- Tech Eval asks AE Proxy: "What's the realistic switching cost?"
- Analyst asks Tech Eval: "Is current tooling sustainable at their target scale?"
- AE Proxy asks Tech Eval: "Is the pain in the workflow we assumed?"

### Source Hierarchy

| Tier | Sources | Signal value |
|------|---------|-------------|
| 1 | State broadband offices, PUC filings, NTIA data, FCC filings | Verified facts |
| 2 | Trade press (fiercenetwork, lightreading, bbcmag, telecompetitor) | Industry context |
| 3 | Company website, LinkedIn, job postings, career pages | Company-specific |
| 4 | Aggregators, general business directories | Background only |

### Linear vs Lateral Sources

**Linear** (structure): web, press, filings, social, careers pages
**Lateral** (colour): podcasts, panel transcripts, government filings, drawings, SEC documents, trade-association records, board appointments

Linear gives the facts. Lateral gives the insight that makes the email feel like it came from someone who actually understands their world.

---

## §2 ICP Criteria

### What PASSES (ICP fit)

Companies that do fiber design, construction, or A&E work AND have:
- Engineering/design staff producing construction drawings
- Multi-jurisdiction or multi-state operations (permitting complexity)
- Sufficient scale for automation ROI (generally 50+ employees or $10M+ revenue)
- Active fiber deployment or expansion in pipeline

### Segment Pass Rates (from FC2026 data)

| Segment | Pass Rate | Why |
|---------|-----------|-----|
| A&E / Design Firms | 70% | Direct buyers. GIS-to-CAD workflow pain. |
| Fiber Operators / ISPs | 64% | Multi-municipality permitting. BEAD pressure. |
| Construction Contractors | 50% | Crews idle waiting on drawings. Multi-state ops. |
| Equipment Manufacturers | 0% | Wrong segment. Sell physical products. |
| Software / Platform Vendors | 0% | Competitors or adjacent. |
| Municipal / Co-op Operators | 20% | Usually too small, single jurisdiction. |

### What HOLDS

- Plausible fit but thin evidence (small companies, limited web presence)
- Gmail/personal email addresses (not corporate domain)
- Title unclear (bare "VP" with no function)
- Company does fiber work but scale is uncertain

### What REJECTS

- Equipment manufacturers/distributors
- Software/platform vendors (competitors)
- Staffing, insurance, education companies
- Construction execution only (directional drilling, no design)
- Single-city municipal with outsourced network build
- Companies with no fiber/telecom design activity

### ICP Decision: source_class

Two tracks that drive different messaging:
- **fiber_operator** -- builds and operates fiber networks
- **ae_firm** -- provides architecture/engineering services for fiber

---

## §3 Persona Classification

### 7-Bucket Cascade (first-match applied)

| Bucket | Who fits | Email angle |
|--------|----------|-------------|
| `build_pace` | Dir Ops, Plant Ops, Field Eng at operators or contractors | Idle crews, construction schedule, throughput |
| `drawings_quality` | SVP Design, Dir Engineering at A&E firms | Permit first-pass rates, drawing QC, rework |
| `permit_cycle` | Permitting leads, regulatory affairs | Jurisdictional variation, cycle time |
| `program_leverage` | Program Directors, PMO roles | Multi-state coordination, program view |
| `cycle_time_exec` | CEO, CTO, VP, CoS, President | Strategic scale, economics, growth constraint |
| `capital_efficiency` | SVP Finance, Dir Finance | Rework cost, margin impact, cost per drawing |
| `pass_through` | VP Sales, BD, Account Directors | Client delivery, on-time commitments |
| `connect_request` | Marketing Director, non-buyer roles | Intro request to engineering buyer (only if sole contact) |

**Critical rule:** Persona classification is for GATING and QA only, NOT composition. Emails are research-driven, not template-driven. The persona confirms the angle is right; it does not generate the angle.

---

## §4 Email Composition

### V3 Insight-Led Approach (approved format)

What changed from V1/V2: Every V2 email opened with "AE name with Inorsa" and described the product the same way. V3 opens with the prospect's operational reality. Inorsa appears once per email, described by outcome. Each email uses a different structural approach.

### 8 Influence Patterns (from influence.ts)

| Pattern | When to use | Example |
|---------|-------------|---------|
| `challenger_insight` | C-suite, sophisticated buyers | "Most multi-state builders don't realize their per-drawing cost varies 3x..." |
| `commitment_consistency` | AE notes capture a specific request/interest | "You asked about the demo at the booth. I have it ready." |
| `competitive_displacement` | Known competitor tool in use | "You mentioned an Nvidia tool. It's solving a different problem." |
| `curiosity_gap` | Silent visitor, no booth notes, strong research | "I was looking at your BEAD application. One thing jumped out." |
| `loss_aversion` | External deadline (BEAD, board, funding tranche) | "BEAD construction deadlines start Q4..." |
| `social_proof` | Peer-dense industry | "Three fiber contractors your size automated this quarter." |
| `reframe_anchor` | Prior relationship, old objection, company changed | "Pricing was the sticking point. But your volume changed." |
| `reciprocity` | Research uncovered something useful regardless of sale | "Found something your engineering team might find useful." |

### Anti-AI-Tell Checklist (enforced on every email)

- NO "I'm curious..." or "Curious whether..." (Claude fingerprint)
- NO "Happy to..." or "I'd love to..." (AI hedge)
- NO "I hope this finds you well" or any pleasantry opener
- NO perfect parallel structure across paragraphs
- NO transition words (Furthermore, Additionally, Moreover)
- NO more than 2 sentences in any paragraph
- VARY sentence length: mix short punchy (3-5 words) with medium (10-15)
- USE at least one sentence fragment or informal construction
- START one sentence with "And" or "But" (humans do this)
- USE contractions AI avoids: "wouldn't" "couldn't" "shouldn't" over "would not"
- NO em-dashes in prospect-facing copy

### Hard Constraints

- Under 80 words (body only, not counting subject/signature/PS)
- One specific question per email the recipient would actually want to answer
- Subject line: under 8 words, specific to their situation, not salesy, lowercase okay
- Salutation: strictly `[FirstName],` (comma only, NO greeting word -- no Hey, Hi, Hello, Dear)
- Sign off as AE: `[AE Name] | Inorsa | [ae_email]`
- P.S. required for T1 and T2. Now standardized as microsite link: `P.S. Put together an overview of how this applies to [Company]: https://fiber.inorsa.com/brief/[slug]`

### Touch Sequencing

| Touch | Timing | CTA Type | Goal |
|-------|--------|----------|------|
| T1 | ASAP | Interest-based ("Is this relevant?") | Get a reply |
| T2 | T1 + 5 days | Soft time ("Worth 20 minutes?") | Advance to meeting |
| T3 | T2 + 5 days | Binary close ("Worth a look, or not the right time?") | Yes or polite no |

T1 and T2 MUST use different influence patterns. T3 is always short binary close.

### Key Insight: JTBD for Research, NOT Composition

Design Thinking / pains/gains/JTBD is excellent for understanding what the prospect needs. But it is a product design framework, not a persuasion framework. When you use JTBD to write the email, you get product-out copy that sounds like a brochure. Use JTBD for research; use influence patterns for composition.

---

## §5 Quality Gates

### 4-Dimension Judge (from judge.ts)

Each email scored 1-10 on four dimensions. All must be >= 7 to pass.

| Dimension | What it measures | Score guide |
|-----------|-----------------|-------------|
| **Research depth** | Is the claim grounded in evidence? Could NOT be said about any random fiber company? | 1-3 generic, 4-6 somewhat specific, 7-10 clearly researched |
| **VP connection** | Links identified need to SPECIFIC Inorsa capability? Not "we can help" but "your X maps to our Y"? | 1-3 no connection, 4-6 vague, 7-10 specific and defensible |
| **Tone** | Would an experienced AE send this themselves? Peer-to-peer, not salesy? | 1-3 obviously AI, 4-6 acceptable but generic, 7-10 feels like a real person |
| **Conciseness** | Under 80 words? One question? No filler? Subject under 8 words? | 1-3 bloated, 4-6 trimming needed, 7-10 tight |

Verdicts: send (all >= 7), hold (any 5-6, fixable), reject (any <= 4, rewrite)

### Additional Checks (operator/Tim applied)

- No em-dashes anywhere in prospect-facing copy
- Pitch verbatim compliance (see §7)
- AE signature matches assigned AE territory
- P.S. links to correct personalized microsite slug (not company-level for multi-contact companies)
- No feature claims beyond SoT scope (see §7)
- No tower/cellular/Harmoni references in fiber outreach

---

## §6 HubSpot Loading Protocol

### Confirmed via Breeze AI (2026-05-30)

**Safe loading sequence:**
1. Extract domain from contact email
2. Search HubSpot companies by `Company domain name`
3. If company exists: capture company ID. DO NOT create duplicate.
4. If company doesn't exist: create company with name + domain + `showrev_*` fields. Capture ID.
5. Create contact with `showrev_*` fields
6. Explicitly associate contact to company by ID via Associations API

**Before loading:** Turn OFF "Create and associate companies with contacts" setting in HubSpot (Settings > Objects > Companies). Prevents auto-creation of duplicate companies. Turn back on after.

**Dedup key:** Domain, not company name. "Booker Engineering" vs "Booker Engineering, LLC" does not matter -- `bookereng.com` is the match.

### Contact Fields to Set

| Field | Value |
|-------|-------|
| firstname, lastname, email, jobtitle | From prospect data |
| hubspot_owner_id | AE ID (Mike=89105202, Nathan=89105203, Lucas=163468117) |
| lifecyclestage | `1162148264` (= "Prospect", NOT "lead") |
| showrev_engagement_slug | `inorsa-fiberconnect-2026` |
| showrev_pilot_owner | `true` |
| showrev_research_summary | From dossier |
| showrev_microsite_url | `https://fiber.inorsa.com/brief/[slug]` |
| showrev_challenger_insight | From dossier |
| showrev_persona_classification | core_icp / exec_tier / wrong_persona |
| abm_play (Company) | `ABM 1:Few` (existing field, Chris's preference) |

### Existing vs New Contacts

For contacts that ALREADY exist in HubSpot:
- DO set: `showrev_*` fields only (PATCH, not overwrite)
- DO NOT set: `hubspot_owner_id`, `lifecyclestage`, `hs_lead_status` (leave existing values)

For NEW contacts:
- Set everything including owner and lifecycle stage

### Owner-Inherit Workflow

HubSpot has a Workflow that auto-sets Contact Owner = Company Owner ~12 seconds after creation. Strategy: create companies FIRST with correct AE as owner, then contacts inherit automatically. No need to fight the Workflow.

### Properties to Create (2 new)

- `showrev_microsite_url` (Contact, single-line text)
- `showrev_challenger_insight` (Contact, multi-line text)

### Properties to Reuse (2 existing)

- `abm_play` (Company, dropdown -- already has "ABM 1:Few")
- `showrev_ae_talking_points` (Contact, multi-line text)

### Inorsa Portal Details

- Account ID: 20729069
- Portal: app-na2.hubspot.com
- AE Owner IDs: Mike Rutski=89105202, Nathan Dunn=89105203, Lucas Spencer=163468117, Justyn=163879239
- Tom Marciano=1586667974 (DETECT only, never SET)
- Chris Balandran=78301143 (DETECT only, never SET)

---

## §7 Operator Constraints (hard rules)

### Pitch Verbatim (locked)
> "We convert GIS design data into CAD-ready construction drawings. Quality control is built in, so builds keep moving."

Do NOT paraphrase in prospect-facing copy.

### Sender Rules
- AE senders: Mike Rutski (East), Nathan Dunn (Central), Lucas Spencer (West/spread)
- Tom Marciano = INERT. Booth asset only. NEVER a sender. NEVER a From name.
- Default for unassigned territory = Lucas

### Value Prop Scope
- Drawings only (Engineering Suite + Data Suite)
- NO Validation Suite claims for fiber
- NO structural analysis (tower-side only, Harmoni product)
- Fiber only. NO tower, NO cellular, NO Harmoni references in fiber outreach

### Copy Rules
- Salutation: strictly `[FirstName],` (comma only, no greeting word)
- No em-dashes in prospect-facing copy
- No pricing numbers in emails
- Only reference integrations that match the prospect's known stack
- Use Chris's 2-step framing (Ingest + Generate) for T1, not full 3-suite architecture

### Show Facts
- Show: Fiber Connect (TWO words, not one)
- Dates: May 18-19, 2026 (Mon-Tue). May 17 = setup day.
- Location: Gaylord Palms Resort, Kissimmee FL
- Booth: 1728

---

## §8 Tim's Rules (operator-ratified 2026-05-30)

### Contact Loading Rules
- OK to add NEW contacts regardless of activity level
- If existing Contact or Lead in HubSpot: do NOT duplicate
- For contacting them: if there is active communication, DNC
- If no communication: SEND

### Non-ICP Contact Rule
- Only email non-ICP personas (marketing, admin) when they are the ONLY contact at that company
- When ICP contacts exist at the same company, skip non-ICP contacts entirely
- Even when sole contact: admin assistants and social media managers never receive outreach

### AE Coordination
- Contacts at heavily worked accounts (B+T GRP, Dycom, TAK, Terracon) require AE coordination before outreach
- Check `hs_sales_email_last_replied` for recent activity before setting to SEND

---

## §9 Engine Code Reference

The pipeline code lives in `src/showrev/m1-email-find/`:

| File | Purpose | Status |
|------|---------|--------|
| `importer.ts` | CSV parse, dedup, clean, tier | Working, needs tier logic update |
| `researcher.ts` | Hypothesis-driven research via `claude -p` | Working, v1 single-agent |
| `personas.ts` | 3 STORM personas + cross-examination | Built, not wired to pipeline.ts |
| `influence.ts` | 8 influence patterns + signal mapping + composer prompts | Built, wired to premium-pipeline.ts |
| `composer.ts` | v1 email composition | Working, but uses v1 format (not v3 insight-led) |
| `judge.ts` | 4-dimension quality gate | Working |
| `judges.ts` | Extended judging system | Built |
| `premium-pipeline.ts` | Full premium: STORM + influence + anti-tell | Built, the correct pipeline to use |
| `dossier-schema.ts` | HubSpot property schema (sr_ prefix) | Built, prefix needs update to showrev_ |
| `verify-emails.ts` | Email verification | Built |
| `verify-facts.ts` | Fact verification | Built |
| `pipeline.ts` | v1 pipeline runner | Working but uses v1 approach |

**Key gap:** `premium-pipeline.ts` is the correct pipeline but uses `claude -p` for execution. The v3 email format (insight-led, no AE opener, Inorsa described by outcome) was developed in conversation AFTER this code was written. The composer prompts in `influence.ts` are close but need updating to match the final approved format.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 01:30 | Claude | Initial canonical methodology. Extracted from 60MB session transcript + 12 engine code files + brain synthesis + approved v3 emails + SoT doc + persona classification. |
