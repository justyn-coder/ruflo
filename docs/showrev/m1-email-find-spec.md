---
title: M1 Email Find — Post-Show Follow-Up Module Spec
status: DRAFT
last_updated: 2026-05-28 11:15 EST
version: v1
---

# M1 Email Find — Post-Show 3-Touch Follow-Up

## One-line summary

Takes 97 Fiber Connect 2026 booth-visit contacts, researches each company+person, verifies emails, generates a 3-touch follow-up sequence connecting their p/g/JTBD to Inorsa's value proposition, delivers to HubSpot for AE review and send.

## Context

- **Client**: Inorsa (B2B SaaS for fiber optic network design/planning)
- **Show**: Fiber Connect 2026 (ended May 19, 2026)
- **Contacts**: 97 rows / ~87 unique after dedup
- **Signal**: Booth visitors = confirmed interest. ~20 have AE conversation notes.
- **Urgency**: 9 days post-show. Warm window closing. T1 should ship this week.

## Pipeline (5 stages)

### Stage 1: Import & Clean
- Parse CSV, deduplicate (by email), fix known typos
- Flag contacts by priority: Hot (1) > Warm (5) > No-grade-with-notes (~14) > No-grade-no-notes (~61) > Cold/not-ICP (6)
- Validate email format, flag suspicious domains
- Output: Cleaned prospect records in AgentDB namespace `m1_prospects`

### Stage 2: Research (parallel, per prospect)
- Spawn researcher agents (batch of 5-8 concurrent)
- Per prospect: hypothesis-driven research (Heuer ACH model)
  - H1: Form hypothesis about company's 1-3 year goal-set from industry context
  - Search to confirm/disconfirm (company website, LinkedIn, press, filings, BEAD tracker, state PUC)
  - H2: Refine → what specific pain does the contact's role face?
  - 3-5 iteration budget per prospect
- Linear sources: website, LinkedIn, press releases, job postings
- Lateral sources: BEAD applications, state PUC filings, FCC records, trade association membership, podcast appearances
- Output: Dossier per prospect in AgentDB namespace `m1_dossiers`

### Stage 3: JTBD Inference
- Map dossier → persona bucket (drawings_quality / permit_cycle / network_expansion / etc.)
- Identify specific p/g/JTBD with cited evidence
- Connect to Inorsa VP element (which specific Inorsa capability addresses this need)
- Gate: If no defensible JTBD connection → flag for manual review, don't force
- Output: JTBD record per prospect

### Stage 4: Compose (3-touch sequence)
- **T1** (send ASAP): "Great connecting at Fiber Connect" + booth-note reference (if available) + substrate-anchored p/g/JTBD opener + Inorsa VP connection. Under 80 words.
- **T2** (T1 + 5 days): Different angle on same JTBD, deeper VP connection. Meeting ask.
- **T3** (T2 + 5 days): Direct, concise, final touch. Meeting ask with easy out.
- All touches: No flattery openers. One specific question per email. Subject lines reference topic, not meeting request.
- Output: 3 email bodies per prospect

### Stage 5: Judge & Ship
- 4-dimension rubric per body (each must score ≥7/10):
  1. Research depth (is the JTBD claim grounded in evidence?)
  2. VP connection (does the email link the need to a specific Inorsa capability?)
  3. Tone (would Mike/Nathan/Lucas send this themselves?)
  4. Conciseness (under 80 words, no filler, no flattery)
- Cross-model fan-out optional for T1 batch (Gemini + GPT-5 for spot-check)
- Pass → HubSpot `ready_to_send` state
- Hold → flagged for operator review with judge notes
- Output: Approved bodies in HubSpot, hold list for operator

## Priority tiers (process order)

| Tier | Count | Criteria | Why first |
|------|-------|----------|-----------|
| A | 1 | Hot (Len DeWees) | AE said "reach out ASAP" |
| B | 5 | Warm-graded | AE confirmed interest |
| C | ~14 | Ungraded + AE notes | Have booth-conversation signal |
| D | ~61 | Ungraded, no notes | Booth visit only |
| E | 6 | Cold / not-ICP | Skip or deprioritize |

## What this module uses from ruflo

| ruflo Primitive | M1 Usage |
|----------------|----------|
| Swarm orchestration | Parallel researcher agents (hierarchical, 5-8 agents) |
| AgentDB + HNSW | Store/search dossiers, prospects, learnings |
| Hooks (pre-task/post-task) | Quality gates, learning capture |
| ReasoningBank | Judge trajectories for email quality |
| Session management | Audit trail per research run |
| Guidance system | Policy enforcement ("no send without 2+ sources") |

## What M1 builds (ShowRev-specific)

| Component | File | Est. size |
|-----------|------|-----------|
| Prospect importer | `src/showrev/m1-email-find/importer.ts` | ~200 lines |
| Research orchestrator | `src/showrev/m1-email-find/researcher.ts` | ~300 lines |
| JTBD inference | `src/showrev/m1-email-find/prompts/jtbd-inference.md` | Prompt |
| Email composer | `src/showrev/m1-email-find/prompts/compose-touch.md` | Prompt |
| Quality judge | `src/showrev/m1-email-find/judge.ts` | ~150 lines |
| HubSpot pusher | `src/showrev/m1-email-find/hubspot-push.ts` | ~100 lines |
| Pipeline runner | `src/showrev/m1-email-find/pipeline.ts` | ~200 lines |

## Success criteria (from OKRs)

- M1-2: ≥80% of test corpus passes 4-dimension rubric
- M1-3: First batch lands in HubSpot `ready_to_send`
- M1-4: Response rate ≥X% on first 50 sends (X set by operator)

## What this does NOT include

- TradeShow Brain / compounding knowledge base (v3)
- Self-learning loop (manual retro → next run)
- At-show signal capture tooling
- Pricing engine
- Multi-client support

## Data quality issues found in CSV

- 3 email typos: `nbcllc.cok`, `avatarTechllc.om`, `natehome.con`
- 10 duplicate rows (by email)
- 1 contact with `.gov` email (William Lee — Cold-flagged by AE)
- 1 contact with `.edu` email (Ted Rodriquez — education, not ICP)
- Mixed company names for same entity (e.g., "Ohio Gig, LLC" appears under two contacts)

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-28 11:15 | Claude | Initial spec from operator vision + philosophy + OKRs + Heilmeier + booth-scan CSV |
