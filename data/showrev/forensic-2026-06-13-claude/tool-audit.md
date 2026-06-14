---
title: ShowRev P2 Sprint — Tool & Capability Audit (5 Sources)
status: ACTIVE
last_updated: 2026-06-13 11:15 EDT
version: v1
purpose: Surface NEW capabilities since the CLAUDE.md baseline that bear on the forensic-2026-06-13 audit's FIX (F1-F10) / REBUILD (R1-R5) / RE-ORCH (O1-O6) buckets. Recommendation per item: USE NOW / USE LATER / SKIP.
sources_audited:
  - RuVector (gist 26e44b35) [verified 2026-06-13]
  - Claude Code changelog code.claude.com/docs/en/changelog [verified 2026-06-13]
  - Ruflo releases v3.10.33–v3.10.45 [verified 2026-06-13]
  - Anthropic Claude Skills marketplace [verified 2026-06-13]
  - Ruvent ecosystem mentions in showrev artifacts [grep, 2026-06-13]
constraints:
  - All claims time-stamped, training-cutoff staleness rule honored
  - No code changes proposed; capability identification only
  - Stayed inside /Users/justynszymczyk/Documents/GitHub/ruflo per stay_inside_ruflo_repo memory
---

# Tool & Capability Audit — 2026-06-13

## Baseline reminder

CLAUDE.md Tool Chain Reference (`/Users/justynszymczyk/Documents/CLAUDE.md`) "Claude Code (latest release, late May 2026)" row is the comparison point. New = post that row or absent from it.

---

## Source 1 — RuVector (operator-named priority)

**URL:** https://gist.github.com/ruvnet/26e44b35f216aa2f664918b0784a360f
**Released:** 2026-06-12 (1 day old as of this audit)
**Verified:** 2026-06-13

| # | NEW capability | Tie-in | Recommendation |
|---|---|---|---|
| 1 | **RVM v2 audit logs** — append-only chain, 128-bit BLAKE3 hashes, ~112ns/append, Merkle-batched signatures every 256 records, backward compat with v1 | **F8 (sr_pipeline_runs)** + **F9 (sr_emails)** + **R5 (cohort persistence)** — direct replacement for our hand-rolled audit-trail wiring. We get tamper-evident logs for free instead of building plain INSERTs. | **USE LATER.** F8/F9 are 1-2 hr Supabase inserts; pulling in a new audit substrate triples the work for this sprint. Revisit if BL-016 cohorts grow past 800 and we need cryptographic provenance for compliance / red-team. |
| 2 | **SONA learning loop, now functional** — prior versions shipped empty feedback stubs; single feedback now produces measurable weight updates, negative feedback "unlearns" | **R2 (send-confidence calibration)** + **R3 (Brain distillation)** — the operator-ranks-10 → back-solve workflow is exactly what SONA is built for. Could replace least-squares with SONA weight updates and get continuous learning instead of batch recalibration. | **USE LATER.** R2 already has a working spec using least-squares. SONA is a strategic substitution worth evaluating once R2 v1.0 is calibrated and we have ranking data to feed it. Note for the R2 spec: "consider SONA path for v1.1." |
| 3 | **RaBitQ binary quantization** — 32x compression, 97% recall, 512B → 16B vectors, opt-in via `rabitq: true` | General — `sr_brain_substrate` (6,512 rows) is not yet near scale limits. | **SKIP for sprint.** Memory pressure isn't a binding constraint today. Revisit at 100k+ substrate rows. |
| 4 | **Behavioral drift gate + parity harness in CI** — detects implementation divergence across RuVector backends via `.rvf` fingerprint files | **O5 (weekly reply retro)** — analogous pattern for ShowRev: a behavioral-parity check would catch composer drift between releases (regression we currently lack). | **USE LATER.** Pattern worth borrowing for our own composer regression harness, but not a sprint-week task. |
| 5 | **14x HNSW search + 6x raw scan** — perf gains on 100k vectors | General — Brain reads are not currently slow. | **SKIP.** No active perf complaint. |

**Net for sprint:** RuVector v0.2.x is a substrate-level upgrade. The most directly relevant piece is the SONA functional-feedback fix (relevant to R2), but R2's existing path is faster to ship. **Defer all 5 items to post-pilot.**

---

## Source 2 — Claude Code changelog (May 7 – June 12, 2026)

**URL:** https://code.claude.com/docs/en/changelog
**Verified:** 2026-06-13

Versions reviewed: 2.1.133 (May 7) → 2.1.176 (Jun 12). Baseline CLAUDE.md row references "late May 2026" features only.

