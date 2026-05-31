---
title: Pipeline Extension Specs -- Brain, Intel Structurer, ABM Composer
status: ACTIVE
last_updated: 2026-05-31 15:40 EST
version: v2
purpose: Spec three missing pipeline modules that close the gap between "works for 10 contacts" and "works for 2,300."
---

# Pipeline Extension Specs

Three modules. Each fills a gap identified during engine hardening and Test 2 execution. They're interdependent: the Brain feeds research, research feeds the Intel Structurer, the Intel Structurer feeds both HubSpot and the ABM Composer.

```
Phase 0 Warmup ──► Brain KB (enriched)
                      │
                      ▼
CSV ──► Importer ──► STORM Research ──┬──► Brain Ingest (learning loop)
                                      │
                                      ▼
                                 Intel Structurer ──┬──► sr_brain_dossiers (structured)
                                                    │
                                                    ▼
                                               ABM Composer ──► sr_microsites
```

---

## Module 1: Brain Enrichment

### Problem

The Brain is static markdown. Prospect 1 and prospect 300 get identical industry context. The research personas re-discover the same market facts every time. At 2,300 contacts, this wastes ~80% of research compute on industry-level facts the system already confirmed 50 prospects ago.

### Architecture decision: ShowRev is multi-client, multi-industry

ShowRev will serve clients across fiber telecom, agtech (ClearCost.ag), B2B SaaS, and other verticals. The Brain must be organized hierarchically so knowledge persists at the right level:

```
Layer 1: Industry/Sector     (e.g., fiber telecom, agtech)      — persists across clients
Layer 2: Client               (e.g., Inorsa, ClearCost)          — persists across products/events
Layer 3: Product               (e.g., Inorsa Fiber vs Harmoni)    — persists across events
Layer 4: Event                 (e.g., Fiber Connect 2026)         — persists across target groups
Layer 5: Target Group          (e.g., booth visitors vs cold list) — ephemeral
```

File structure mirrors this:
```
data/brain/
  fiber-telecom/                    # Layer 1: industry
    industry-intelligence.md
    competitor-landscape.md
    entity-graph.jsonl
    inorsa/                         # Layer 2: client
      source-of-truth.md
      client-learnings.md
      fiber/                        # Layer 3: product
        product-constraints.md
        fiber-connect-2026/         # Layer 4: event
          booth-transcripts.md
          brain-synthesis.md
          event-entity-graph.jsonl
          booth-visitors/           # Layer 5: target group
            warmup-log.md
          cold-attendees/
            warmup-log.md
  agtech/                           # Layer 1: different industry
    industry-intelligence.md
    clearcost/                      # Layer 2
      ...
```

### Solution

Two modes:

**Mode A: Phase 0 Warmup (pre-run, collaborative)**

Before processing any contacts, the operator and agent do a structured deep dive. Depth scales by novelty:

| Scenario | Depth | Time | What to research |
|----------|-------|------|-----------------|
| (a) New industry (e.g., agtech for ClearCost) | Deepest | 2-4 hrs | Full market map, competitors, regulatory landscape, key players, trade associations, funding programs, conference circuit |
| (b) Same client, new industry product (e.g., Inorsa Harmoni/cellular) | Medium-deep | 1-2 hrs | Reuse client Layer 2, research new industry vertical, different competitor set, different buyer personas |
| (c) New client, known industry (e.g., Inorsa competitor) | Medium | 45-90 min | Reuse industry Layer 1, research client specifics, product positioning, existing customer base |
| (d) Same client+industry, new event (e.g., fall show) | Light | 20-30 min | Update recent news, M&A, regulatory changes since last event. Analyze new attendee list. |
| (e) Same everything, different target group (e.g., cold attendee list) | Lightest | 10 min | Delta is missing booth interaction context only. Brain already warm. |

File: `brain-warmup.ts`

Inputs:
- Warmup tier (a-e, auto-detected from Brain directory state)
- Operator-supplied seed topics for tier (a) and (b)
- Existing Brain KB files at all populated layers

Process:
1. Scan Brain directory structure. Identify which layers are populated.
2. Determine warmup tier: if industry dir is empty -> (a); if client dir is empty -> (c); etc.
3. For tiers (a)-(c): operator provides seed research questions via CLI prompt
4. Agent executes web research on each (via `claude -p` with WebSearch)
5. Results presented to operator — marks "keep," "discard," "dig deeper"
6. "Dig deeper" items get a second pass
7. Confirmed findings written to appropriate Brain layer files with source URLs and dates
8. Entity graph extracted: companies, relationships, funding, timelines
9. Graph written to the correct layer's `entity-graph.jsonl`

