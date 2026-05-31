---
title: ShowRev Brain Architecture Specification
status: DRAFT
last_updated: 2026-05-29 14:16 EST
version: v1
---

# ShowRev Brain Architecture

## Purpose

The Brain is ShowRev's compounding intelligence layer. It takes raw research output and market signals, applies inference and pattern matching, and produces AE-ready intelligence that gets richer with every prospect, every show, and every client.

The Brain has one job: arm the AE with information their competitor's AE does not have.

## Three-Layer Knowledge Pyramid

```
        /\
       /  \  Layer 3: UNIVERSAL (ShowRev platform)
      /    \   Cross-client, cross-industry best practices
     /------\
    /        \  Layer 2: INDUSTRY (Fiber/Telecom US)
   /          \   Market dynamics, competitive intel, regulatory
  /------------\
 /              \  Layer 1: CLIENT/SHOW (Inorsa x FC2026)
/________________\   Prospect dossiers, AE interactions, outcomes
```

### Layer 1: Client/Show

The densest layer. Everything specific to one client selling into one market at one show.

**Contains:**
- Prospect-level dossiers (research, ICP gate, persona, influence pattern)
- AE interaction history (emails sent, replies, sentiment, meeting outcomes)
- What angles landed per segment (challenger insight vs social proof vs loss aversion)
- Conversion funnel data (email open, microsite view, booking, demo, proposal, won/lost)
- Client-specific product positioning that resonated
- Segment-level patterns (operators respond to X, A&E firms respond to Y)

**Populated by:** Research pipeline, HubSpot passive monitoring (12-month), microsite event tracking

**Feeds:** This client's next show outreach, ongoing AE selling

### Layer 2: Industry/Market

Market-level intelligence that applies to any client in the fiber/telecom space.

**Contains:**
- BEAD funding dynamics (state allocations, timeline shifts, regulatory changes)
- Competitive landscape (acquisitions, hiring patterns, market positioning)
- Industry event signals (earnings calls, press releases, job postings)
- Large-company bellwether signals and small-company inferences
- Seasonal patterns (show calendar, budget cycles, construction seasons)
- Regulatory changes affecting permitting and construction
- Technology adoption signals (new tools, platform migrations)

**Populated by:** Periodic market scan (web search + structured extraction), large-company disclosure monitoring, event-driven ingestion (articles, announcements)

**Feeds:** Any fiber client, any fiber show, prospect research enrichment

### Layer 3: Universal

Cross-industry outreach and sales intelligence.

**Contains:**
- Send timing optimization (day of week, time of day, days post-show)
- Subject line patterns (what structures get opened)
- ABM design conversion data (which microsite elements drive bookings)
- Hook and CTA frameworks (what question formats get replies)
- Email length and structure patterns
- Signature format effectiveness
- P.S. placement and framing patterns
- Sequence timing and branching logic

**Populated by:** Outcome data aggregated across all clients and shows

**Feeds:** Every future ShowRev project

---

## Supabase Schema

### Existing tables (already created, mostly empty)

```sql
-- Prospect-level data
sr_prospects          -- 6 rows (need to load remaining)
sr_dossiers           -- 0 rows (the Brain's primary output)
sr_emails             -- 0 rows
sr_microsites         -- 6 rows
sr_decision_trace     -- 0 rows
sr_fact_checks        -- 0 rows
sr_entity_resolution  -- 0 rows
sr_outcomes           -- 0 rows (HubSpot engagement sync)
sr_brain_patterns     -- 0 rows (pattern storage)
```

### New tables for the Brain

