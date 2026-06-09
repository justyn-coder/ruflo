---
title: Email-Source Workflow v2 Design (Next-Pass, Operator-Improved)
status: DRAFT
last_updated: 2026-06-09 02:30 EDT
version: v1
purpose: Design doc for the NEXT email-source discovery pass. Folds in operator's 2026-06-09 critique of the v1 (w5mdoejzp) workflow: time budgets instead of "validate then plan", explicit fallback paths, PDF reading enabled, accidentally-public attendee list mining, and per-agent decomposition. Plan only — execution requires operator gate.
---

# Email-Source Workflow v2 — Design Doc

## Background

v1 (`w5mdoejzp`, ran 2026-06-09 ~01:30 EDT) yielded 228 contacts / 100 verified emails. Honest per-agent breakdown:

| Agent | Targeted | Hit | Contacts | Emails |
|---|---|---|---|---|
| A — BEAD portals | 40 states | 35 | 48 | **48** (all email) |
| B — ReConnect/RDOF | 26 sources | 19 | 44 | 3 |
| C — Press releases | 100 companies | 40 | 47 | **47** |
| D — State assoc | 28 assoc | 24 | 75 | 0 (rosters w/o emails) |
| E — Conf PDFs | 18 queries | 6 | 14 | 2 |

**60 of 100 press release targets and 12 of 18 conference PDFs failed.** Workflow `wei06huvu` (prior workflow) also showed Agent A only validated 25 of 6,512 chunks because the prompt said "validate first."

## Operator-flagged improvements (2026-06-09)

Direct operator feedback during build:
1. **Stop "validate then plan" framing** — gives agents an excuse to bail at 20% completion. Use time budgets instead.
2. **Define fallback paths per source** — when WAF blocks / JS-rendered / PDF gated, agents should pivot, not give up.
3. **PDF reading IS available** — firecrawl-scrape handles PDFs natively. Agents don't need to skip PDF sources.
4. **Look for accidentally-public attendee/badge lists** — conferences sometimes leave them on their CDN.
5. **Embed prospect list in each agent's prompt** — don't make agents extract from upstream output (lossy).

## v2 Workflow Design

### Phase 1: Plan (1 agent, 5 min)

Same as v1 — inventory state portals, conferences, top-100, etc. The plan agent's output goes into the EXECUTE agents' prompts verbatim. No changes needed.

### Phase 2: Execute (12 parallel agents — decomposed from 5 to reduce blast radius)

Each agent operates with these rules baked in:

```
TIME BUDGET: 25 minutes hard. Process as many entries as you can.
DO NOT stop for validation. Every entry IS work product.

YOUR PROSPECT LIST (embedded inline, do NOT extract from upstream):
[explicit 100-row CSV pasted here per agent]

YOUR FALLBACK MATRIX:
- 403/blocked → web.archive.org/web/2026*/[url]
- JS-rendered → firecrawl-instruct (not firecrawl-scrape)
- PDF → firecrawl-scrape format='markdown' (PDFs work)
- Members-only → Google site: search for accidentally-public copies
- Page absent → continue to next entry, NEVER halt the agent

YOUR DECOMPOSITION:
- If 100 entries in budget: ~15 sec each; better 80 at 75% depth than 20 at 100%
- If entry >5 min: log "slow, skipped" and move on
- NEVER stop the agent because one entry failed

RETURN AS YOU GO:
- Partial structured output, not all at end
- If budget hits at entry N, output has N entries
- Execute-then-report, NOT plan-then-execute
```

#### Agent decomposition (12 sub-agents instead of 5)

**Agent A-split (BEAD portals) — 3 sub-agents for 15 states each (45 states total)**
- A1: West states (CA, WA, OR, AZ, NV, UT, ID, MT, WY, CO, NM, AK, HI, OK, KS)
- A2: Midwest (TX, NE, MN, IA, WI, IL, IN, OH, MI, MO, ND, SD, AR, KY, TN)
- A3: East (NY, PA, NJ, MA, MD, VA, NC, SC, GA, FL, AL, MS, LA, WV, ME)
- Each sub-agent: scrape portal subgrantee listings + grant award PDFs + signed application PDFs

**Agent B-split (ReConnect + RDOF) — 2 sub-agents**
- B1: USDA ReConnect rounds 4-7 (announced 2024-2026) — pull every awardee press release
- B2: FCC RDOF / CAF II winners — pull bid CSV + cross-match to prospect list + grab named POCs from each company

**Agent C-split (Press releases) — 3 sub-agents for 33 companies each (top-100)**
- C1, C2, C3: each gets 33 companies; firecrawl-map → /press → scrape latest 5 releases per company → extract Media Contact email blocks

**Agent D-split (State + national associations) — 2 sub-agents**
- D1: 15 BEAD-active state telecom/broadband associations not yet covered
- D2: Deeper sweep of FBA, NTCA, WTA, USTelecom, INCOMPAS technical committees (rosters often have committee-member emails)

**Agent E-split (Accidentally-public conference docs) — 2 sub-agents**
- E1: Targeted Google search queries (operator's specific ask) — `site:[conf].org filetype:pdf attendee 2024 OR 2025` × 20 variants
- E2: Sponsor decks + post-event reports + badge PDFs from FC2026, BBC, Mountain Connect, NTCA RTIME, INCOMPAS Show, WTA Spring/Fall
- Both use firecrawl-scrape (handles PDFs)

### Phase 3: Synthesize (1 agent, 5 min)

Same as v1 — count honestly, dedup, write SQL-loader-compatible JSON.

## Cost estimate

| Item | Cost |
|---|---|
| LLM (Claude Code subscription, 14 agents) | $0 incremental |
| Firecrawl scrapes (~3000 pages) | ~$20-30 |
| Total | ~$30 |

## Expected yield vs v1

| Metric | v1 actual | v2 target |
|---|---|---|
| Sources attempted | 212 | ~450 |
| Sources hit | 124 (58%) | ~360 (80%) |
| Contacts | 228 | ~700 |
| **Verified emails** | **100** | **~400-500** |

## When to run

This doc is design-only. Operator should fire after morning review of overnight cohort report. Triggers:
- Cohort report shows current ~115 emails covering only N% of priority cohort
- Operator authorizes ~$30 Firecrawl spend
- Operator confirms scope (which 12 sub-agents to actually spawn — could be 8 or 10 instead)

## Execution command (when authorized)

`Workflow tool` with the script `data/showrev/workflows/email-source-v2.workflow.ts` (TO BUILD when authorized; this design doc precedes the script).

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 02:30 | Claude | Initial design folding operator's 2026-06-09 critique of w5mdoejzp into a 12-sub-agent decomposed workflow with time budgets, fallback matrices, and PDF support. |