Output:
- Populated Brain layer files (industry intelligence, competitors, client SoT)
- `entity-graph.jsonl` at the appropriate layer
- `warmup-log.md` — what was searched, what was kept, operator notes

CLI:
```bash
npx tsx brain-warmup.ts interactive --client=inorsa --product=fiber --event=fc2026
npx tsx brain-warmup.ts auto --tier=d --client=inorsa --product=fiber --event=fall2026
```

Estimated time: varies by tier (see table above).

**Mode B: Research -> Brain Ingest (during run)**

After each prospect's STORM research completes, the pipeline extracts novel entities and relationships and appends them to the Brain. Subsequent prospects benefit from accumulated knowledge.

File: `brain-ingest.ts`

Inputs:
- Completed research output (3 persona JSONs)
- Existing `brain-entity-graph.jsonl`

Process:
1. Extract entities from research: companies mentioned, funding programs referenced, tools identified, partnerships discovered, market dynamics noted
2. Deduplicate against existing entity graph (match by company name / program name)
3. For genuinely new entities: append to `brain-entity-graph.jsonl`
4. For existing entities with new facts: update the entity's fact list
5. Every 10 prospects: regenerate a `brain-context-digest.md` — a summary of everything the Brain has learned so far, optimized for inclusion in persona prompts

Integration point in premium-pipeline.ts:
```typescript
// After Phase 2 (cross-examination), before Phase 3 (pattern selection)
await ingestResearchIntoBrain(personaResults, prospect, config.outputDir);
```

