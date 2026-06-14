---
title: ShowRev Pipeline — Real-Life Trace
status: ACTIVE
last_updated: 2026-06-07 15:30 EST
version: v1
---

# ShowRev Pipeline — Real-Life Trace

Live trace using **Ryan Kudera, Project Manager, Finley Engineering** (run-20260607-6imd).
Total elapsed: **385.9 seconds** (6.4 min). All phases passed.

---

## Phase 1: ICP Gate (49ms)

**Input:** Company name + title from CSV row.
**What it does:** Regex + keyword matching against known ICP patterns (fiber operator, A&E firm, co-op, ISP, MSO, utility). Fast local check — no API call.
**Decision:** Does this company/title match Inorsa's ICP?

```
Company: "Finley Engineering" → matches ae_firm pattern
Title: "Project Manager" → relevant (design/construction role)
Verdict: PASS — ae_firm
```

**If FAIL:** Prospect is rejected. Pipeline writes rejection reason to `sr_prospects` (Mission Control shows it) and stops. No email find, no research, no API spend.

**OKR:** Reject non-ICP before burning pipeline time. False positive (letting through a non-ICP) costs $0.50-$2.00 in wasted API calls. False negative (rejecting a real ICP) loses a prospect. Bias toward pass — gate errors default to pass.

---

## Phase 2: Email Discovery (931ms)

**Input:** First name, last name, company name, company URL.
**What it does:**
1. **Apollo People Match** (primary) — queries Apollo.io for verified email
2. If Apollo fails → **pattern detection** + **SMTP/Autodiscover verification** + **MillionVerifier deliverability check**
3. **Confidence gate** — scores the email (green/yellow/red)

```
Apollo People Match: r.kudera@finleyusa.com (verified, high confidence)
MillionVerifier: quality=good, result=ok
Confidence: green (score=high)
```

**If no email found:** Pipeline continues to research (for Mission Control context) but composition is blocked. Prospect marked `email_pending` in Supabase.

**If confidence=red:** Email is stored but marked BLOCKED. Tim sees it in Mission Control with a warning. Not auto-enrolled in sequences.

**OKR:** Find the correct email with green confidence. Target: 85%+ accuracy on calibration set.

---

## Phase 2b: Prospect Upsert (63ms)

**Input:** All prospect data gathered so far + AE assignment (by state).
**What it does:** Upserts a row to Supabase `sr_prospects` table so Mission Control shows the prospect immediately (before research/composition finish).
**Writes:** first_name, last_name, company, title, state, email, email_confidence, icp_status, icp_reason, icp_type, ae_assigned, lead_type, mv_quality.

```
AE assigned: unassigned (Finley is MO/WY — no territory mapping yet)
Status: icp_pass
Upserted to sr_prospects ✓
```

**OKR:** Mission Control shows the prospect within seconds of pipeline start, not after 6 min of research.

---

## Phase 3a: Brain Context Query (568ms)

**Input:** Company name + title + state → semantic query string.
**What it does:**
1. Tries **AgentDB HNSW search** first (vector similarity, 384-dim embeddings)
2. Falls back to **JSONL entity graph keyword filter**
3. Falls back to **brain digest** (general industry context)

```
Query: "Finley Engineering Project Manager fiber broadband WY"
AgentDB: not available (fell through)
JSONL filter: 5 relevant entities found
  - [company] Finley Engineering: Kansas BEAD exposure, fiber design firm...
  - [regulation] BEAD: construction ramp Q3 2026...
  - [person] David Wojcik: Chief Client Officer at Finley...
Injected as cacheable system content for research phase
```

**Why it matters:** Research personas get prior knowledge about this company from earlier pipeline runs. The brain accumulates — each prospect teaches the next.

**OKR:** Provide relevant context so research doesn't start from zero. Brain should have entity data for any company run before.

---

## Phase 3: 3-Persona Research (107,270ms = 1.8 min)

**Input:** Prospect context (name, title, company, ICP type) + brain context + persona prompts.
**What it does:** Spawns 3 parallel LLM calls, each with a different research persona:

| Persona | Focus | Searches for |
|---------|-------|--------------|
| **Industry Analyst** | Market position, funding, competitive landscape | BEAD awards, revenue, headcount, market share, recent news |
| **AE Proxy** | Pain points, buying triggers, objection surface | Job postings, org chart, tech stack, vendor relationships |
| **Technical Evaluator** | Tools, workflows, capacity constraints | GIS/CAD tools, drawing standards, team size, production bottlenecks |

```
Industry Analyst: Finley Engineering — 750+ employees, 7 offices across Midwest,
  Kansas BEAD ~$452M construction ramp, serves rural co-ops/ISPs...
AE Proxy: Hiring CAD Technician + OSP Designer + GIS Specialist simultaneously,
  3:1 job-to-candidate ratio in fiber design, fixed-fee project pressure...
Technical Evaluator: Uses AutoCAD + ArcGIS, GIS-to-CAD manual redraw cycle,
  permitting varies by jurisdiction, BEAD clients in KS/MO/IA/NE...
```

