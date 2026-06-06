---
title: Persona Profiles — Mined from First-Party Substrate
status: DRAFT
last_updated: 2026-06-03
version: v1
purpose: Role-by-scale persona profiles derived from podcast transcripts, industry expert blogs, and cost reports. Supplements the JTBD matrix with "how people in this role at this size company actually talk about their problems."
sources: sr_brain_substrate (6,512 chunks — CBB transcripts, Fiber for Breakfast, Dawson blog, Cartesian report)
---

# Persona Profiles from First-Party Substrate

## ICP 1: Fiber Operators

### Persona: CEO / GM at Small Operator (< 50 employees, single-state)

**Examples from substrate:**
- Sean Fitzgerald (Whip City Fiber): Hired professional marketing research firm before building. Customer satisfaction driven.
- Derek Barr (Hardy Telecommunications, WV): Nonprofit cooperative since 1953. "The bigger players just wouldn't come in."
- Multiple cooperative GMs across CBB episodes: Running fiber builds as an extension of electric utility operations.

**In their words:**
- "It is a significant capital construction cost" — Aaron Bean, Operations Manager, Whip City Fiber (on the challenge of pilot projects with fixed costs)
- "We're hoping to bring some small businesses back here... each customer has a different need" — municipal fiber manager on community impact

**What they care about (by priority):**
1. Justifying the capital investment to their board/community
2. Construction timeline predictability — they promised dates to their community
3. Finding and retaining engineering talent locally (can't compete on salary)
4. Permitting in their local jurisdictions (they know their counties but struggle with volume)

**JTBD mapping:** JTBD 5 "Keep crews moving" + JTBD 3 "Make BEAD economics work"

**Scale insight:** Small operators don't have internal engineering teams. They rely entirely on A&E firms. The pitch is NOT "automate your drafters" — it's "get your drawings faster so your contractor can build on schedule."

---

### Persona: Program Director / VP Engineering at Mid-Large Operator (100-1,000+ employees, multi-state)

**Examples from substrate:**
- Len DeWees (multi-state A&E, Program Director): "Profitability at BEAD-funded rates (20 to 30 cents per linear foot) is the core objective." Asked about utility GIS layer ingestion. [Sales thread]
- Virginia broadband director: 200,000+ locations, 90% state coverage. "First time the Commonwealth will directly contract with internet service providers." [Fiber for Breakfast]
- Oklahoma broadband director: "$53 million in middle mile projects." Managing tribal coordination + BEAD awards. [Fiber for Breakfast]
- Fidium exec: "Predictability of speed to build and cost to build. We could literally build a town within four to six months." [Fiber for Breakfast]

**In their words:**
- "Jurisdictional revisions tied to right-of-way placement and inaccurate GIS reference data are your biggest source of rework" — prospect call recap
- "Predictability of speed and cost versus, you know..." — Fidium exec, trailing off (the alternative is unpredictable)

**What they care about (by priority):**
1. BEAD profitability at funded rates
2. Permit throughput across jurisdictions
3. Schedule predictability — committed timelines to state broadband office
4. Workforce — "the prices for labor is going to go up, and nobody's going to be able to keep staff" (Dawson)

**JTBD mapping:** JTBD 5 "Stop the kickback cascade" + JTBD 3 "Make BEAD economics work" + JTBD 4 "Standardize across markets"

---

### Persona: CFO / Finance Director at Operator (any size)

**Examples from substrate:**
- Danny Pate (customer VP Engineering): "Our CEO/CFO have come to the unfortunate conclusion that the cost is too high and will have a direct impact on EBITDA since we can't capitalize any of it." [Sales thread]
- Dawson blog: "For most of the last decade, the budgeting process was relatively easy... That's not true anymore."
- Cartesian: "92% of respondents reported cost increases in 2025... 88% expect costs to rise again in 2026"

**In their words:**
- "The cost is too high and will have a direct impact on EBITDA" — actual buyer objection
- "Can you manage any of this work as a professional service? Then we can capitalize it" — buyer attempting a workaround

**What they care about:** EBITDA impact, predictability, ROI quantification, GAAP treatment.

**JTBD mapping:** JTBD 3 "Make BEAD economics work" exclusively.

**Scale insight:** Matters MORE at PE-owned or publicly traded companies. At a small cooperative, finance just needs budget fit. At PE-backed: EBITDA is existential.

**NOTE:** Not in our current persona buckets. JTBD matrix flagged gap: "Consider adding finance_ops persona."

---

## ICP 2: A&E Firms

### Persona: Principal / CEO at Small A&E Firm (10-50 employees)

**Examples from substrate:**
- Spencer Kariniemi (GM, Booker Engineering, ~20 people): Reached out INBOUND: "That was a well timed interaction... about 10 minutes after I got a message from my team saying they wanted more info on automated basemap drafting." [HubSpot thread]

**In their words:**
- "Wanted more info on automated basemap drafting" — Spencer (THEIR language for what Inorsa does)
- "People who may have a few folks who are good at it. Those people are going to be offered 50,000 more dollars a year, and they're going to leave." — Dawson on small firm talent retention

**What they care about:** Winning contracts, retaining talent, throughput, proof of capability.

**JTBD mapping:** JTBD 2 "Scale without hiring" + JTBD 7 "Win the BEAD bid"

**Scale insight:** Most receptive to automation — they KNOW they can't hire their way to scale. Pitch is "bid on work you couldn't handle before." (For large A&E: efficiency/margin. For small: ACCESS to larger contracts.)

---

### Persona: VP Engineering / Engineering Manager at Mid-Large A&E Firm (100-500+ employees)

**Examples from substrate:**
- Indus CAD (200+ employees, offshore): Uses i2GO for GIS. Manual workflow confirmed at booth. [Booth transcript]
- Troy Hoover (PCCI/ProDesign, 27 CAD drafters): Large-scale city redesigns. AutoCAD through 3GIS. [ShowRev email]
- Cyient (Robert Erdelen): "Multi-carrier OSP programs all hit the same wall: GIS designs move fast, but converting to construction-grade AutoCAD remains manual, slow, and different for each client's drawing standard." [Nathan email]

**In their words:**
- "We've never contracted with fiber engineers before... We don't have that capability, so we are relying totally on them" — Westminster PPP leader (operator perspective on A&E dependency)

**What they care about:** Margin protection, multi-client standardization, offshore coordination, client retention.

**JTBD mapping:** JTBD 2 "Scale without hiring" + JTBD 4 "Standardize across clients" + JTBD 6 "Protect client relationships"

**Scale insight:** Mid-large firms have capacity. Problem is EFFICIENCY not ACCESS. Pitch is margin improvement, not capability access.

---

## ICP 3: Contractors

### Persona: Project Manager / Operations Director at Construction Contractor

**In their words (inferred — thin data):**
- Contractors discussed through the lens of operators who hire them, not as direct podcast guests
- "We had a solid six months where we couldn't do anything, because... the fiber shortage" — Westminster PPP leader on contractor impact

**What they care about:** Drawings ready when crews arrive. Permit approvals matching schedule. Rework from field changes.

**JTBD mapping:** JTBD 5 "Keep crews moving" exclusively.

**Scale insight:** Contractors are DOWNSTREAM — they receive drawings, don't produce them. Inorsa helps indirectly. Direct sales to contractors less common; primary path is through operator or A&E firm.

**NOTE:** Thinnest persona data. Podcasts feature operators and policy people, not contractors. Job postings would be a better source.

---

## Summary Table: Role x Scale x Primary JTBD

| Role | Small (< 50) | Mid (50-500) | Large (500+) | Primary JTBD |
|------|:---:|:---:|:---:|---|
| **Operator CEO/GM** | Access to engineering resources | BEAD profitability | Portfolio standardization | 3 (BEAD economics) |
| **Operator VP Engineering** | Speed of delivery | Permit throughput + schedule | Multi-jurisdiction standardization | 5 (Stop kickbacks) + 4 (Standardize) |
| **Operator CFO/Finance** | Budget fit | EBITDA impact | CAPEX/OPEX treatment | 3 (BEAD economics) |
| **A&E Principal/CEO** | Win contracts can't staff | Margin protection | N/A (they ARE competition) | 7 (Win BEAD bid) + 2 (Scale) |
| **A&E VP Engineering** | Throughput | Quality + standardization | Offshore coordination | 2 (Scale) + 6 (Protect clients) |
| **Contractor PM** | Drawings on time | Drawings at volume | Drawings across many projects | 5 (Keep crews moving) |

## Gaps

| Gap | How to fill |
|-----|-------------|
| **Contractor voice** | Job postings for construction companies; contractor trade publications |
| **Large A&E exec voice** | Older Fiber for Breakfast episodes; Dawson blog references to Mastec/Quanta/Dycom-scale firms |
| **Finance persona depth** | Only one real example (Danny Pate); need more CFO conversations |
| **Role-specific language** | We know VPs talk differently than PMs but haven't quantified differences |

---

## Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1 | 2026-06-03 | Claude | Initial profiles from 6,512 substrate chunks. 6 personas, 3 ICPs, role x scale x JTBD matrix. |