Persona prompt change:
```
// In buildMultiPersonaPrompt(), add:
const brainDigest = loadBrainDigest(config.outputDir);
// Append to persona prompt context:
`## What we already know from prior research (${entityCount} companies, ${factCount} facts):\n${brainDigest}`
```

Data model — `brain-entity-graph.jsonl`:
```json
{"type":"company","name":"Mohawk Networks","domain":"mohawk-networks.com","segment":"fiber_operator","facts":["Aecon JV July 2025","SBA 8(a)","TBCP Round 1 $500K"],"sources":["aecon.com/..."],"firstSeen":"fc2026-054","lastUpdated":"2026-05-31"}
{"type":"funding","name":"NY BEAD","amount":"$664M","status":"ISP contracts executing","source":"broadband.ny.gov","firstSeen":"fc2026-054"}
{"type":"relationship","from":"Mohawk Networks","to":"Aecon Utilities","type":"JV","since":"2025-07","source":"tribalbusinessnews.com/...","firstSeen":"fc2026-054"}
```

### Cold start mitigation

Phase 0 warmup prevents cold start. Warmup tier determines depth:

- FC2026 booth visitors (89 contacts): tier (d) warmup was done implicitly during the pilot. Brain already warm.
- 2,300 cold attendees: tier (e) — same client, same industry, same event, different target group. Brain carries over from FC2026. Only delta is missing booth context. Lightest warmup (~10 min).
- Future ClearCost.ag engagement: tier (a) — new industry. Deepest warmup needed. Budget 2-4 hours.

### Scaling economics

Without Brain loop: 2,300 contacts x ~$1.50/prospect research = ~$3,450 in API costs
With Brain loop (estimated): industry facts cached after ~50 prospects, research cost drops to ~$0.40/prospect for company-specific only = ~$920 + $75 warmup = ~$995

True cost per 100 prospects will be captured in the post-mortem (including external judges, paid APIs, database, Vercel, git). This informs pricing structure. For now: test at any cost within reason, gated to a thesis validated before opening to full list.

~3.5x cost reduction at scale, plus better research quality (Brain has cross-prospect pattern recognition humans don't).

---

## Module 2: Intel Report Structurer

### Problem

The pipeline produces raw research JSON (3 persona outputs, each 1-3KB of unstructured findings). Nothing transforms this into the 30+ structured HubSpot dossier fields defined in `dossier-schema.ts`. The AE gets raw research text in `research_summary`, not actionable intel fields like `showrev_talking_points`, `showrev_likely_objections`, `showrev_decision_authority`.

### Solution

File: `intel-structurer.ts`

Inputs:
- 3 persona research outputs (analyst, AE proxy, tech evaluator)
- Cross-examination insights
- Prospect metadata (title, company, state)

Process:
1. Single `claude -p` call with a structured extraction prompt
2. Prompt provides all 3 persona outputs + the HubSpot field definitions
3. LLM extracts and maps findings to each field
4. Output validated against field constraints (enumerations, length limits)

Output: `HubSpotDossier` object (from dossier-schema.ts) with all fields populated:

| Field Group | Fields | Extraction source |
|-------------|--------|-------------------|
| Contact intel | research_summary, decision_authority, likely_objections, talking_points, persona_classification, linkedin_summary, other_stakeholders | AE Proxy + cross-exam |
| Company intel | company_summary, company_size, fiber_activities, bead_status, growth_signals, competitive_landscape, key_projects, recent_news, external_deadlines | Industry Analyst + Tech Eval |
| Sales intel | influence_pattern, challenger_insight, buying_timeline, deal_size_estimate, signal_strength, fit_rationale, next_best_action, risk_factors, multi_thread_contacts | All 3 personas + pattern selection |
| Email sequence | t1-t3 subjects, bodies, PS lines | From composer output |

Integration point in premium-pipeline.ts:
```typescript
// After Phase 4 (email composition), before Phase 5 (mechanical checks)
const structuredDossier = await structureIntelReport(personaResults, crossExamQuestions, prospect, emails);
// structuredDossier is a HubSpotDossier object ready for AE prep sheet generation
```

AE prep sheet: `formatDossierForAE(structuredDossier)` already exists in dossier-schema.ts. Once the structurer populates the dossier, the AE prep sheet auto-generates.

### Quality gate

The structurer prompt includes a self-check:
- Any field marked `"[insufficient data]"` triggers a warning (not a failure)
- `decision_authority` must be one of: Budget owner, Influencer, Champion, Unknown
- `signal_strength` must be one of: Strong, Good, Possible, Weak, No fit
- `persona_classification` must match one of the 7 buckets

---

## Module 3: ABM Microsite Composer

### Problem

The email P.S. links to `fiber.inorsa.com/brief/[slug]` but nothing auto-populates the microsite content. The `sr_microsites` table needs: `headline`, `insight_text`, `case_study_text`, `company_name`, `ae_name`, `ae_booking_url`, `ae_photo_url`. Currently these are manually created.

### Solution

File: `microsite-composer.ts`

Inputs:
- Structured dossier (from Intel Structurer — Module 2)
- Pattern selection (challenger insight, influence pattern)
- AE info (name, email, booking URL, photo URL)
- Prospect info (name, title, company)

Process:
1. Compose `headline` — the single most compelling finding from research, written as a question or provocation (not a product pitch). Max 15 words.
2. Compose `insight_text` — 2-3 sentences expanding on the headline. Uses the challenger insight. Specific to this company.
3. Select `case_study_text` — match closest case study from a library of 3-5 anonymized proof points based on segment and persona bucket.
4. Set AE fields from territory mapping.
5. Validate: headline isn't generic, insight mentions company by name, case study matches segment.

Output: `sr_microsites` row ready for upsert.

Data model — sr_microsites row:
```json
{
  "slug": "mohawk-networks-llc",
  "prospect_id": "fc2026-054",
  "run_id": "run-20260531-273u",
  "company_name": "Mohawk Networks",
  "recipient_name": "Jason Hall",
  "recipient_title": "Tribal Broadband Project Manager",
  "headline": "The Aecon JV made Mohawk Networks design-of-record. But your contract history is installation.",
  "insight_text": "The July 2025 JV with Aecon assigned network design delivery to Mohawk Networks' side of the house. With the NTIA Spring 2026 tribal NOFO releasing $500M+ in new pipeline, permit-ready construction packages are a contract obligation, not a nice-to-have.",
  "case_study_text": "A tribal broadband provider automated their permit drawings and cut review cycles from 3 weeks to 2 days across 4 jurisdictions.",
  "ae_name": "Mike Rutski",
  "ae_title": "Sr. Account Executive",
  "ae_email": "mike@inorsa.com",
  "ae_phone": "",
  "ae_booking_url": "https://meetings.hubspot.com/mike-rutski",
  "ae_photo_url": "/assets/ae/mike-rutski.jpg",
  "status": "live"
}
```

Integration point in premium-pipeline.ts:
```typescript
// After Intel Structurer, before Supabase write
const micrositeRow = await composeMicrositeContent(structuredDossier, patternSelections[0], ae, prospect, micrositeSlug, config.runId);
await writeMicrositeToSupabase(micrositeRow);
```

### Case study library

No real case studies exist yet (new product for Inorsa). Strategy: generate plausible anonymized case studies, gate through client marketing (Chris at Inorsa) before use. As real customer outcomes arrive, replace generated with real.

Stored in `data/brain/{industry}/{client}/case-study-library.json`:
```json
[
  {"id": "cs-001", "segment": "fiber_operator", "persona": "build_pace", "text": "...", "status": "generated", "approved_by": null},
  {"id": "cs-002", "segment": "ae_firm", "persona": "drawings_quality", "text": "...", "status": "approved", "approved_by": "chris-balandran"}
]
```

Case study selection: match `segment` first, then `persona_bucket`. Only use `status: "approved"` in production runs. Generated-but-unapproved can appear in dry-run output for operator review.

### ABM as an innovation space (operator directive)

The microsite/ABM layer is explicitly NOT a settled spec. The current "Field Brief" format is the baseline, not the ceiling. The operator wants room for experimentation with tactics including:

- **Simulation / Gamification** — modern game mechanics to capture attention and drive engagement. Completion theory, loss aversion, attractive prizes, peer competition. Could be live at the booth or online.
- **Work product samples** — for Inorsa, this means the prospect sends a few design files and gets them run through Inorsa's AI. The microsite becomes a proof-of-value delivery vehicle, not just an info page.
- **Interactive content** — T2 touch could deliver value (not just ask for time). The microsite evolves per touch.
- **Differentiation mandate** — "do something fucking different from everyone else." The ABM layer is where ShowRev creates unfair advantage for clients.

Architecture implication: `microsite-composer.ts` should output a `format` field (e.g., `field-brief`, `interactive-demo`, `gamified-challenge`, `work-product-preview`) and the microsite renderer should support multiple formats. The current `field-brief-template.html` is format #1. Future formats get their own templates.

This section will expand as we test and ideate. For now, build the baseline composer that produces Field Brief content, and leave the `format` field extensible.

---

## Pipeline phase map (updated)

```
Phase 0:  Brain Warmup (pre-run, once per project)
Phase 1:  CSV Import + ICP Classification              importer.ts
Phase 2:  STORM 3-Persona Research                      personas.ts + researcher.ts
Phase 2b: Brain Ingest (extract entities, update KB)    brain-ingest.ts         [NEW]
Phase 3:  Influence Pattern Selection                   influence.ts
Phase 4:  Email Composition                             influence.ts buildComposerPrompt
Phase 5:  Intel Report Structuring                      intel-structurer.ts      [NEW]
Phase 6:  ABM Microsite Composition                     microsite-composer.ts    [NEW]
Phase 7:  Mechanical Quality Checks                     judge.ts runMechanicalChecks
Phase 8:  Cross-Model Judging (optional)                cross-model-judge.ts
Phase 9:  Supabase Write (dossier + microsite + prospect status)
Phase 10: Output files (JSON + Markdown)
```

---

## Dependency order for build

1. **Brain Ingest** first — it changes what research produces, which affects everything downstream
2. **Intel Structurer** second — depends on research output format, feeds ABM Composer
3. **ABM Composer** third — depends on structured dossier from Intel Structurer

Estimated build time: 2-3 sessions total. Brain Ingest is the most complex (entity extraction + dedup + digest generation). Intel Structurer is one well-crafted prompt + validation. ABM Composer is the simplest (template + case study matching).

---

## Operator decisions (resolved 2026-05-31)

1. **Phase 0 warmup scope:** Depth scales by novelty tier (a-e). See Module 1. New industry = hours. Same event, different target = 10 min.

2. **Brain persistence:** YES. FC2026 Brain carries into 2,300-contact cold project. Only delta is missing booth context. Tier (e) warmup.

3. **Case study library:** Generate plausible anonymized case studies. Gate through Chris (Inorsa Marketing) before use in production. Replace with real outcomes as they arrive.

4. **Intel Structurer cost:** YES, build it. Development mode: test at any cost within reason, gated to thesis. Post-mortem will capture true cost per 100 prospects to derive pricing structure.

5. **Microsite content:** Defer settling on a single approach. Design tests to validate which format performs best. ABM is an innovation space — leave room for experimentation (gamification, work product samples, interactive content). Data leads these decisions.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 15:27 | Claude | Initial spec. Three modules: Brain Enrichment, Intel Structurer, ABM Composer. Pipeline phase map updated. |
| v2 | 2026-05-31 15:40 | Claude | Operator decisions applied. Brain hierarchy (5 layers), Phase 0 tiers by novelty, ABM as innovation space, case study gate through client marketing. |