**Model:** claude-sonnet-4-6 (max_tokens=8192 per persona)
**Cost:** ~$0.30-$0.60 total for 3 parallel calls with brain cache

**If partial failure:** Pipeline continues with available research. Missing persona data means weaker composition but not a hard stop. Full failure (all 3) → composition falls back to generic.

**OKR:** Surface at least 2 specific, verifiable facts per prospect that connect to Inorsa's value prop.

---

## Phase 3b: Brain Ingest (42ms)

**Input:** Raw research text from all 3 personas.
**What it does:** Extracts structured entities from research and appends them to the entity graph JSONL file. Entities: company, funding, person, tool, regulation, market_dynamic, relationship.

```
Extracted: 9 new entities
  - [company] Finley Engineering (updated with new facts)
  - [regulation] Kansas BEAD (updated: $452M, Q3 2026)
  - [tool] AutoCAD (fiber design usage)
  - [tool] ArcGIS (GIS-to-CAD workflow)
  - [market_dynamic] 3:1 fiber designer shortage
  - ... 4 more
Appended to: data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026/entity-graph.jsonl
```

**Why:** Each pipeline run enriches the brain. The next prospect at a competing firm gets this knowledge for free via Phase 3a.

**OKR:** Extract entities from research without hallucination. Quality > quantity.

---

## Phase 3c: Intel Structurer (26,852ms = 27s)

**Input:** All 3 persona research outputs + prospect metadata.
**What it does:** LLM call that maps raw research into ~29 structured HubSpot dossier fields.

```
Key output fields:
  company_summary: "Finley Engineering is a 750+ employee telecom engineering firm..."
  bead_status: "Kansas BEAD $452M, construction starts Q3 2026"
  growth_signals: "Hiring 4 fiber roles simultaneously, BEAD ramp"
  decision_authority: "Wesley Kudera (VP), David Wojcik (VP Engineering)"
  persona_classification: ops_builder
  competitive_landscape: "Competes with Colliers, Hi-Line, regional firms"
  pain_points: "Drawing throughput bottleneck, GIS-to-CAD manual, hiring lag"
  buying_triggers: "BEAD timeline pressure, 4 simultaneous openings unfilled"
  ...
```

**Writes:** Stored in `result.structuredIntel` (passed to composition phase). Also written to `sr_engine_output` in Phase 9.

**OKR:** Every field must be evidence-backed from research (no hallucination). persona_classification drives which email template fires.

---

## Phase 4: Substrate Search (1,522ms)

**Input:** Company + title + state → semantic query.
**What it does:** Calls Supabase Edge Function `search-substrate` — semantic search across the substrate library (proven email patterns, successful subject lines, competitive intel anchors).

```
Query: "Finley Engineering Project Manager fiber construction"
Matches: 8 semantic hits
  - loss_aversion patterns from similar A&E firms
  - challenger_insight patterns for ops_builder persona
  - curiosity_gap patterns for fiber design context
```

**Why:** Substrate is the "what worked before" library. Composition uses these patterns as templates.

**OKR:** Return relevant, persona-matched substrate patterns. Diversity matters — 3+ distinct pattern types.

---

## Phase 5: Pattern Selection (55,817ms = 56s)

**Input:** Research summary + structured intel + substrate matches + persona.
**What it does:** LLM selects the best persuasion pattern for each touch (T1, T2, T3) based on prospect context. Patterns come from behavioral psychology (loss aversion, reciprocity, curiosity gap, challenger insight, social proof, authority, scarcity).

```
T1 (cold open): loss_aversion — BEAD timeline pressure + unfilled roles
T2 (follow-up): reciprocity — offering brief/intel before asking
T3 (breakup): curiosity_gap — question about drawing throughput ceiling
```

**Model:** claude-sonnet-4-6 (3 sequential calls, one per touch)

**OKR:** Each touch uses a DIFFERENT pattern. No repetition across the sequence. Pattern must align with persona (ops_builder gets operational patterns, revenue_leader gets business patterns).

---

## Phase 6: Composition (105,728ms = 1.8 min)

**Input:** Everything — research, intel, patterns, persona, substrate, brain context, hard constraints.
**What it does:** LLM composes the actual email bodies (T1, T2, T3). Each has strict constraints:

- Word count: T1=80w, T2=80w, T3=60w (+10% flex)
- Salutation: `[FirstName],` (comma only, no greeting word)
- Pitch variant (rotated): "We convert your GIS and LLD data into construction and permit drawings in minutes..."
- Subject line: specific, not salesy
- P.S.: microsite link with brief description
- No flattery, no "I hope this finds you well"
- One specific question per email

```
T1 Subject: "Five open fiber roles and one question"
T1 Body (85 words):
  Ryan, Finley Engineering's careers page shows open roles for a CAD Technician,
  OSP Designer, GIS Specialist, and Permitting Specialist, all simultaneously...
  [Full body as shown in pipeline output]

T2 Subject: "Finley Engineering's fiber capacity in Q3 2026"
T3 Subject: "Finley's Q3 design surge, hiring won't close it"
```

**Model:** claude-sonnet-4-6 (3 parallel calls, one per touch)