| # | NEW capability vs baseline | Tie-in | Recommendation |
|---|---|---|---|
| 6 | **`post-session` lifecycle hook** (2.1.169, Jun 8) — runs after session ends, before workspace deletion; SIGTERM→SIGKILL window configurable. Use case: snapshot uncommitted work, export logs. | **F8 (sr_pipeline_runs)** + **F9 (sr_emails)** — perfect fit for end-of-session telemetry flush. Instead of wiring INSERTs throughout the pipeline, the post-session hook can batch-flush run/email records once. | **USE NOW.** Materially simpler implementation path for F8/F9 than scattering writes through the pipeline. |
| 7 | **Stop / SubagentStop hook `additionalContext` return** (2.1.152, May 27 + 2.1.145, May 19) — feed Claude feedback at turn end without "hook error" flag; continues the turn naturally | **O5 (weekly reply retro)** + **R3 (Brain distillation)** — closes the loop inside the same session: judge fires, hook returns calibration deltas as additionalContext, composer adapts mid-cohort. | **USE NOW** as foundation for closed-loop calibration. Low complexity, immediate observability win. |
| 8 | **Nested subagents to 5 levels** (2.1.172, Jun 10) — sub-agents spawn sub-agents | **R3 (Brain distillation)** — distillation pass naturally decomposes: ingest agent → synthesize agent → quality agent → write agent. Previously had to flatten. | **USE LATER** when R3 is built. Not blocking today. |
| 9 | **`disallowed-tools` in skill frontmatter** (2.1.152, May 27) — remove tools from model while skill active | **F1 (kill-list)** + **F6 (Tim-approval reset)** — composer skills can be constrained to safe tool subset, blocking the model from reaching for the wrong substrate function at compose time. | **USE NOW** as a defense-in-depth on the composer skill (if/when we promote it to a skill). |
| 10 | **`reloadSkills: true` from SessionStart hook** + **`/reload-skills` command** (2.1.152) | General — eliminates restart-after-hook-install friction for skill-driven workflows | **USE NOW** if any skill gets created this sprint. |
| 11 | **`MessageDisplay` hook** (2.1.152) — transform or hide assistant message text as displayed | General — could enforce comms protocol output filtering | **SKIP for sprint** — not on critical path. |
| 12 | **`/code-review --fix`** + **`/simplify`** (2.1.152) — review findings auto-applied to working tree | General — useful for fixing the F-bucket items themselves | **USE NOW** as a sprint accelerator on the FIX bucket. |
| 13 | **OpenTelemetry enhancements** (2.1.145, 2.1.149, 2.1.161, 2.1.172) — agent_id + parent_agent_id on tool spans; per-category usage breakdown; tool_parameters in tool_decision events; lines_of_code metric with model attribute | **F8 + F9 + R5** — full telemetry substrate already exists in Claude Code; we can route OTEL exports to our own DB rather than building a parallel sr_pipeline_runs writer | **USE NOW.** Highest-leverage observability win in this whole audit. |
| 14 | **Dynamic workflows orchestrate tens-to-hundreds of agents in background** (2.1.154, May 28) | **R1 (KB→DB promotion)** + **O4 (substrate refresh cadence)** — parallel ingest of monthly substrate corpus | **USE LATER** when R1 is being built. |
| 15 | **`claude plugin init` scaffolding** + **symlinked skills auto-load** (2.1.157, May 29) | General — lowers cost of packaging the composer / judge / send-confidence as installable plugins | **USE LATER.** |
| 16 | **stdio MCP servers receive `CLAUDE_CODE_SESSION_ID`** (2.1.157) | **F8** — pipeline runs can be correlated with Claude Code session via shared session ID. Free cross-system observability. | **USE NOW** when wiring F8. |

**Net for sprint:** Items 6, 7, 13, 16 are direct multipliers on the F8/F9 observability work. Item 12 accelerates FIX-bucket execution.

---

## Source 3 — Ruflo (claude-flow) v3.10.x

**URL:** https://github.com/ruvnet/ruflo/releases (verified 2026-06-13)
**Note:** Baseline CLAUDE.md still references v3.6.10. Current stable is v3.10.45 (Jun 12). **Baseline is 40+ patch releases stale.**

| # | NEW capability vs baseline | Tie-in | Recommendation |
|---|---|---|---|
| 17 | **Trajectory feedback distillation for LLM-agent workflows** (v3.10.42, Jun 11) | **R3 (Brain distillation)** — direct primitive for what R3 spec'd. | **USE LATER.** Evaluate as alternative to building distillation from scratch when R3 starts. |
| 18 | **Hybrid search with entity-matching arm** + signal provenance tracking (v3.10.39, Jun 8) — dense + sparse + entity retrieval with per-signal provenance | **F3 (URL-domain classifier)** + **R1 (operator truths)** — provenance tracking is exactly what we need for "every fact in every body defensible from a trusted source." | **USE LATER.** Substantive integration work but aligns with verified-data apex. |
| 19 | **Guardrail integration at MCP dispatch** (v3.10.34, Jun 2, ADR-146) — guardrails run at the tool-call boundary, not inside the model | **F1 (kill-list)** + **F6 (Tim-reset)** — kill-list could move from regex in composer-constraints.ts to MCP-level guardrail, harder to bypass. | **USE LATER.** F1 ships in 20 min as-is per audit; revisit after pilot. |
| 20 | **Plugin integrity verification** (v3.10.34, ADR-145) — Ed25519 signature verification on plugin loads | General — relevant if we publish ShowRev composer as a plugin | **SKIP for sprint.** |
| 21 | **Authorization scope propagation** (v3.10.34, ADR-144) | General — multi-tenant concern, not applicable to single-engagement pilot | **SKIP.** |