```sql
-- ============================================================
-- LAYER 1: Client/Show
-- ============================================================

-- Enhanced dossier: the full AE brief per prospect
-- This is the "cover to cover" document the AE reads before a call
CREATE TABLE sr_brain_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES sr_prospects(id),
  
  -- Identity
  company_name text NOT NULL,
  prospect_name text NOT NULL,
  prospect_title text,
  prospect_email text,
  
  -- Research intelligence
  company_summary text,           -- 2-3 sentences: what this company does
  company_size text,              -- employees, revenue if known
  fiber_activities text,          -- specific fiber/telecom work
  key_projects text,              -- named projects from research
  growth_signals text,            -- hiring, acquisitions, expansions
  bead_status text,               -- BEAD funding, state allocations
  external_deadlines text,        -- construction timelines, grant deadlines
  
  -- Competitive context
  known_tools text,               -- tools they use (AutoCAD, 3GIS, etc.)
  likely_competitors text,        -- who else is selling to them
  switching_signals text,         -- evidence of tool evaluation
  
  -- Inorsa fit
  icp_status text CHECK (icp_status IN ('pass', 'hold', 'reject')),
  fit_score text CHECK (fit_score IN ('strong', 'good', 'possible', 'weak')),
  fit_rationale text,             -- why they fit or don't
  persona_bucket text,            -- build / design_document / fund_capitalize
  
  -- AE intelligence
  decision_authority text,        -- budget owner / influencer / champion / unknown
  likely_objections text,         -- what they'll push back on
  talking_points text,            -- what the AE should bring up
  challenger_insight text,        -- the insight that reframes their thinking
  next_best_action text,          -- what the AE should do next
  booth_notes text,               -- raw notes from the show
  
  -- MEDDPICC mapping
  meddpicc_metrics text,          -- quantified business case
  meddpicc_economic_buyer text,   -- who holds the budget
  meddpicc_decision_criteria text,-- how they'll evaluate
  meddpicc_decision_process text, -- who's involved, what steps
  meddpicc_paper_process text,    -- procurement/legal requirements
  meddpicc_identified_pain text,  -- the pain we're addressing
  meddpicc_champion text,         -- internal advocate potential
  meddpicc_competition text,      -- competitive landscape for this deal
  
  -- Brain inference (not from raw research, from pattern matching)
  inferred_urgency text,          -- why now? what's the time pressure?
  inferred_budget_cycle text,     -- when do they typically buy?
  inferred_from_bellwether text,  -- large-company signals that apply here
  market_moment text,             -- what's happening in their market right now
  
  -- Source tracking
  research_confidence text CHECK (research_confidence IN ('high', 'medium', 'low')),
  source_tier_breakdown jsonb,    -- {t1: 3, t2: 5, t3: 2, t4: 1}
  last_enriched_at timestamptz DEFAULT now(),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Outcome tracking: what happened after outreach
CREATE TABLE sr_brain_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES sr_prospects(id),
  
  -- Outreach events
  t1_sent_at timestamptz,
  t1_opened boolean DEFAULT false,
  t1_replied boolean DEFAULT false,
  t1_reply_sentiment text,        -- positive / neutral / negative / objection
  
  t2_sent_at timestamptz,
  t2_opened boolean DEFAULT false,
  t2_replied boolean DEFAULT false,
  t2_reply_sentiment text,
  
  t3_sent_at timestamptz,
  t3_opened boolean DEFAULT false,
  t3_replied boolean DEFAULT false,
  t3_reply_sentiment text,
  
  -- Microsite engagement
  microsite_viewed boolean DEFAULT false,
  microsite_time_seconds integer,
  microsite_booking_clicked boolean DEFAULT false,
  
  -- Conversion funnel
  meeting_booked boolean DEFAULT false,
  meeting_booked_at timestamptz,
  demo_completed boolean DEFAULT false,
  proposal_sent boolean DEFAULT false,
  deal_won boolean,
  deal_lost_reason text,
  
  -- What worked (filled by passive HubSpot monitoring)
  angle_that_landed text,         -- which research insight resonated
  objection_encountered text,     -- what they pushed back on
  ae_notes text,                  -- AE's own observations
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- AE interaction log: passive capture from HubSpot email threads
CREATE TABLE sr_brain_ae_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES sr_prospects(id),
  
  hubspot_engagement_id text,     -- HS engagement ID for dedup
  interaction_type text,          -- email_sent / email_received / call / meeting / note
  direction text,                 -- inbound / outbound
  occurred_at timestamptz,
  
  -- Content analysis (LLM-classified, not raw email content)
  summary text,                   -- 1-2 sentence summary of the exchange
  sentiment text,                 -- positive / neutral / negative / interested / objecting
  topics_discussed text[],        -- ['pricing', 'timeline', 'integration', 'demo']
  pain_points_mentioned text[],   -- ['permit_delays', 'headcount', 'rework']
  competitor_mentioned text,      -- if they reference another tool
  next_step_agreed text,          -- what was agreed as next action
  
  -- Brain inference
  buying_signal_strength text,    -- hot / warm / cool / cold
  recommended_next_action text,   -- what the Brain thinks the AE should do
  
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- LAYER 2: Industry/Market
-- ============================================================

-- Market signals: events and facts about the fiber/telecom industry
CREATE TABLE sr_brain_market_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  signal_type text NOT NULL,      -- bead_funding / acquisition / hiring / regulatory / earnings / product_launch / partnership
  signal_source text NOT NULL,    -- URL or source description
  source_tier text,               -- t1_government / t2_company / t3_industry / t4_inference
  
  headline text NOT NULL,         -- short description of the signal
  detail text,                    -- full extracted content
  
  -- Who it affects
  affected_companies text[],      -- company names this signal applies to
  affected_segments text[],       -- ['fiber_operators', 'ae_firms', 'contractors', 'coops']
  affected_states text[],         -- US states affected
  
  -- Brain inference
  inferred_impact text,           -- what this means for affected companies
  inferred_urgency text,          -- how time-sensitive this is
  prospect_ids_affected uuid[],   -- specific prospects this signal updates
  
  -- Lifecycle
  signal_date date,               -- when the event happened
  ingested_at timestamptz DEFAULT now(),
  expires_at timestamptz,         -- when this signal becomes stale
  is_active boolean DEFAULT true
);

-- Competitive intelligence: companies in the market
CREATE TABLE sr_brain_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  company_name text NOT NULL,
  company_type text,              -- software / contractor / ae_firm / operator
  website text,
  
  -- Positioning
  primary_value_prop text,        -- how they describe themselves
  overlap_with_client text,       -- where they compete with our client (Inorsa)
  differentiation text,           -- how they're different from our client
  
  -- Market signals
  recent_moves text,              -- acquisitions, launches, partnerships
  hiring_signals text,            -- what roles they're hiring for
  customer_signals text,          -- known customers or case studies
  
  -- Brain inference
  threat_level text,              -- high / medium / low / complementary
  positioning_against text,       -- how our client should position vs this competitor
  
  updated_at timestamptz DEFAULT now()
);

-- Bellwether tracking: large company signals that predict small company behavior
CREATE TABLE sr_brain_bellwethers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  large_company_name text NOT NULL,  -- Dycom, MasTec, Quanta, Lumen, etc.
  signal_type text,                  -- earnings_call / 10k / press_release / job_posting
  signal_source text,
  signal_date date,
  
  -- What they said/did
  raw_signal text,                   -- the actual quote or fact
  
  -- Brain inference
  small_company_inference text,      -- what this means for smaller companies
  affected_segments text[],
  affected_geographies text[],
  confidence text CHECK (confidence IN ('high', 'medium', 'low')),
  
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- LAYER 3: Universal (ShowRev platform)
-- ============================================================

-- Outreach patterns: what works across all clients
CREATE TABLE sr_brain_outreach_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  pattern_type text NOT NULL,     -- send_timing / subject_line / hook / cta / ps_framing / email_length / abm_design / sequence_timing
  pattern_name text NOT NULL,     -- descriptive name
  pattern_description text,       -- what the pattern is
  
  -- Evidence
  sample_size integer,            -- how many data points
  success_rate numeric,           -- conversion rate for this pattern
  confidence text,                -- high / medium / low (based on sample size)
  
  -- Context
  works_best_for text,            -- segment, persona, or situation where this works
  does_not_work_for text,         -- where it fails
  
  -- Source
  source_client text,             -- which client generated this insight (null = cross-client)
  source_show text,               -- which show
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## HubSpot Dossier Surfacing Strategy

### The Pinned Note Pattern

HubSpot allows exactly ONE pinned activity per contact record. This is the AE's "at a glance" intelligence. It's visible at the top of the contact timeline on desktop and mobile.

**What goes in the pinned note (the "executive summary"):**

```
SHOWREV DOSSIER: [Company Name]
Last updated: [date]

