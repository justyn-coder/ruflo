---
title: Pipeline Trace — Aamer Abbasi @ Lyte Fiber
status: ACTIVE
last_updated: 2026-06-06 10:15 EST
version: v1
format: IPO Trace (Input → Process → Output per module)
---

# Pipeline Trace: Aamer Abbasi @ Lyte Fiber

**Run date:** 2026-06-06 ~09:50 EDT (dry run)
**Total time:** 194.0 seconds (~3.2 minutes)
**Final verdict:** PASS (avg 7.8 → SEND)
**Word count:** 83 words (ceiling: 88)

This trace follows one prospect through every pipeline module, showing what goes in, what happens inside, and what comes out. Jargon is defined in brackets on first use.

---

## Starting Input (CSV row)

| Field | Value |
|-------|-------|
| first_name | Aamer |
| last_name | Abbasi |
| company | Lyte Fiber |
| title | SVP, Engineering & Technology |
| state | TX |
| email | *(not provided — pipeline must find it)* |

**Source:** `data/showrev/test/wave2-focus100-test.csv`, row 1

---

## Phase 1: ICP Gate

**Purpose:** Decide if this prospect is worth spending pipeline time on. Rejects non-ICP [Ideal Customer Profile — the type of company/person Inorsa sells to] prospects before any expensive API calls.

### What goes in
| Field | Value |
|-------|-------|
| company | Lyte Fiber |
| title | SVP, Engineering & Technology |

### What happens inside
1. **Regex classifier runs first** (free, instant). Checks company name against pattern lists:
   - Fiber operator signals: words like "fiber", "broadband", "telecom", "communications"
   - A&E firm signals [Architecture & Engineering firms that design fiber networks]: words like "engineering", "design", "construction"
   - Non-ICP signals: words like "consulting", "software", "staffing"
2. "Lyte Fiber" matches `fiber` → classified as **fiber_operator** with 1 signal
3. Because regex got a confident match, the LLM fallback [backup AI classifier, costs ~$0.001 per call] is skipped

### What comes out
| Field | Value |
|-------|-------|
| verdict | PASS |
| icpType | fiber_operator |
| reason | Company matches fiber operator indicators (1 signals) |
| method | regex (no LLM needed) |