**Net for sprint:** Items 17 and 18 inform R-bucket build choices but don't change sprint-week work.

---

## Source 4 — Anthropic Skills marketplace + other tools

**Verified:** 2026-06-13

| # | NEW capability vs baseline | Tie-in | Recommendation |
|---|---|---|---|
| 22 | **Claude Skills marketplace** (skillsmp.com, claudemarketplaces.com, claudeskills.info) — 140+ open-source skills; symlinked auto-load from `.claude/skills` (2.1.157) | General — accelerator for packaging ShowRev composer / judge / portal flows | **USE LATER.** Worth evaluating once F-bucket ships. |
| 23 | **Claude Design** (claude.ai/design) — baseline CLAUDE.md already carries this row with May 2026 edit-support update. No newer change found. | General | **SKIP — already in baseline.** |
| 24 | **Claude Fable 5** (released 2.1.170, Jun 9) — new model in the Anthropic family | **R2 (calibration)** + **R3 (distillation)** — Fable 5 is positioned as a Sonnet/Opus-class addition; gives more cross-family judge diversity beyond Gemini/GPT/Grok/DeepSeek | **USE LATER.** Add to cross-model judge panel once Fable 5 API access confirmed for our org. |
| 25 | **Opus 4.8** (released 2.1.154, May 28) — supersedes 4.7 (which we're on). Memory note `reference_opus_4_8_release.md` exists. Key deltas: long-context, tool use, sustained-effort tasks. | General — current session is on 4.7. | **USE NOW** for next session. Operator-side decision. |

---

## Source 5 — Ruvent ecosystem mentions in ShowRev artifacts

**Searched:** `canon/_session_transcripts/`, `data/showrev/`, `docs/showrev/`
**Patterns:** agentic-flow, agentic-payments, agentic-qe, agentic-jujutsu, ruvent, ruvector

| # | Finding | Status |
|---|---|---|
| 26 | `data/showrev/MORNING-STATUS.md` references "RuVector promoted to primary fiber-operator source" (one-line commit ref) | Already captured under Source 1 above. |
| 27 | `data/showrev/P2-PILOT-ALIGNMENT.md` v2.2 (2026-06-09) — RuVector explicitly moved IN SCOPE for the FCC BDC's ~3B records corpus | Aligns with USE NOW status of RuVector for FCC BDC ingest specifically — but that work is post-pilot per current scope. |
| 28 | No mentions of agentic-flow, agentic-payments, agentic-qe, or agentic-jujutsu anywhere in showrev artifacts or `canon/_session_transcripts/` | Prior sessions have **not** flagged these for ShowRev use. No "use now" or "use later" signals to forward. |

**Net:** RuVector is the only Ruvent-ecosystem tool with prior session traction in ShowRev, and it's already covered by Source 1. The other agentic-* packages are not on prior radars.

---

## Top 3 highest-leverage capabilities for the current sprint

1. **OTEL telemetry export (Source 2, item 13) + post-session hook (item 6) + stdio MCP session ID (item 16)** — together these replace half of F8 / F9 / R5 with native Claude Code primitives. Largest direct multiplier on the "Measure outcomes" binding capability. *Justification: F8 + F9 = 3 hrs of bespoke wiring or ~30 min routing OTEL to our DB.*

2. **Stop hook `additionalContext` (Source 2, item 7)** — turns the tiered-judge cascade into a within-session learning loop without standing up R3 / R5 first. *Justification: closes the loop on "Close the loop" capability one sprint earlier than R-bucket schedule implies.*

3. **`/code-review --fix` and `/simplify` (Source 2, item 12)** — auto-applies review findings to the working tree. Direct sprint-week accelerator on the 10-item FIX bucket. *Justification: F1/F2/F5/F6/F7 are mechanical edits — exactly the shape `/simplify` targets.*

---

## What was NOT recommended

- **No RuVector adoption this sprint** despite operator naming it as priority — the audit-log + SONA + RaBitQ pieces are strategic upgrades, not sprint-week wins. The FCC BDC ingest path is already documented as Step 0.5 post-pilot.
- **No new tables, no new pipelines.** Per the forensic audit's own constraint ("Do not propose new tables…"), every capability above maps onto existing F#/R#/O# items, not net-new work.
- **No Fable 5 / Opus 4.8 forced switch.** Operator-side decision; flagged only.

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 11:15 | Claude (Opus 4.7) | Initial 5-source tool audit. All claims verified 2026-06-13 against live URLs / changelogs / repo greps. Per operator instruction, no code changes proposed; capability identification only. |