WHAT THEY DO: [1 sentence]
WHY THEY FIT: [1 sentence]
WHAT TO LEAD WITH: [the challenger insight]
WHAT THEY'LL PUSH BACK ON: [likely objections]
WHAT TO ASK: [the diagnostic question]
NEXT STEP: [specific action]

CONTEXT: [2-3 bullet points of key research findings]
```

This is 8-10 lines. The AE reads it in 30 seconds before picking up the phone.

### Custom Properties (the structured data)

The 13 sr_ properties we already designed in the HubSpot loader spec carry the structured version:
- sr_role_summary, sr_decision_authority, sr_likely_objections, sr_talking_points
- sr_booth_notes, sr_persona_bucket, sr_fit_score, sr_fit_rationale
- sr_challenger_insight, sr_next_best_action, sr_microsite_url
- sr_influence_pattern, sr_research_confidence

These are filterable, sortable, and reportable in HubSpot. The pinned note is the human-readable summary. The properties are the machine-readable data.

### The Full Dossier (for deep-dive reading)

For AEs who want the full story, the complete dossier lives as a Google Doc or PDF linked from the sr_microsite_url area (or a dedicated sr_dossier_url property). This contains:
- Everything in the pinned note, expanded
- Full company research
- Full competitive context
- MEDDPICC mapping
- Source citations with tier classification
- Market signals affecting this prospect
- Brain inferences and recommendations

This is the "cover to cover" document. Most AEs won't read it before a first call. They'll read it before a second call or a demo, when the prospect is real and the stakes are higher.

---

## Inference Engine Design

### Signal-to-Inference Pipeline

```
New signal arrives (market event, HubSpot interaction, article)
  |
  v
