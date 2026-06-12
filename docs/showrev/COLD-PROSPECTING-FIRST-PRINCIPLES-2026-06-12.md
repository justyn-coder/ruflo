---
title: Cold Prospecting — First Principles Synthesis (operator-directed strategic pivot)
date: 2026-06-12
status: DRAFT for external judge panel
purpose: Step back from tactical execution. Synthesize what we've learned. Architect for elite-tier cold prospecting (target = top 0.01% B2B SaaS AEs).
authored_by: Claude (Opus 4.7, operator-directed all-night thinking session)
operator_directive: |
  "take your time. think about what we built, how we built it, where the
  information came from. classify it even, direct information from
  government or podcast, etc. vs. something in a blog or media. Build
  different levels of trust maybe... Anyway, just break this problem down
  into first principles."
---

# The strategic pivot

We started the night to ship a 15-prospect smoke test tomorrow morning. By midnight, we discovered:

1. **Tim approved 100% of email craft** — but Tim doesn't see facts.
2. **MillionVerifier validated all email deliverability** — but MV doesn't see persona/company identity.
3. **The composer pulled "facts" from substrate** — but substrate had contaminated sources (ZoomInfo, LeadIQ), hallucinated inferences ("active M&A mode"), wrong attributions (1.3M passings ≠ Greenlight alone), and one URL fetch revealed Yelp blocked, t-mobile.com bot-blocked, investor.shentel.com timing out.
4. **Gemini 2.5 Pro fast-verification said 4 emails were FALSE** — but Deep Research overturned 2 of those (Frontier's numbers were actually correct, just from Q2 2025 not Q1 2024).
5. **Deep Research flagged "synthetic personas"** — but the operator clarified: persons came from the FBA Fiber Connect 2026 attendee list. They self-identified. Web search can't find Anthony Jelniker at Great Plains because he just transitioned from Comcast 3 years ago. The attendee list is ground truth.

This is a substrate quality + trust-tier problem, not a fake-people problem.

**Operator-stated goal:** Better cold prospecting than the top 0.01% of B2B SaaS AEs.

This document is the first-principles re-architecture for that goal.

---

# Section 1 — What we ACTUALLY built tonight (cataloging)

## The pipeline that almost shipped tomorrow

```
Attendee list (FBA Fiber Connect 2026)           ← TIER 0 (self-attestation, authoritative)
    ↓
Email-finder + MV verification                   ← TIER 0 mechanical (deliverability)
    ↓
DNS posture (SPF/DKIM/DMARC)                     ← TIER 0 mechanical (sender reputation)
    ↓
Per-company web research (Gemini, Perplexity)    ← TIER ??? — no classification existed
    ↓
sr_company_evidence + sr_engine_output           ← Substrate, mixed quality
    ↓
Composer (LLM extracts claims → email body)     ← Trusts substrate fully, no verification
    ↓
Tim review (craft / voice / length)              ← Voice approved, facts not seen
    ↓
HubSpot loader (writes contact properties)       ← Mechanical
    ↓
Sequence enrollment (AE-triggered)               ← Sender identity preserved
    ↓
Send window (8-10am / 6-9pm contact local)       ← Per persona/window strategy
    ↓
Bounce monitor (Component 4)                     ← 5% hard-bounce halt
    ↓
Watcher (engagement events → sr_outcomes)        ← Reply / open / bounce / meeting tracking
    ↓
Brain (currently underutilized)                  ← Where this should close the loop
```

## The 5 systems we trust today (mechanical, well-defined)

| System | What it validates | Trust level |
|---|---|---|
| **FBA attendee list** | Person ↔ Company mapping (self-attested at registration) | ✅ Authoritative |
| **MillionVerifier** | Email deliverability via SMTP probe | ✅ Mechanical, deterministic |
| **DNS verification** | SPF/DKIM/DMARC compliance for inorsa.com | ✅ Mechanical |
| **HubSpot sequences** | Send mechanics, bounce tracking, unsubscribe | ✅ Mechanical |
| **Tim craft review** | Voice/length/tone — "sounds human, not AI" | ✅ Authoritative on voice ONLY |

## The 1 system we DON'T trust tonight (where this all broke)

| System | What it tries to validate | Trust level |
|---|---|---|
| **Substrate research → composer claim injection** | Per-prospect company facts that get put in email bodies as specifics | ❌ Heterogeneous quality, no tier classification, no verification gate |

This is where the 4 FALSE / 11 UNKNOWN findings live. The whole night's drama traced back to this single layer being un-architected.

---

# Section 2 — Information source classification (the trust tier framework)

## Foundational principle

> Every factual specific in a cold email implicitly claims authority. The recipient instinctively asks: "How do they know that?" — and if the answer is fuzzy, trust collapses.

We need to **classify every claim by source provenance** before the composer is allowed to use it.

## The proposed Trust Tier Framework

| Tier | Source class | Examples | Trust property |
|---|---|---|---|
| **T0** | Direct human attestation | Operator, AE, prospect themselves at registration | **Authoritative** — by definition |
| **T1** | Subject's own primary corporate communication | Company website (.com), press releases ON company domain, official investor relations pages, SEC filings, annual reports, official social posts | **Authoritative** — the entity speaking about itself |
| **T2** | Government / regulatory disclosure | SEC 10-K/10-Q, FCC broadband data filings, BEAD subgrantee applications (NTIA-published), USDA ReConnect awards, state PUC filings, court records, FOIA-released documents | **Authoritative** — externally verified by regulators |
| **T3** | Recognized industry trade press with named bylines | Telecompetitor (with author), Light Reading, Fierce Telecom, BBCMag, Fiber Broadband Association reports, NTCA publications | **Strong** — professional journalism, industry-vetted |
| **T4** | Press release wires (verified press releases, not paid placements) | PRNewswire, BusinessWire, GlobeNewswire, BusinessGov Newswires | **Strong** — corporate-issued releases, but vendor channel |
| **T5** | Conference transcripts with named speakers | Investor day transcripts, named-speaker conference recordings on .gov/.edu domains, podcasts with named/attributed speakers | **Moderate** — words attributable to named individual |
| **T6** | General business news (mainstream press) | Reuters, Bloomberg, WSJ, NYT, AP — when story-of-record on a company | **Moderate** — independent journalism but not industry-specific |
| **T7** | Blogs, opinion, secondary commentary | Substack, Medium, LinkedIn posts (non-corporate), community forums, analyst opinion pieces | **Weak** — sometimes useful for color, never for hard claims |
| **PROHIBITED** | Email-pattern / lead-data sites | ZoomInfo, LeadIQ, Apollo, RocketReach, Prospeo, Hunter, Cleanlist, ContactOut, Mailmo, Snov, Kaspr, Lusha, SalezShark, Datanyze, Cognism, Seamless.ai | ❌ **Never** — aggregated stale data, often hallucinated, presents itself as authoritative |
| **PROHIBITED** | User-generated platforms without verification | Yelp, generic wiki pages, anonymous social posts, AI-summary sites (Perplexity output reused as source, etc.) | ❌ **Never** as primary source |

## Tier-based composer behavior

| Source tier | Composer permission |
|---|---|
| T0 | Always usable, full sentences |
| T1 / T2 | Always usable as specific quoted facts |
| T3 / T4 | Usable as factual claims, must be < 90 days old |
| T5 | Usable as attributed quotes ("CEO Jim Volk said at Morgan Stanley conference") |
| T6 | Usable as factual context but cited generally |
| T7 | NOT usable as claim source. May inform industry framing only. |
| PROHIBITED | Never. If substrate links here, claim is auto-rejected. |

## What this means for tonight's findings

| Prospect | Original source | Tier | Should have been used? |
|---|---|---|---|
| Dara Leslie | investor.shentel.com (CFO conference) | T1 + T5 | ✅ Yes |
| Doug Spurlin | newsroom.frontier.com + verizon.com | T1 | ✅ Yes |
| Aamer Abbasi | lytefiber.com press release | T1 | ✅ Yes |
| Brendan Karchner | buckeyebroadband.com + natlawreview.com | T1 + T3 | ✅ Yes |
| Anthony Jelniker | globenewswire.com + telecompetitor.com | T3 + T4 | ✅ Yes |
| Michele Sadwick | t-mobile.com JV announcement | T1 — but **wrong attribution** (JV total ≠ Greenlight) | ⚠️ Source valid, composer misread |
| Casey Worth | communitynetworks.org (community-broadband-bits transcript) | T5 — but **9 years old (2017)** | ⚠️ Source valid, but staleness issue |
| Gabriel Gilliland | themountainbuzz.com | T6/T7 (local press, content didn't fully match) | ⚠️ Marginal |
| **Zack Burnes** | **zoominfo.com** | **PROHIBITED** | ❌ Never |
| **Ben Lewis-Ramirez (role)** | **leadiq.com** | **PROHIBITED** | ❌ Never |
| **Jesus Loya (headcount)** | **leadiq.com** | **PROHIBITED** | ❌ Never |
| Ben Lewis-Ramirez (Vistal) | inforum.com | T6 (local business news) | ✅ Yes |
| Issac Roehm (Velocity) | ideatek.com | T1 | ✅ Yes |

**Of 15 prospects, 3 had PROHIBITED sources that should never have made it through. 2 had sources misinterpreted by composer (Michele's JV attribution, Gabriel's content mismatch). 10 had defensible sources.**

The system was 73% correct by source-tier audit. That's not good enough for elite tier. We need 95%+ T0-T5 source provenance.

---

# Section 3 — Pipeline failure modes (root cause analysis)

## Failure mode #1: No source tier at substrate-load time

**Where it failed:** Web research stored claims with citations but no tier classification.

**Why it failed:** The pipeline was designed when "having a citation" was the bar. We didn't realize citations from ZoomInfo and LeadIQ are functionally fictional.

**Fix:** Tag every `sr_company_evidence` row with `source_tier` (T0-T7 or PROHIBITED). Composer reads tier, rejects PROHIBITED, downgrades T7.

## Failure mode #2: No claim verification between substrate and composer

**Where it failed:** Composer trusted substrate fully. If substrate said "1.3M passings for Greenlight," composer wrote it into the email verbatim.

**Why it failed:** No gate between "research found this" and "composer can use this."

**Fix:** Add `sr_claim_verifications` table. Every claim gets a verification status: PRIMARY-SOURCE-VERIFIED / DEAD-URL / CONTENT-MISMATCH / CONTAMINATED. Composer reads only `PRIMARY-SOURCE-VERIFIED` claims.

## Failure mode #3: No content-match check

**Where it failed:** Substrate stored `claim` text and `source_citation` URL — but never validated that the URL's content actually contains the claim.

**Why it failed:** The "trust the LLM citation" assumption. LLMs hallucinate URLs.

**Fix:** URL-fetch + content-match check at substrate-write time. The audit-15-citations-v2.py script demonstrates this works: with browser headers + Wayback fallback, we can verify most claims.

## Failure mode #4: No staleness check

**Where it failed:** Casey Worth's "2.4 homes/mile" cite from 2017 podcast. United Fiber may have changed since. Doug Spurlin's claim was from Q2 2025 — 11 months old. Acceptable but staleness varies.

**Why it failed:** No `claim_first_seen_at` or `source_publication_date` field.

**Fix:** Add `source_date` to each citation. Composer rejects claims older than 90 days for tier T3+ (operator-tunable per tier).

## Failure mode #5: No composer-level audit pre-send

**Where it failed:** Composer produced emails with FALSE attributions ("Greenlight's 1.3M" was actually JV total) and inference language ("active M&A mode") that wasn't in any source.

**Why it failed:** No final-pass review of "does the email match what the substrate actually says?"

**Fix:** Final composer pass requires every specific factual claim in the body to map to a `sr_claim_verifications` row marked VERIFIED. Inference-language claims (modifiers like "active mode," "real pressure") need separate audit — these aren't facts, they're sender editorializing.

## Failure mode #6: No source domain blocklist enforcement

**Where it failed:** Composer pulled ZoomInfo and LeadIQ as primary sources for 3 prospects without flagging.

**Why it failed:** No `prohibited_source_domains` list enforced anywhere in pipeline.

**Fix:** Hard-coded blocklist in substrate write + composer claim selection. Build once, check everywhere.

## Failure mode #7: Brain function under-utilized

**Where it failed:** All this tonight's learning happened ad-hoc in Claude's context. None of it persists to operating knowledge.

**Why it failed:** "Brain" was scoped as substrate per-company, not as **operating principles + cold-email-craft knowledge + tier framework + composer rules**.

**Fix:** Brain hierarchy expands:
- L0 Universal: cold-email-best-practices + trust tiers + anti-patterns
- L1 Per-prospect substrate (already in sr_company_evidence)
- L2 Per-pattern learnings (reply rate by tier, by send window, by persona)
- L3 Composer rules (auto-derived from L2 over time)

---

# Section 4 — Elite cold prospecting framework (what the 0.01% do)

## Industry baseline (what most cold AEs do)

- 100-1000 emails/day automated
- Templated personalization ("Hi {firstname}, I noticed {company} is in {industry}")
- 1-3% reply rate (~50% from auto-responders/OOO)
- 0.1-0.3% meeting rate
- High burn rate, low conversion

## Top decile (better than 90% of B2B SaaS AEs)

- 30-60 emails/day curated
- Real research per prospect, real persona matching
- 5-8% reply rate
- 0.5-1.5% meeting rate
- Sustainable cadence, modest deal flow

## Top 0.01% (the operator-stated target)

- 10-30 emails/day **surgically targeted**
- Every specific is **verifiable, recent, and recipient-recognizable as accurate**
- 15-25% reply rate
- 3-6% meeting rate
- Trust compounds — referrals start emerging
- AE becomes recognizable name in the industry

## What the elite do differently (synthesis from research + tonight's learnings)

### 1. Surgical relevance

The elite **don't research broadly — they research the right thing.** A recent earnings call quote > a Wikipedia summary. A BEAD subgrantee award announcement > a "company size" guess from ZoomInfo.

Implication for our pipeline: tier-1 (company's own + government) sources dominate substrate. Tier-7 (blogs) almost never used. Composer can ask "what's the most authoritative thing this prospect said about themselves last 90 days?"

### 2. Confidence through demonstrable preparation

Recipients open emails that signal preparation. They reply to emails that **prove it** by referencing something specific only someone who paid attention would know.

Implication: We need 1 specific that's right + defensible + recipient-recognizable. The recipient should think "they actually read our earnings release."

### 3. Brevity earned by sharpness

Top performers write SHORTER emails than industry average. Sub-80 words. Subject line that signals value-density.

Implication: We're already shipping ~60-100 word emails. The new constraint is each word earning its place.

### 4. Asymmetric value upfront

Top emails give the recipient something before asking for anything. A specific insight. A relevant data point. A connection between two ideas they hadn't yet linked.

Implication: Our "drawings throughput" pitch becomes the gift — we're sharing a category-level insight that lands because we framed it for them specifically.

### 5. Time-respectful (calendar economics)

Elite cold emails take ~20-30 seconds to read and decide. If it asks for a 30-min meeting, it pre-justifies that ask with proportional evidence value first.

Implication: Our "Drop in for Office Hours" + "Choose a time" dual CTA respects this — low-friction alternative if 1:1 isn't right.

### 6. Test-and-learn rigor

Elite AEs A/B test relentlessly. Subject line patterns. Open vs closed CTAs. Persona vs vertical framing. Day-of-week. The 0.01% have **personally calibrated formulas** earned from 10,000+ sends.

Implication: This is where our Brain function shines. `sr_email_experiments` tracks every send. Brain learns: subject patterns, body structure, send window, persona alignment, source tier impact on reply rate. Over 6-12 months, our composer becomes empirically tuned to our specific buyer cohort.

### 7. Trust at scale (the meta layer)

The 0.01% don't just send better individual emails — they've built **sustainable sender identity**. SPF/DKIM/DMARC clean. Modest volume per inbox per day. Mostly unique content. Real signature with mobile number. Reply-to that actually replies.

Implication: We already have most of this (DNS verified, AE per-inbox sending, real signatures). The missing piece is consistent quality so we're not blacklisted by patterns over time.

---

# Section 5 — Proposed architecture: Trust-Tiered Composer

## The 5-layer rewrite

```
LAYER 1 — Source Acquisition (substrate research)
    All sources tagged with TIER classification at ingestion
    PROHIBITED list enforced at write time
    Citation includes: claim_text, source_url, source_tier, source_date, last_verified_at

LAYER 2 — Claim Verification (sr_claim_verifications)
    Per claim: URL fetch + content-match check
    Per claim: re-check every 30 days for staleness
    Verdict: VERIFIED / DEAD-URL / CONTENT-MISMATCH / CONTAMINATED / STALE
    Composer reads only VERIFIED + within freshness window

LAYER 3 — Composer (substrate-strict mode)
    Default behavior: industry framing only
    Specifics allowed: T0-T2 anytime, T3-T5 if < 90 days
    Inference language ("active mode", "real pressure") flagged for review
    Final pass: every specific claim mapped to a sr_claim_verifications row

LAYER 4 — Send Strategy (per persona, per window, per cohort)
    Day-of-week + window matched to persona (already designed: AM weekday for field ops, PM Sun for execs, etc.)
    Volume cap per AE per day (Day 1=20, Day 2+=30, ceiling=50) — already built
    A/B variants tracked in sr_email_experiments

LAYER 5 — Learning Loop (Brain function active)
    Reply rate by source tier
    Reply rate by persona × send window
    Reply rate by subject pattern
    Reply rate by inference language presence
    Composer rules auto-adjusted as data accumulates
```

## What stays the same

- Attendee list as persona/company ground truth
- MillionVerifier for deliverability
- DNS + sender reputation infrastructure
- HubSpot sequence mechanics
- Bounce monitor (Component 4)
- Watcher (Component 5)
- Send-cap (Component 6)
- Tim craft review

## What changes

- Substrate research adds tier classification + content-match verification
- Composer requires verified+fresh claims for specifics; otherwise industry frame
- Brain function actively tunes composer rules from outcome data
- Operator dashboard shows source-tier mix per send batch (audit trail)

## Database schema changes

```sql
-- New: source tier classification on existing substrate
ALTER TABLE sr_company_evidence ADD COLUMN source_tier TEXT;
ALTER TABLE sr_company_evidence ADD COLUMN source_date DATE;
ALTER TABLE sr_company_evidence ADD COLUMN last_verified_at TIMESTAMPTZ;

-- New: claim verification table
CREATE TABLE sr_claim_verifications (
  id BIGSERIAL PRIMARY KEY,
  claim_id TEXT UNIQUE NOT NULL,
  claim_text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_tier TEXT NOT NULL,
  source_date DATE,
  http_status INT,
  content_match BOOLEAN,
  match_distinctive_terms TEXT[],
  verdict TEXT NOT NULL, -- VERIFIED / DEAD-URL / CONTENT-MISMATCH / CONTAMINATED / STALE
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  next_recheck_at TIMESTAMPTZ
);

-- Index for composer lookup
CREATE INDEX idx_claim_verifications_verdict ON sr_claim_verifications (verdict);

-- New: prohibited source domains (operator-managed)
CREATE TABLE sr_prohibited_sources (
  domain TEXT PRIMARY KEY,
  reason TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Composer state machine (new)

```
For each prospect, when composing T1 body:

  Pull substrate evidence rows for company
  Filter: source_tier NOT IN PROHIBITED list
  Filter: verified_at within freshness window (90 days default, per-tier configurable)
  Filter: verdict = VERIFIED

  If 0 verified+fresh specifics remain:
    Compose with INDUSTRY FRAMING only
    Mark email metadata: specifics_count = 0
    Ship

  If 1-2 verified+fresh specifics:
    Compose with industry framing + selected specifics
    Specifics must be from highest available tier
    Mark email metadata: specifics_count, source_tiers_used
    Ship

  If >2 verified+fresh specifics:
    Pick top 2 by tier + recency
    Mark unused for future T2/T3 follow-ups

  Final pass: every numeric/named claim in body must map to sr_claim_verifications.id
  Inference language audit (modifiers like "active mode") flagged for human review
```

---

# Section 6 — Cross-model judge panel input

## Why send to external judges

Operator-directed: my own synthesis has blind spots. Different models will catch different gaps. Multiple perspectives → better architecture.

## Panel composition (per CLAUDE.md tool chain)

| Model | Role |
|---|---|
| Gemini Deep Research | Tonight's hero — fact verification anchor. Ask: did I miss any failure modes? |
| GPT-5 | Architecture review. Ask: is the trust tier framework sound? Are there missing tiers? |
| Grok | Adversarial perspective. Ask: where will this break at scale? |
| DeepSeek | International perspective + reasoning depth. Ask: are there elite cold prospecting practices I missed? |

## Standardized prompt for the panel

```
I'm architecting a cold email prospecting pipeline. Goal: better reply rate
than the top 0.01% of B2B SaaS AEs (target: 15-25% reply rate, 3-6% meeting
rate, sustainable over 1000+ prospects).

I've identified the root cause of recent failures: no source trust tier
classification in our substrate research pipeline. This led to composer
producing emails with FALSE specifics, contaminated sources (ZoomInfo,
LeadIQ), and inference language unsupported by primary sources.

I'm attaching my synthesis document (see file). Please review for:
1. Missing failure modes I haven't surfaced
2. Tier framework gaps (any source classes I missed?)
3. Architectural risks at scale (what breaks at 800+ prospects?)
4. Elite cold-prospecting principles I haven't captured
5. Composer state machine — any edge cases?

Be ruthless. The goal is the most defensible, scalable, learnable system
possible. I'd rather hear painful critique now than fail in production.

Specific questions:
- Are my source tiers the right level of granularity?
- Should there be a sub-classification within Tier 1 (company communication)?
- Is the composer state machine missing any escape hatches?
- Is the staleness rule (90 days) appropriate per tier?
- Where does the brain function close the loop most effectively?

Return: structured critique by section, with specific suggestions per finding.
```

## What we send + when we send

- Sent: ~3:30am ET to all 4 models in parallel
- Expected return: 30-90 min per model
- Synthesize feedback by 5am
- Revised plan by 6am

---

# Section 7 — OKRs (preliminary)

## Objective: Architect a cold email pipeline that achieves elite-tier reply rate (top 0.01% B2B SaaS benchmark) on the FC2026 cohort and scales to 800+ prospects without trust degradation.

### KR1 — Trust verification

- 100% of factual specifics in shipped emails map to a sr_claim_verifications row with verdict=VERIFIED
- 0 PROHIBITED-source citations in any shipped email
- < 5% of shipped emails have inference language (modifiers like "active mode") not supported by primary sources
- 95%+ of substrate sources tier T1-T5 (no T6/T7/PROHIBITED in default composer behavior)

### KR2 — Send quality

- Bounce rate < 3% on first-touch sends (Component 4 monitors)
- Spam complaint rate < 0.1%
- Meeting-booked rate > 3% on T1 (target: 5%+ steady state)
- Reply rate > 12% on T1 (target: 15-20% steady state)

### KR3 — Operating tempo

- 30-60 sends per AE per day (within Component 6 cap)
- Substrate refresh per company: every 30 days for active cohort
- Brain learning loop: pattern recognition updated weekly with outcome data
- Operator review cadence: daily dashboard, weekly retrospective

### KR4 — Empirical validation

- A/B test cycle: at least 2 active variants at all times (subject pattern, body structure, send window)
- Reply rate delta significance: p<0.05 before promoting winning variant to default
- Trust tier impact tracked: reply rate by source tier (T1 vs T2 vs T3 etc.) measured per quarter
- Inference language A/B: with vs without modifiers tracked

### KR5 — Brain function activation

- 100% of cold email learnings (best practices, anti-patterns, source classification, composer rules) documented in Brain L0
- Per-prospect substrate (L1) tier-classified at write time
- Per-pattern learnings (L2) auto-populated from sr_email_experiments + sr_outcomes
- Composer rules (L3) updated quarterly from L2 outcome data

## Timeline

| Phase | Deliverable | Date |
|---|---|---|
| **Tonight (Jun 11-12)** | This synthesis doc + judge panel sent | 6am Jun 12 |
| **Friday Jun 12** | Smoke test (current 18-contact batch, with strip-cleaned content) ships morning | 8-10am local |
| **Saturday Jun 13** | Judge feedback integrated → architecture v2 + start schema changes | EOD Sat |
| **Sunday Jun 14** | Wave 1 (60 prospects, all tier-classified, all verified) | 6-9pm local |
| **Mon-Wed Jun 15-17** | Trust tier framework in production. Composer state machine deployed. | EOD Wed |
| **Thu-Fri Jun 18-19** | First 200-prospect tier-1 cohort runs. Brain learning loop active. | EOW |
| **End-of-month Jun 30** | First OKR review. Reply rate measured. Brain pattern recognition reporting. | Jun 30 |
| **End of T1 program (~Jul 25)** | 800-prospect T1 sent. Reply rate hit > 12%. | Jul 25 |

---

# Section 8 — Open questions for the judge panel

1. **Tier granularity:** Is 7 tiers (T0-T7 + PROHIBITED) the right resolution? Should I sub-classify T1 (e.g., T1a = SEC filings, T1b = company press, T1c = corporate social)?

2. **Composer with no verified facts:** What's the floor of "industry framing only"? At what point does an email become so generic it stops being cold prospecting and becomes marketing? Where's the line?

3. **Cross-model verification:** Is Deep Research the only model that can do the verification gate? What's the redundancy plan if Google deprecates the Interactions API?

4. **Brain learning loop architecture:** How do I prevent the learning loop from over-fitting to early signal? (Premature optimization to a 10-reply sample.)

5. **Tier T7 (blogs) for color:** Can the composer use T7 sources for industry framing without quoting? (E.g., "Construction drawings are the biggest bottleneck in fiber buildouts" — sourced loosely from a Telecompetitor blog, not as a specific claim.)

6. **Operator manual override:** When operator has firsthand knowledge (T0), how does that flow into substrate? Need an `operator_attestation` table?

7. **Prospect-supplied data:** When a prospect replies and shares actual stats (e.g., "we're actually at 47K subscribers"), how does that update substrate? Closed loop?

8. **Scaling brand voice:** Tim approves 100% today. At 30/AE/day = 90 emails/day = ~30k/year, Tim can't review each. What's the auto-voice-check that maintains his standards?

---

# Section 9 — Fable 5 dual-path note (operator-flagged)

Operator suggested: try Fable 5 for autonomous project completion in parallel with my work.

Fable 5 (per CodeRabbit + Anthropic system card):
- Strong at low-detail prompts with environment discovery
- Run in harness like Claude Code → days of autonomous work
- Cost caveat: keeps working until harness cuts off
- Quality caveat: diligence failure mode (one round of optimization → "good enough")
- Need: hard stop rules + verification step in harness

Operator-proposed test:
- Same task (architect the trust-tier cold email pipeline)
- Give Fable 5 the same brief
- Compare outputs after similar time budget
- See whose architecture is more rigorous

This is operator's call to invoke separately. I'm not blocking on it.

---

# Section 10 — Action items for tonight (before AE morning ping)

| When | Task | Output |
|---|---|---|
| Now → 3:30am | Finalize this synthesis doc (this artifact) | docs/showrev/COLD-PROSPECTING-FIRST-PRINCIPLES-2026-06-12.md |
| 3:30am | Send to Gemini DR + GPT-5 + Grok + DeepSeek with judge prompt | 4 parallel API calls |
| 3:30am → 5am | Process tomorrow's 18-prospect smoke send (already loaded, content strip-cleaned earlier tonight) | Final roster + AE morning email drafted |
| 5am → 6am | Synthesize judge feedback | Architecture v2 markdown |
| 6am → 6:30am | OKR refinement based on judge input | OKRs v2 |
| 6:30am → 7am | Final status report for operator (in this doc + chat summary) | Operator wakes up to plan |

---

# Closing reflection

The operator's most important contribution tonight was the question that broke this open:

> "why does the composer need to be so specific as to explicitly say '334k passings/quarter' when it could just say something more general."

That question reframed everything. We weren't actually optimizing for "personalization." We were optimizing for "demonstrable preparation that the recipient can verify in 3 seconds." Most of the time, industry framing nails that bar. Only verified, recent, recipient-recognizable specifics earn the right to be included.

That changes the composer from "fact-stuffer" to "trust-architect." It changes substrate from "research dump" to "tier-classified evidence base." It changes the brain from "intuition store" to "empirical learning loop."

Tonight's smoke happens tomorrow. The architecture lives years.

Both matter. Both get done.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 02:15 EST | Claude (Opus 4.7) | Initial synthesis. Pre-judge-panel. |
