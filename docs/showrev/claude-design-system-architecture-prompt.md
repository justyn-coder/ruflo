---
title: Claude Design Prompt -- ShowRev System Architecture Visualization
status: ACTIVE
last_updated: 2026-05-31 12:00 EST
version: v1
purpose: Exact prompt for Claude Design to render the full ShowRev system architecture. Every component, data flow, gate, and external service.
---

# Claude Design Prompt

## Goal

Create a comprehensive system architecture diagram for ShowRev, a B2B tradeshow outreach automation platform. The diagram should show how data flows from raw CSV input through research, composition, quality gates, staging, and delivery -- with all database connections, external services, and decision points clearly mapped.

## Layout

Full-page landscape. Left-to-right primary flow. Use a clean, dark navy/white color scheme matching the Inorsa brand (#0B1120 background, white text, #C4B5FD purple accents for highlights, #2D6A4F green for gates that pass, #B91C1C red for gates that reject).

Group components into 6 vertical swim lanes from left to right:
1. **INTAKE** (left edge)
2. **RESEARCH + BRAIN**
3. **COMPOSITION**
4. **QUALITY GATES**
5. **STAGING** (Mission Control)
6. **DELIVERY** (right edge)

## Content -- Every Component

### Swim Lane 1: INTAKE

**CSV Importer** (src/showrev/m1-email-find/importer.ts)
- Input: Booth scan CSV (name, email, company, title, state, AE notes, AE grade)
- OR: Attendee list CSV (name, company, title, state, country -- NO email, NO domain)
- Processing: parse, deduplicate, normalize, extract AE notes
- Output: Normalized prospect records
- Writes to: Supabase `sr_prospects` table
- Note on diagram: "Substrate depth varies. Email/domain/notes may be absent."

**Discovery Phase** (not yet built -- show as dashed outline)
- For thin-substrate contacts: find company domain, find contact email
- Tools: Apollo, web search, domain lookup
- Note: "Required for cold prospecting project (2,300 contacts)"

### Swim Lane 2: RESEARCH + BRAIN

**STORM Multi-Persona Research** (src/showrev/m1-email-find/personas.ts + researcher.ts)
- Three parallel research agents:
  - Industry Analyst (market dynamics, BEAD, regulatory, growth signals)
  - AE Proxy (buying signals, decision authority, objections, org mapping)
  - Technical Evaluator (current tools, workflow, technical pain, integration fit)
- Each agent: forms hypotheses, searches web, confirms/disconfirms (Heuer ACH method)
- Cross-examination: personas challenge each other's findings
- Source hierarchy: Tier 1 (government filings) > Tier 2 (trade press) > Tier 3 (company website) > Tier 4 (aggregators)
- External service: `claude -p` (headless Claude CLI) for each persona execution
- External service: Web search (via Claude's built-in tools)
- Output: Structured dossier per prospect (company profile, contact profile, JTBD inference, research meta)
- Writes to: Supabase `sr_brain_dossiers` table

**ICP Gate** (within research phase)
- Decision: PASS / HOLD / REJECT based on:
  - Segment (A&E firm 70% pass, fiber operator 64%, contractor 50%, equipment/software 0%)
  - Scale (employees, revenue, fiber activity)
  - Data confidence (high/medium/low based on source count)
- REJECT: stops processing, logs reason
- HOLD: flags for operator with specific gap documented
- PASS: continues to composition
- Writes to: `sr_brain_dossiers.icp_status` and `sr_prospects.icp_status`

**Persona Classification** (7-bucket cascade)
- Assigns persona bucket: build_pace, drawings_quality, permit_cycle, program_leverage, cycle_time_exec, capital_efficiency, pass_through
- Used for QA gating (confirms email angle matches role), NOT for composition
- Writes to: `sr_brain_dossiers.persona_bucket`

**Brain Knowledge Base** (data/showrev/)
- brain-synthesis.md (segment analysis, pattern library)
- industry-intelligence-kb.md (BEAD status, market forces, labor trends)
- competitor-intelligence.md (8 competitors profiled)
- inorsa-source-of-truth.md (product constraints, pitch verbatim, value prop scope)
- booth-transcripts-batch1-analysis.md (conversation intel)
- Read by research agents for context. Updated by Brain after each project.

### Swim Lane 3: COMPOSITION

**Influence Pattern Selector** (src/showrev/m1-email-find/influence.ts)
- Input: dossier summary, AE booth notes, contact title, touch number
- Selects from 8 patterns: challenger_insight, commitment_consistency, competitive_displacement, curiosity_gap, loss_aversion, social_proof, reframe_anchor, reciprocity
- Output: PatternSelection (pattern, rationale, emotional frame, challenger insight, P.S. strategy, CTA type)
- Rule: T1 and T2 MUST use different patterns
- External service: `claude -p` for pattern selection

**Email Composer** (influence.ts buildComposerPrompt)
- Input: pattern selection, dossier summary, prospect info, AE name/email, microsite slug
- Applies anti-AI-tell checklist (10 rules enforced in prompt)
- Hard constraints: under 80 words, one question, salutation = "[FirstName]," only, no em-dashes
- AE resolved via: assigned_ae override > state-based territory mapping > default Lucas
- P.S. standardized: microsite link (fiber.inorsa.com/brief/[slug])
- Signature: [AE Name] | Inorsa | [ae_email]
- External service: `claude -p` for composition
- Output: JSON (subject, previewText, body, ps, wordCount, antiTellChecks)

**Touch Sequencing**
- T1: Interest-based CTA ("Is this relevant?")
- T2: Soft time CTA ("Worth 20 minutes?")
- T3: Binary close ("Worth a look, or not the right time?")
- T2/T3 not yet built as value-delivery touches (future: interactive content for T2)

### Swim Lane 4: QUALITY GATES

**4-Dimension LLM Judge** (src/showrev/m1-email-find/judge.ts)
- Scores 1-10 on: Research Depth, VP Connection, Tone, Conciseness
- All must be >= 7 to pass
- Verdicts: send (all >= 7), hold (any 5-6), reject (any <= 4)
- External service: `claude -p` for judging

**Mechanical Checks** (judge.ts runMechanicalChecks)
- Word count > 80 → fail
- Em-dash or en-dash → fail
- Subject > 8 words → fail
- Salutation not "[FirstName]," → fail
- P.S. missing microsite slug → fail
- AI-tell phrases detected → fail (6 patterns: "I'm curious", "Happy to", "I'd love to", "Furthermore", "Additionally", "Moreover")
- Wrong product references → fail (structural analysis, Harmoni, tower/cellular)
- All automated, no LLM needed

**Fact Verification** (src/showrev/m1-email-find/verify-facts.ts)
- Cross-checks dossier claims against web sources
- Flags unverifiable claims for manual review
- Prevents hallucinated facts from reaching email copy

**Email Verification** (src/showrev/m1-email-find/verify-emails.ts)
- Verifies email addresses before send
- External service: Findymail API
- Bounced/invalid → flag, do not send

### Swim Lane 5: STAGING (Mission Control)

**Mission Control UI** (src/showrev/microsite/app/ops/)
- Web app: showrev-microsites.vercel.app/ops (or fiber.inorsa.com/ops)
- Data source: reads from Supabase (sr_prospects + sr_brain_dossiers + sr_microsites)
- Shows: every contact with status, email preview, dossier intel, ABM microsite link, AE review status
- Operator actions: cycle status (send/hold/reject/dnc/partner), AE review (pending/verified/flagged/fixed/rejected), notes, GO button

**Operator Gate** (human decision)
- Operator reviews Engine output in Mission Control
- Can override any decision: change status, reassign AE, edit email, flag issues
- Two-step activation: AE verified → Operator GO
- Every override is a training signal for the Brain (future: Brain learns from overrides)

**ABM Microsites** (src/showrev/microsite/app/brief/[slug]/route.ts)
- Per-contact personalized Field Brief pages
- Dynamic rendering from Supabase data (prospect name, company, AE, insight, booking URL)
- Domain: fiber.inorsa.com/brief/[slug]
- Includes: HubSpot tracking code, booking CTA, company logo, AE headshot
- Booking: HubSpot Meetings with pre-fill (firstname, lastname, email, meeting_notes)

**Booking Confirmation** (src/showrev/microsite/app/booked/route.ts)
- Cookie-based personalization (sr_slug set by /brief/ route)
- Two variants: operator (permit speed) vs A&E firm (margin/throughput)
- Redirected from HubSpot Meetings after booking

### Swim Lane 6: DELIVERY

**HubSpot Loader** (not yet automated -- show as dashed outline with protocol notes)
- Protocol (Breeze-validated):
  1. Search company by domain (not name)
  2. If exists → capture ID. If not → create with showrev_* fields
  3. Create contact with showrev_* fields + lifecyclestage=Prospect
  4. Explicitly associate contact → company by ID
- Safety: turn OFF auto-create-companies setting before load, turn back on after
- Properties: showrev_engagement_slug, showrev_pilot_owner, showrev_research_summary, showrev_microsite_url, showrev_challenger_insight, abm_play (1:Few)
- Owner inheritance: company owner → contact owner via existing Workflow
- External service: HubSpot MCP (or HubSpot API via Private App token)
- Portal: Inorsa account 20729069

**HubSpot Sequences** (not yet built -- show as dashed outline)
- T1/T2/T3 email bodies loaded into HubSpot sequence steps
- AE sends via HubSpot (tracks opens, clicks, replies)
- Engagement data flows back for outcome tracking

**Outcome Tracking / Reporter** (not yet built -- show as dashed outline)
- HubSpot engagement events → Supabase sr_outcomes
- Tracks: opens, clicks, replies, bounces, meetings booked, deals created
- Feeds Brain learning loop: which decisions → which outcomes → which patterns
- Required meta-fields: influence_pattern, persona_bucket, research_confidence, source_count

## Database Schema (show as central data store connected to all swim lanes)

**Supabase (project slttpknnuthbttjuzrnz)**

| Table | Purpose | Key fields |
|-------|---------|------------|
| sr_prospects | All contacts | first_name, last_name, email, company, send_status, icp_status, assigned_ae |
| sr_brain_dossiers | Research + email output | company_summary, challenger_insight, email_subject, email_body, email_ps, persona_bucket, fit_score |
| sr_microsites | ABM page config | slug, company_name, ae_name, ae_booking_url, ae_photo_url, company_logo_url |
| sr_microsite_events | Page view tracking | microsite_id, event_type, metadata |

## External Services (show as cloud icons connected to relevant components)

| Service | Used by | Purpose |
|---------|---------|---------|
| claude -p (Anthropic CLI) | Research, Pattern Selection, Composition, Judge | LLM execution (Sonnet model) |
| HubSpot MCP | HubSpot Loader, Collision Check | CRM read/write |
| Supabase MCP | All data operations | Database read/write |
| Findymail API | Email Verification | Address validation |
| Web Search | Research agents | Company/contact research |
| Vercel | Microsites, Mission Control | Hosting + deployment |
| HubSpot Meetings | Booking flow | Calendar scheduling with pre-fill |

## Key for diagram

- Solid boxes: built and working
- Dashed boxes: designed but not yet built
- Green arrows: data flows that are working
- Orange dashed arrows: planned data flows
- Red gate icons: quality gates (reject path shown)
- Purple highlights: external service calls
- Database cylinder: Supabase (central, connected to all lanes)

## Audience

Justyn Szymczyk, ShowRev founder. Visual learner. Needs to see the full system at once to build confidence that everything is properly wired. This diagram is both a communication tool and an audit tool -- if something is missing or fake, it should be obvious from the diagram.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 12:00 | Claude | Initial architecture visualization prompt. All 6 swim lanes, database schema, external services, build status. |
