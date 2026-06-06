---
title: Claude Design Prompt -- ShowRev System Architecture Visualization
status: ACTIVE
last_updated: 2026-06-06 09:55 EST
version: v3
purpose: Exact prompt for Claude Design to render the full ShowRev system architecture. Reflects actual code in run-pipeline.ts as of Wave 2 completion. Every component, data flow, gate, and external service.
---

# Claude Design Prompt

## Goal

Create a comprehensive system architecture diagram for ShowRev, a B2B tradeshow outreach automation platform. The diagram must show how data flows from raw CSV input through the 9-phase pipeline orchestrated by `run-pipeline.ts` — with all database connections, external services, quality gates, and decision points clearly mapped.

## Layout

Full-page landscape. Left-to-right primary flow. Use a clean, dark navy/white color scheme matching the Inorsa brand (#0B1120 background, white text, #C4B5FD purple accents for highlights, #2D6A4F green for gates that pass, #B91C1C red for gates that reject).

Group components into 6 vertical swim lanes from left to right:
1. **INTAKE** (left edge)
2. **RESEARCH + BRAIN**
3. **COMPOSITION**
4. **QUALITY GATES**
5. **STAGING** (Mission Control)
6. **DELIVERY** (right edge)

## Content — Every Component (Honest Build Status)

### Swim Lane 1: INTAKE

**CSV Parser** (run-pipeline.ts `parseCSV`, lines 127-176)
- Input: Prospect CSV with flexible header matching
- Mapped columns: firstName, lastName, company, title, state, email, companyUrl, aeNotes (Wave 2)
- Header matching: regex-based (`/first.?name/`, `/ae.?notes|booth.?notes/`, etc.)
- Handles quoted fields with commas (`splitCSVLine`)
- Output: `ProspectRow[]` — typed records with optional fields
- Note on diagram: "P1 CSV has email + aeNotes. P2 CSV has name/company/title only."

**Phase 1: ICP Gate** (icp-gate.ts, called at line 1293)
- Two-tier classification: regex first, LLM fallback (Haiku)
- Regex tier: scores company against AE_INDICATORS, OPERATOR_INDICATORS, NON_ICP_INDICATORS
- Wave 2 addition: TOWER_AE_INDICATORS + FIBER_OVERRIDE_INDICATORS — tower A&E firms rejected unless fiber signals override
- LLM tier: Haiku classifier with fiber-first bias (false negatives 10x worse than false positives)
- Three ICP types: `fiber_operator`, `ae_firm`, `non_icp`
- REJECT: stops processing, logs to sr_prospects with reason
- PASS: continues with icpType threaded downstream
- Error handling: defaults to pass (non-blocking)

**Phase 2: Email Discovery** (run-pipeline.ts `phaseEmailFind`, lines 231-357)
- Only runs if CSV has no email
- Multi-step orchestrator (`email-finder/orchestrator.ts`):
  1. **Apollo primary** (if APOLLO_API_KEY set): people match by name + company → returns email + status + confidence
  2. **DuckDuckGo fallback** (if Apollo misses): HTML search → domain extraction → email pattern inference
  3. **Domain hints** loaded from `data/showrev/premium/domain-hints.json` (manual overrides for known company domains)
  4. **Social media domain filtering** (x.com, linkedin.com, etc.) — prevents false domain matches
  5. **MillionVerifier check** (if MILLIONVERIFIER_API_KEY set): verifies deliverability → quality (good/bad/risky) + result (ok/catch_all/unknown)
- Confidence color: green (verified by Apollo + MV), yellow (partial verification), red (unverified)
- Output: email address + confidence color
- Note: "Required for P2 cold prospects (2,300 contacts without email)"

**Phase 2b: Prospect Upsert** (run-pipeline.ts `phaseProspectUpsert`, line 1342)
- Upserts sr_prospects in Supabase immediately after email discovery
- Mission Control needs prospect rows to show status
- Sets icp_status, icp_reason, icp_type, assigned_ae
- AE resolved via state-based territory mapping (East/Central/West)

### Swim Lane 2: RESEARCH + BRAIN

**Phase 3a: Brain Context Query** (brain-agentdb.ts + brain-ingest.ts, line 1361)
- Strategy: AgentDB semantic search first (HNSW vectors), JSONL entity graph fallback
- AgentDB: vector similarity search across prior research for this company
- JSONL fallback: filter entity-graph.jsonl by company name match
- Last fallback: load full brain-context-digest.md for general industry context
- Output: injected into LLM cache via `setBrainCacheContent()`
- Note: "Brain grows with each prospect — cumulative learning across runs"

**Phase 3: 3-Persona STORM Research** (personas.ts + researcher.ts, line 1431)
- Three parallel research agents (all run concurrently via Promise.all):
  - **Industry Analyst** — market dynamics, BEAD, regulatory, growth signals
  - **AE Proxy** — buying signals, decision authority, objections, org mapping
  - **Technical Evaluator** — current tools, workflow, technical pain, integration fit
- Each agent: forms hypotheses, searches web, confirms/disconfirms (Heuer ACH method)
- External service: `callLLM()` → Sonnet or Opus
- Source hierarchy: Tier 1 (government filings) > Tier 2 (trade press) > Tier 3 (company website) > Tier 4 (aggregators)
- Output: structured dossier per prospect

**Phase 3b: Brain Ingest** (brain-ingest.ts `ingestResearchIntoBrain`, line 1450)
- Extracts entities from research output into entity graph
- Writes to entity-graph.jsonl (append)
- Refreshes brain-context-digest.md every 10 prospects
- Note: "This is the learning loop — Brain accumulates knowledge across runs"

**Phase 3c: Intel Structurer** (intel-structurer.ts `structureIntelReport`, line 1471)
- Structures raw research into HubSpot-ready dossier fields
- Fields: showrev_company_summary, showrev_bead_status, showrev_key_projects, showrev_growth_signals, showrev_challenger_insight, showrev_competitive_landscape, showrev_automation_level, showrev_product_fit, etc.
- Output: structured dossier object with populated field count

**Brain Knowledge Base** (data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026/)
- entity-graph.jsonl — growing entity graph (updated by Phase 3b)
- brain-context-digest.md — synthesized digest (refreshed every 10 prospects)
- Read by Phase 3a for context. Written by Phase 3b after research.

### Swim Lane 3: COMPOSITION

**Phase 4: Substrate Search** (run-pipeline.ts `phaseSubstrateSearch`, line 1517)
- Semantic search against Supabase Edge Function `search-substrate`
- Query: company + title + state + "fiber broadband"
- Returns up to 8 semantic matches from industry substrate corpus
- Used to enrich research context for composition

**Phase 4b: Semantic Verification** (semantic-verifier.ts `verifyAllClaims`, line 1533)
- Cross-checks research claims against substrate and web sources
- Reports: totalClaims, verified count, flagged count, confidence level
- Identifies blockers (unverifiable critical claims)
- Non-blocking — flags for review, doesn't stop pipeline

**Phase 5: Pattern Selection** (influence.ts `buildPatternSelectorPrompt`, line 1560)
- Input: enriched research summary, aeNotes, title, touch number, icpType (Wave 2)
- Selects from 8 influence patterns: challenger_insight, commitment_consistency, competitive_displacement, curiosity_gap, loss_aversion, social_proof, reframe_anchor, reciprocity
- Wave 2: commitment_consistency excluded for cold prospects (no aeNotes)
- Wave 2: ICP segment context block added (fiber_operator vs ae_firm framing)
- T1 and T2 MUST use different patterns
- Output: PatternSelection per touch (pattern, challengerInsight, emotionalFrame, rationale, ctaType, psStrategy)

**Phase 6: Email Composition** (influence.ts `buildComposerPrompt` + lean-composer.ts, line 1605)
- Two modes: full composer (LLM-driven) or lean composer (template-driven, for thin research)
- Auto mode: selects based on research signal strength
- Full composer features (Wave 2):
  - Conditional post-show vs cold framing (based on hasAeNotes)
  - ICP-specific CTA questions (4 per ICP type in hypothesis format)
  - Failure-friction bridge micro-template with ICP-specific examples
  - Competitive bridge (9 competitors across 5 categories, osmose excluded)
  - Anti-AI-tell checklist (10 rules enforced in prompt)
- Hard constraints: target 80w T1/T2 (60w T3), ceiling 88w/66w (+10% flex per SOT §11), one question, salutation = "[FirstName]," only, no em-dashes
- AE resolved: assigned_ae override > state territory > default Lucas
- P.S. standardized: microsite link (fiber.inorsa.com/brief/[slug])
- Signature: [AE Name] | Inorsa | [ae_email]
- Output per touch: JSON (subject, body, ps, wordCount)

**Phase 6b: Fact Verification** (verify-facts.ts, line 1695)
- Cross-checks composed email claims against original research
- Prevents hallucinated or distorted facts from reaching final copy
- Runs after composition, before judge

### Swim Lane 4: QUALITY GATES

**Phase 7: Judge Gate** (judge.ts `judgeEmail` + `runMechanicalChecks`, line 1730)
- Two sub-phases:

  **7a: Mechanical Checks** (no LLM, line 677)
  - Word count > 88 (T1/T2) or > 66 (T3) → fail (SOT §11 flex ceiling)
  - Em-dash or en-dash → fail
  - Subject > 8 words → fail
  - Salutation not "[FirstName]," → fail
  - P.S. missing microsite slug → fail
  - AI-tell phrases → fail (6 patterns: "I'm curious", "Happy to", "I'd love to", "Furthermore", "Additionally", "Moreover")
  - Wrong product references → fail (structural analysis, Harmoni, tower/cellular)

  **7b: 5-Dimension LLM Scoring** (line 717)
  - Dimensions: research_depth, vp_connection, tone, conciseness, jtbd_alignment
  - All must be >= 7 to pass
  - Verdicts: send (all >= 7), hold (any 5-6), reject (any <= 4)
  - Wave 2: ICP-aware bonus scoring (+1-2 on jtbd_alignment for fiber_operator/ae_firm, BONUS ONLY — no penalties)
  - Wave 2: Conditional cold/post-show framing in judge prompt (based on aeNotes)
  - Anti-validation rule reinforced for A&E firms

  **Auto-recompose on failure** (line 1752)
  - If judge rejects, identifies failing touches
  - Auto-recomposes failing touches (up to 2 retries)
  - Re-runs judge on recomposed emails

**Phase 7b: Cross-Model Judge** (cross-model-judge.ts, line 1812)
- Optional second-opinion from alternate model
- Runs after primary judge passes

**Email Verification** (MillionVerifier, called during Phase 2)
- Verifies email deliverability during email discovery (not a separate phase)
- External service: MillionVerifier API (MILLIONVERIFIER_API_KEY)
- Returns: quality (good/bad/risky), result (ok/catch_all/unknown)
- bad/risky → confidence drops to red, pipeline continues but email flagged

### Swim Lane 5: STAGING (Mission Control)

**Phase 8: Microsite Content** (microsite-composer.ts `composeMicrositeContent`, line 1831)
- Generates personalized Field Brief content
- Components: headline, insight text, case study
- Uses research summary, challenger insight, persona bucket

**Phase 8b: Microsite Upsert** (run-pipeline.ts `phaseMicrositeUpsert`, line 1845)
- Upserts sr_microsites in Supabase
- Sets slug, company, AE info, booking URL, logo URL

**Phase 9: Supabase Write** (run-pipeline.ts `phaseSupabaseWrite`, line 1860)
- Writes full engine output to sr_engine_output
- Stores: email subjects/bodies/ps for T1/T2/T3, judge scores, research summary, ICP classification, patterns used, AE assignment
- Updates sr_brain_dossiers with structured intel

**Mission Control UI** (src/showrev/microsite/app/ops/)
- Web app: showrev-microsites.vercel.app/ops (or fiber.inorsa.com/ops)
- Data source: reads from Supabase (sr_prospects + sr_brain_dossiers + sr_engine_output + sr_microsites)
- Shows: every contact with status, email preview, dossier intel, ABM microsite link, AE review status
- Operator actions: cycle status (send/hold/reject/dnc/partner), AE review, notes, GO

**Operator Gate** (human decision)
- Operator reviews Engine output in Mission Control
- Can override any decision
- Two-step activation: AE verified → Operator GO

**ABM Microsites** (src/showrev/microsite/app/brief/[slug]/route.ts)
- Per-contact personalized Field Brief pages
- Dynamic rendering from Supabase (prospect name, company, AE, insight, booking URL)
- Domain: fiber.inorsa.com/brief/[slug]
- Includes: HubSpot tracking code, booking CTA, company logo, AE headshot

**Booking Confirmation** (src/showrev/microsite/app/booked/route.ts)
- Cookie-based personalization (sr_slug set by /brief/ route)
- Two variants: operator (permit speed) vs A&E firm (margin/throughput)

### Swim Lane 6: DELIVERY

**HubSpot Loader** (hubspot-loader.ts — built but manual trigger, show as solid with manual icon)
- Protocol (Breeze-validated):
  1. Search company by domain (not name)
  2. If exists → capture ID. If not → create with showrev_* fields
  3. Create contact with showrev_* fields + lifecyclestage=Prospect
  4. Explicitly associate contact → company by ID
- Safety: turn OFF auto-create-companies before load
- Properties: showrev_engagement_slug, showrev_pilot_owner, showrev_research_summary, showrev_microsite_url, showrev_challenger_insight, abm_play (1:Few)
- External service: HubSpot API (Private App token)
- Portal: Inorsa account 20729069

**HubSpot Sequences** (not yet built — show as dashed outline)
- T1/T2/T3 email bodies loaded into HubSpot sequence steps
- AE sends via HubSpot (tracks opens, clicks, replies)

**Outcome Tracking / Reporter** (not yet built — show as dashed outline)
- HubSpot engagement events → Supabase sr_outcomes
- Required meta-fields: influence_pattern, persona_bucket, research_confidence, source_count
- Feeds Brain learning loop

## The Orchestrator

**run-pipeline.ts** (~2000 lines) is the single CLI orchestrator that wires all phases. Show it as a horizontal backbone connecting all swim lanes, with phase numbers labeled on each connection.

```
CSV → [P1: ICP Gate] → [P2: Email Find] → [P2b: Prospect Upsert]
    → [P3a: Brain Query] → [P3: STORM Research (3 parallel)] → [P3b: Brain Ingest] → [P3c: Intel Structurer]
    → [P4: Substrate Search] → [P4b: Semantic Verify]
    → [P5: Pattern Selection] → [P6: Composition] → [P6b: Fact Verify]
    → [P7: Judge Gate] → [P7b: Cross-Model Judge]
    → [P8: Microsite] → [P8b: Microsite Upsert] → [P9: Supabase Write]
```

CLI invocation:
```
npx tsx src/showrev/m1-email-find/run-pipeline.ts --input prospects.csv [--limit N] [--dry-run] [--skip-research] [--skip-composition] [--model sonnet|opus] [--composer full|lean|auto] [--touches 1,2,3]
```

## Database Schema (central data store connected to all swim lanes)

**Supabase (project slttpknnuthbttjuzrnz)**

| Table | Purpose | Key fields |
|-------|---------|------------|
| sr_prospects | All contacts + status | first_name, last_name, email, company, title, state, send_status, icp_status, icp_type, icp_reason, assigned_ae |
| sr_brain_dossiers | Structured research output | company_summary, challenger_insight, persona_bucket, competitive_landscape, bead_status, growth_signals |
| sr_engine_output | Full pipeline output per contact | email_subject_t1/t2/t3, email_body_t1/t2/t3, email_ps_t1/t2/t3, judge_scores, patterns, research_summary |
| sr_microsites | ABM page config | slug, company_name, ae_name, ae_booking_url, ae_photo_url, company_logo_url |
| sr_microsite_events | Page view tracking | microsite_id, event_type, metadata |

## External Services (cloud icons connected to relevant components)

| Service | Used by | Purpose |
|---------|---------|---------|
| callLLM() → Anthropic API | Research, Pattern, Composition, Judge, Intel Structurer | LLM execution (Sonnet or Opus) |
| callLLM() → Haiku | ICP Gate (LLM tier) | Fast classification |
| Apollo.io API | Email Discovery (Step 0, primary) | People match → verified email + confidence |
| MillionVerifier API | Email Discovery (Step 0, post-Apollo) | Deliverability verification → quality/result |
| DuckDuckGo HTML Search | Email Discovery (fallback), Research agents | Web search without API key |
| Supabase Edge Functions | Substrate Search | search-substrate semantic endpoint |
| Supabase Direct | Prospect/Dossier/Engine/Microsite writes | Database read/write |
| Vercel | Microsites, Mission Control | Hosting + deployment |
| HubSpot API | HubSpot Loader | CRM write (manual trigger) |
| HubSpot Meetings | Booking flow | Calendar scheduling with pre-fill |

## ICP Routing (Wave 2 Addition)

Show as a decision diamond after Phase 1:

```
ICP Gate → fiber_operator → (composition gets fiber CTAs, fiber bridges, fiber judge bonus)
         → ae_firm       → (composition gets A&E CTAs, A&E bridges, A&E judge bonus, anti-validation rule)
         → non_icp       → REJECT (stops pipeline)
         → tower A&E     → REJECT (tower signals without fiber override)
```

icpType threads through: Phase 5 (pattern selection) → Phase 6 (composition) → Phase 7 (judge scoring)

## Key for diagram

- Solid boxes: built and working
- Solid boxes with manual icon: built but requires manual trigger (HubSpot Loader)
- Dashed boxes: designed but not yet built
- Green arrows: data flows that are working
- Orange dashed arrows: planned data flows
- Red gate icons: quality gates (reject path shown)
- Purple highlights: external service calls
- Database cylinder: Supabase (central, connected to all lanes)
- Brain cycle icon: learning loop (Phase 3a reads → Phase 3b writes)

## Audience

Justyn Szymczyk, ShowRev founder. Visual learner. This diagram is both a communication tool and an audit tool — if something is missing or fake, it should be obvious from the diagram.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v3 | 2026-06-06 09:55 | Claude | Corrected Email Discovery to reflect actual multi-step orchestrator: Apollo primary → DuckDuckGo fallback → MillionVerifier verification (was described as DuckDuckGo-only + Findymail). Fixed word count gate: 88w T1/T2, 66w T3 per SOT §11 (was incorrectly stated as >80). Updated external services table. Cross-referenced against pipeline-trace-lyte-fiber.md IPO trace to verify all phases match code. |
| v2 | 2026-06-06 07:30 | Claude | Complete rewrite to reflect actual code after Wave 1+2. Added: 9-phase orchestrator backbone, ICP routing (3 types + tower exclusion), Brain learning loop (Phase 3a/3b), semantic verification (Phase 4b), fact verification (Phase 6b), auto-recompose on judge failure, Wave 2 ICP-aware composition/judge features, CSV aeNotes column mapping. Corrected: removed "7-bucket persona" (actually 3 persona buckets), fixed judge dimensions (5 not 4), added cross-model judge, honest build status on HubSpot Loader. |
| v1 | 2026-05-31 12:00 | Claude | Initial architecture visualization prompt. |