### Gate rule
- **PASS** → continue to Phase 2
- **REJECT** → pipeline stops, prospect marked as non-ICP in database, no further API spend
- **Error** → defaults to PASS (fail-open so we don't accidentally skip good prospects)

---

## Phase 2: Email Discovery

**Purpose:** Find the prospect's work email. Required for sending the email later.

### What goes in
| Field | Value |
|-------|-------|
| firstName | Aamer |
| lastName | Abbasi |
| company | Lyte Fiber |

### What happens inside
1. **Apollo lookup** [paid contact database API]: searches for "Aamer Abbasi" at "Lyte Fiber"
   - Apollo returns: `aamer.abbasi@lytefiber.com` (status: verified, confidence: high)
2. **MillionVerifier check** [email verification service — confirms the address actually receives mail]:
   - Result: quality=good, result=ok
   - This prevents sending to dead/bouncing addresses
3. Email is assigned a confidence color:
   - **Green** = verified by both Apollo + MV → safe to send
   - **Yellow** = partially verified → proceed with caution
   - **Red** = unverified or problematic → flag for manual review

### What comes out
| Field | Value |
|-------|-------|
| email | aamer.abbasi@lytefiber.com |
| confidence | green |
| source | Apollo (verified) + MillionVerifier (good) |

### Gate rule
- **Email found (green/yellow)** → continue
- **No email found** → pipeline continues through research (builds the dossier) but skips composition. The research is still valuable for when email is found later.

---

## Phase 2b: Prospect Upsert

**Purpose:** Write the prospect record to the database so Mission Control [the internal dashboard] can track them.

### What goes in
| Field | Value |
|-------|-------|
| All CSV fields | + email + ICP result + AE assignment |
| AE [Account Executive — the salesperson] | Nathan Dunn (Central territory, based on TX state) |

### What happens inside
1. Creates/updates a row in `sr_prospects` table [Supabase database table]
2. Generates a slug [URL-friendly identifier]: `aamer-abbasi-lyte-fiber`
3. **Dry run mode**: logs what it would write but doesn't actually write

### What comes out
| Field | Value |
|-------|-------|
| prospectUpserted | true (would be — dry run) |
| slug | aamer-abbasi-lyte-fiber |
| assigned AE | Nathan Dunn |

### Gate rule
- Non-blocking — if this fails, pipeline continues (prospect can be upserted later)

---

## Phase 3a: Brain Context Query

**Purpose:** Check if we already know anything about this company from previous research. Avoids re-discovering facts the system already learned.

### What goes in
| Field | Value |
|-------|-------|
| search query | "Lyte Fiber SVP, Engineering & Technology fiber broadband TX" |
| search target | Brain entity graph [a knowledge base of companies/people/facts stored locally] |

### What happens inside
1. **AgentDB semantic search** [vector similarity search — finds conceptually related entries, not just keyword matches]:
   - Loads HNSW index [a fast nearest-neighbor search algorithm]
   - Searches for entries related to query
   - Result: **no company-specific matches** (Lyte Fiber hasn't been researched before)
2. **Fallback: Brain digest** [a condensed summary of the entire knowledge base]:
   - Loads the industry digest (general fiber/telecom context)
   - Provides general market context to the research personas
3. Injects context into the LLM prompt cache [pre-loaded content that makes subsequent AI calls faster and cheaper]

### What comes out
| Field | Value |
|-------|-------|
| brainContext | digest loaded (no company-specific matches) |
| entries found | 0 company-specific, general digest provided |

### Gate rule
- Non-blocking — research proceeds with or without prior brain context. If context exists, research is better-grounded.

---

## Phase 3: 3-Persona Research (STORM)

**Purpose:** Deep-research the prospect from three different angles to build a complete picture. This is the most expensive phase (~60-80% of total pipeline cost per prospect).

### What goes in
| Field | Value |
|-------|-------|
| firstName | Aamer |
| lastName | Abbasi |
| company | Lyte Fiber |
| title | SVP, Engineering & Technology |
| state | TX |
| brain context | General fiber industry digest |
| AE notes | *(none provided)* |

### What happens inside
Three AI research personas [specialized AI prompts that research from different angles] run in parallel:

1. **Industry Analyst** — researches the company: size, markets, funding, competitive position, recent news. Looks at public sources, BEAD allocations [federal broadband funding program], state-level fiber deployment data.

2. **AE Proxy** [simulates an Account Executive's perspective] — researches the person: their role responsibilities, likely pain points, what would make them take a meeting. Considers the SVP Engineering title → manages engineering teams, drawing throughput, permit workflows.

3. **Technical Evaluator** — researches technical fit: what tools/platforms the company likely uses, where Inorsa's product would plug in, technical objections to anticipate.

Each persona makes web search calls and synthesizes findings into a structured report (~500-1000 words each).

### What comes out
| Field | Value |
|-------|-------|
| researchSummary | ~3000 words across 3 personas |
| Key findings | Lyte Fiber is a TX-based regional fiber operator; TX received ~$3.3B BEAD; Abbasi oversees engineering org; likely manages drawing production at scale |
| Duration | ~60-90 seconds (parallel execution) |

### Gate rule
- If research fails entirely → composition phase is skipped (can't write a personalized email without research)
- If one persona fails → the other two still contribute

---

## Phase 3b: Brain Ingest

**Purpose:** Extract facts from the research and store them in the Brain [knowledge base] so future prospects at the same company (or in the same market) benefit from what we just learned.

### What goes in
| Field | Value |
|-------|-------|
| research output | All 3 persona reports |
| prospect ID | aamer-abbasi-lyte-fiber |

### What happens inside
1. LLM extracts entities [structured facts] from the research text:
   - Companies, people, funding amounts, technology stacks, competitive landscape
2. Each entity is checked against the existing entity graph:
   - New entities are added
   - Existing entities are updated with new facts
3. Entity graph is written to `data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026/entity-graph.jsonl`
4. If this is every 10th prospect, the digest is regenerated [condensed summary rebuilt to include new knowledge]

### What comes out
| Field | Value |
|-------|-------|
| entities extracted | 18 total (1 new, 17 updated) |
| digest refreshed | Yes (first prospect in run) |

### Gate rule
- Non-blocking — if brain ingest fails, pipeline continues. The email still gets composed; we just lose the knowledge for future runs.

---

## Phase 3c: Intel Structurer

**Purpose:** Convert the free-text research into structured fields that map to HubSpot CRM properties [the database fields Inorsa's sales team sees in their CRM].

### What goes in
| Field | Value |
|-------|-------|
| research reports | All 3 personas |
| prospect object | name, title, company, state, email |
| assigned AE | Nathan Dunn |

### What happens inside
1. LLM reads all research and fills a structured template with fields like:
   - `sr_fit_rationale` — why Inorsa is relevant to this prospect
   - `sr_challenger_insight` — a specific insight that challenges the prospect's current approach
   - `sr_likely_objections` — what the prospect will push back on
   - `sr_decision_authority` — whether this person can say yes
   - `sr_competitive_landscape` — who else is selling to this company
   - Plus ~25 more fields organized by MEDDPICC [a B2B sales qualification framework]
2. Fields that can't be determined from research are marked `[insufficient data]`

### What comes out
| Field | Value |
|-------|-------|
| fields populated | 29 |
| warnings | 0 |

### Gate rule
- Non-blocking — if structuring fails, composition still works (it uses raw research text). But the HubSpot dossier won't have structured fields for the sales team.

---

## Phase 4: Substrate Search

**Purpose:** Find semantically similar content from the substrate [a curated library of messaging patterns, competitive intel, and industry context] to enrich the email composition.

### What goes in
| Field | Value |
|-------|-------|
| company | Lyte Fiber |
| title | SVP, Engineering & Technology |
| state | TX |
| icpType | fiber_operator |

### What happens inside
1. Searches the substrate (stored in `data/showrev/premium/research/`) using semantic similarity
2. Finds messaging patterns, competitor references, and contextual hooks that match this prospect's profile
3. Returns the top matches ranked by relevance score

### What comes out
| Field | Value |
|-------|-------|
| semantic matches | 8 |
| substrate context | Loaded into composition prompt |

### Gate rule
- Non-blocking — if no substrate matches, composition uses research alone

---

## Phase 4b: Semantic Verification

**Purpose:** Fact-check the research claims before they can end up in an email. Prevents the pipeline from composing emails that contain unverifiable or false claims.

### What goes in
| Field | Value |
|-------|-------|
| research text | Full ~3000-word research summary |
| company | Lyte Fiber |
| prospect ID | aamer-abbasi-lyte-fiber |

### What happens inside
1. LLM scans research for verifiable claims, categorized by type:
   - `dollar_amount` — funding figures, revenue numbers
   - `bead_award` — federal broadband funding allocations
   - `acquisition` — M&A activity
   - `employee_count` — headcount estimates
2. Each claim is cross-checked via web search against authoritative sources:
   - **Tier 1 sources** [most trustworthy]: government databases (NTIA, USAC, FCC)
   - **Tier 2**: industry publications, press releases
   - **Tier 3**: LinkedIn, social media, forums
3. Claims are marked:
   - **VERIFIED** — confirmed by Tier 1/2 source with URL
   - **UNVERIFIED** — no confirming source found (doesn't mean false, just can't confirm)
   - **BLOCKER** — claim that could damage credibility if wrong

### What comes out
| Field | Value |
|-------|-------|
| total claims checked | 12 |
| verified | 5 (with Tier 1 source URLs) |
| flagged/unverified | 7 |
| blockers | 1: BEAD award claim — "$3.3 billion" is the TX state allocation, not a Lyte Fiber-specific award |

### Gate rule
- **Blockers are surfaced to the Judge (Phase 7)** — the Judge decides whether the composed email dangerously relies on an unverified claim
- This phase does NOT stop the pipeline — it feeds intelligence to the composition and judging phases

---

## Phase 5: Pattern Selection

**Purpose:** Choose the email persuasion pattern [a proven email structure designed to trigger a specific psychological response] for T1.

### What goes in
| Field | Value |
|-------|-------|
| prospect profile | Aamer Abbasi, SVP Engineering, Lyte Fiber, TX |
| research summary | Full 3-persona output |
| icpType | fiber_operator |
| touches requested | [1] (T1 only) |

### What happens inside
1. LLM evaluates which persuasion pattern best fits this prospect based on their role, company situation, and research findings
2. Available patterns include:
   - `challenger_insight` — leads with a provocative industry insight the prospect hasn't considered
   - `curiosity_gap` — opens with an unresolved question that compels the prospect to respond
   - `loss_aversion` — frames the risk of NOT acting (e.g., falling behind competitors)
   - `social_proof` — references what similar companies are doing
   - `status_quo_disruption` — challenges the prospect's current approach directly
3. Also selects:
   - **Challenger insight** — the specific insight to lead with
   - **Emotional frame** — the underlying emotion to target
   - **CTA type** [Call To Action — what you're asking them to do] — e.g., "interest_based" (soft), "binary_close" (direct)
   - **P.S. strategy** — what to include in the postscript (microsite link, case study, etc.)

### What comes out
| Field | Value |
|-------|-------|
| T1 pattern | loss_aversion |
| emotional frame | *(set by LLM based on research)* |
| CTA type | *(set by LLM)* |
| P.S. strategy | *(set by LLM)* |

### Gate rule
- If pattern selection fails → falls back to safe defaults: `challenger_insight` for T1, `curiosity_gap` for T2, `social_proof` for T3

---

## Phase 6: Email Composition

**Purpose:** Write the actual email — subject line, body, and P.S. — using the research, pattern, and substrate context.

### What goes in
| Field | Value |
|-------|-------|
| prospect | Aamer Abbasi, SVP Engineering & Technology, Lyte Fiber |
| pattern | loss_aversion |
| research summary | Full 3-persona output (~3000 words) |
| substrate context | 8 semantic matches |
| structured intel | 29 populated fields |
| AE sender | Nathan Dunn (nathan@inorsa.com) |
| microsite slug | lyte-fiber-aamer-abbasi |
| pitch variant | Selected by persona detection (ops_builder / technical_designer / capacity_manager) |
| word count rules | Target 65-78 words, hard ceiling 88 words |

### What happens inside
1. **Persona detection**: title "SVP, Engineering & Technology" maps to a persona that determines which pitch variant to embed
2. **Composer prompt built** (`influence.ts` → `buildComposerPrompt()`):
   - Injects: salutation rules, word count limits, pattern instructions, research context, pitch verbatim, anti-validation rules, AE signature, microsite URL
   - The prompt is ~4000-5000 tokens including all context
3. **LLM generates** the email as JSON: `{subject, body, ps}`
4. **Post-processing**:
   - Em-dashes replaced with commas (copy rule)
   - Salutation cleaned (ensure `[FirstName],` format)
   - AE signature block stripped if LLM hallucinated one
   - Word count calculated

### What comes out
| Field | Value |
|-------|-------|
| subject | "Lyte Fiber's drawing throughput before Q3" |
| body | *(83 words — the full composed email)* |
| P.S. | *(microsite link + brief hook)* |
| word count | 83 (under 88 ceiling ✓) |
| pattern used | loss_aversion |

### Gate rule
- **Word count check**: if body exceeds ceiling (88w for T1/T2, 66w for T3):
  - Pipeline auto-triggers a **recompose** — sends the email back to the LLM with a strict instruction to cut to under the ceiling
  - Up to 2 recompose attempts before giving up
- **Composition error** → the email body is set to `[Composition error]` and the pipeline skips judging

---

## What happens after Phase 6

The trace continues through:
- **Phase 6b: Fact Verification** — web-searches claims in the composed email to verify they're defensible
- **Phase 7: Judge Gate** — mechanical checks (word count, salutation, forbidden terms) + 5-dimension LLM scoring
- **Phase 7b: Cross-Model Judge** — optional multi-model consensus (Gemini + GPT-5 + Grok + DeepSeek)
- **Phase 8: Microsite** — generates a personalized landing page for the P.S. link
- **Phase 9: Supabase Write** — stores everything in the database

### Lyte Fiber's Phase 7 result:

| Dimension | Score (1-10) |
|-----------|-------------|
| research_depth | 7 |
| vp_connection [value proposition — how well the email connects Inorsa's product to the prospect's needs] | 8 |
| tone | 8 |
| conciseness | 7 |
| jtbd_alignment [Jobs To Be Done — whether the email addresses what this person actually needs to accomplish] | 9 |
| **Average** | **7.8 → SEND** |

**Judge flagged (must-fix before going live):**
1. BEAD subgrantee assumption — the P.S. brief title implies Lyte Fiber has a BEAD award, which isn't publicly verified. Reframe or confirm before sending.
2. Permit kickback stat (3-6 weeks) has no cited source. Soften or verify.

---

## Glossary

| Term | Meaning |
|------|---------|
| ICP | Ideal Customer Profile — the type of company/person worth selling to |
| A&E firm | Architecture & Engineering firm — designs fiber networks (vs. operates them) |
| BEAD | Broadband Equity, Access, and Deployment — $42.5B federal funding program |
| STORM | 3-persona research methodology (Industry Analyst + AE Proxy + Technical Evaluator) |
| Brain | Local knowledge base that accumulates facts across pipeline runs |
| AgentDB | Database with vector search for finding semantically similar entries |
| HNSW | Hierarchical Navigable Small World — fast similarity search algorithm |
| Substrate | Curated library of messaging patterns, competitive intel, and context |
| LLM | Large Language Model — the AI that does the research, writing, and judging |
| CTA | Call To Action — what the email asks the prospect to do |
| MEDDPICC | B2B sales qualification framework (Metrics, Economic Buyer, Decision Criteria, etc.) |
| Microsite | A personalized one-page landing page for the prospect, linked in the P.S. |
| Dry run | Pipeline executes fully but doesn't write to the production database |

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-06 10:15 | Claude | Initial trace from Focus 100 test run, Aamer Abbasi @ Lyte Fiber |