**OKR:** Pass judge gate on first attempt. Word count within flex ceiling. Research-anchored (specific facts, not generic). One question per email.

---

## Phase 7: Judge Gate (85,966ms = 1.4 min)

**Input:** Composed emails + source of truth constraints.
**What it does:** LLM judges each email against mechanical rules AND quality dimensions:

**Mechanical checks (binary pass/fail):**
- Salutation format correct?
- Pitch verbatim present?
- P.S. with microsite link?
- Word count within bounds?
- No forbidden phrases?
- No flattery opener?

**Quality dimensions (1-10 scale):**
- research_depth — how specific/verifiable are the facts?
- vp_connection — does it connect to Inorsa's value prop?
- tone — sounds like peer, not vendor?
- conciseness — tight writing, no padding?
- jtbd_alignment — addresses a job-to-be-done the recipient cares about?

```
Results:
  mechanicalPass: 9/10
  T1: research_depth=8, vp_connection=7, tone=8, conciseness=6, jtbd=9 → avg 7.6
  T2: research_depth=8, vp_connection=7, tone=6, conciseness=5, jtbd=8 → avg 6.8
  T3: research_depth=7, vp_connection=7, tone=8, conciseness=7, jtbd=8 → avg 7.4
  Verdict: PASS
```

**If FAIL:** Auto-recompose the failed touches (up to 2 retries). Recomposition prompt includes the judge's specific failures. If still fails after 3 attempts → outputs `[Composition error]` and flags for manual review.

**OKR:** ≥7.0 average across quality dimensions. 0 mechanical failures. Pass rate target: ≥80% of prospects pass judge on first attempt.

---

## Phase 8: Microsite Content (796ms)

**Input:** Structured intel + research + prospect metadata.
**What it does:** Generates brief page content for `fiber.inorsa.com/brief/{slug}`. Upserts to Supabase `sr_microsites` table with: slug, company, prospect_name, title, brief_html, logo_url.

```
Slug: finley-engineering-ryan-kudera
Logo: https://logos.hunter.io/finleyusa.com
Content: Company brief + capacity analysis + BEAD exposure + team insights
Upserted to sr_microsites ✓
```

**OKR:** Microsite must exist BEFORE email sends. Brief must be factual (no hallucination — sourced from research). Target length: 100-150 words (cold prospects).

---

## Phase 9: Supabase Write (327ms)

**Input:** Complete pipeline result object.
**What it does:** Writes the full engine output to `sr_engine_output` table — email bodies, subjects, judge scores, research summary, structured intel, phase timings, errors.

```
Row key: ryan-kudera-finley-engineering
Fields written: 45+ columns
  - email_subjects (t1, t2, t3)
  - email_bodies (t1, t2, t3)
  - email_ps (t1, t2, t3)
  - judge_scores (full breakdown)
  - persona_classification
  - structured_intel (JSON)
  - phase_timings (JSON)
  - run_id, lead_type, ae_assigned
Written to sr_engine_output ✓
```

**OKR:** Mission Control can display full prospect view with all touches, scores, and timing data. Ops portal reads from this table.

---

## Components NOT Called (by design)

| Component | Why skipped | When it fires |
|---|---|---|
| **Cross-model judge** | Only fires for T1-only high-stakes prospects | When enabled via `--cross-model-judge` flag |
| **HubSpot enrollment** | Pipeline doesn't auto-enroll. Tim reviews first. | Manual trigger after Tim approval in Mission Control |
| **AE territory assignment** | No state→AE mapping for MO/WY yet | When all AE territories are configured |
| **MillionVerifier batch verify** | Only fires when MV key is present AND email source != Apollo verified | When Apollo returns low-confidence match |
| **Overnight backlog queue** | Not built yet | Future: failed prospects route here for high-effort retry |

---

## Cost Breakdown (estimated per prospect)

| Phase | API calls | Est. cost |
|---|---|---|
| ICP Gate | 0 (local regex) | $0.00 |
| Email Find (Apollo) | 1 | ~$0.01 |
| Brain Context | 0 (local JSONL) | $0.00 |
| Research (3 personas) | 3 parallel Sonnet calls | ~$0.30 |
| Brain Ingest | 0 (local extraction) | $0.00 |
| Intel Structurer | 1 Sonnet call | ~$0.10 |
| Substrate Search | 1 Supabase function | $0.00 |
| Pattern Selection | 3 Sonnet calls | ~$0.15 |
| Composition | 3 Sonnet calls | ~$0.20 |
| Judge | 1 Sonnet call (scores all 3) | ~$0.10 |
| Microsite | 0 (templated from intel) | $0.00 |
| Supabase Write | 2 DB writes | $0.00 |
| **TOTAL** | ~12 LLM calls | **~$0.85/prospect** |

---

## Telemetry Output

Every run writes a telemetry JSON to `data/showrev/premium/telemetry/run-{date}-{id}-telemetry.json` with:
- Per-prospect phase timings
- Pass/fail rates by phase
- Bottleneck identification
- Error details
- Summary statistics

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-07 15:30 | Claude | Initial trace using Ryan Kudera / Finley Engineering |