Classify signal
  - Type (bead_funding / acquisition / hiring / regulatory / etc.)
  - Layer (universal / industry / client)
  - Affected segments, geographies, companies
  |
  v
Match to prospects
  - Query sr_brain_dossiers for affected companies/segments
  - Return list of prospect_ids whose dossier should be updated
  |
  v
Generate inference
  - For each affected prospect:
    - "What does this signal mean for THIS company?"
    - "Does this change the urgency, the angle, or the objection?"
    - "Should the AE be notified?"
  |
  v
Update dossier + optionally alert
  - Write inference to sr_brain_dossiers.inferred_* fields
  - If material change: flag in sr_brain_outcomes or notify AE via HubSpot task
```

### Large-to-Small Inference (Bellwether Model)

```
Large company disclosure detected
  (e.g., Dycom Q2 earnings: "40% increase in BEAD-funded work")
  |
  v
Extract structured signal
  - What: BEAD work volume increasing 40%
  - Where: Dycom's operating states (TX, FL, GA, NC, etc.)
  - When: Q2 2026
  |
  v
Infer small company impact
  - Small fiber contractors in same states face same demand increase
  - A&E firms serving those contractors will see more design volume
  - Permit queues in those states will get longer
  |
  v
Update affected prospects
  - For each prospect in those states:
    - Update market_moment: "BEAD-funded work volume up 40% in your region per Dycom Q2"
    - Update inferred_urgency: "Permit queues getting longer; automation ROI increases"
    - Update talking_points: add the Dycom reference as social proof
```

### Passive Learning Loop (12-month HubSpot monitoring)

```
Daily poll: HubSpot API → new engagements for ShowRev-tagged contacts
  |
  v
For each new engagement:
  - Classify type (email / call / meeting)
  - Extract summary via LLM
  - Classify sentiment
  - Identify topics and pain points mentioned
  - Detect buying signals
  - Write to sr_brain_ae_interactions
  |
  v
Weekly rollup:
  - For each prospect with new interactions:
    - Update sr_brain_outcomes funnel stage
    - Identify which original research angles are being referenced
    - Update sr_brain_outreach_patterns with what's working
  |
  v
Monthly analysis:
  - Aggregate conversion data across segments
  - Identify which influence patterns have highest conversion
  - Update Layer 3 (universal) with new outreach patterns
  - Update Layer 2 (industry) with new market patterns
  - Generate "Brain Report" for operator review
```

---

## Immediate Build Plan

### Phase 1: Schema + Populate (TODAY)
1. Create the new Brain tables in Supabase
2. Load all 89 prospects into sr_prospects
3. Generate sr_brain_dossiers for all 23 PASS prospects from existing research
4. Generate pinned-note format for each dossier
5. Show thin vs rich dossier comparison

### Phase 2: Market Intelligence Layer (THIS WEEK)
1. Ingest industry-intelligence-kb.md into sr_brain_market_signals
2. Ingest competitor-intelligence.md into sr_brain_competitors
3. Run bellwether scan on top 5 public fiber companies
4. Generate first round of large-to-small inferences

### Phase 3: Inference Engine (NEXT WEEK)
1. Build the signal-to-inference pipeline
2. Wire up event-driven ingestion (BEAD articles, regulatory changes)
3. Prototype the bellwether model with real data
4. Show updated dossiers with inferred insights

### Phase 4: Learning Loop (AFTER FIRST SEND)
1. Wire HubSpot passive monitoring
2. Build daily poll for engagement events
3. Sentiment classification pipeline
4. Weekly rollup and pattern extraction
5. First Brain Report at 30 days post-send

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-29 14:16 | Claude | Initial architecture. Three-layer pyramid, Supabase schema, HubSpot surfacing strategy, inference engine design, bellwether model, passive learning loop, phased build plan. |
