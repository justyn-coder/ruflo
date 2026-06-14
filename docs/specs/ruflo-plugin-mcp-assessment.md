---
title: Ruflo Plugin MCP Handler Assessment
status: ACTIVE
last_updated: 2026-06-08 00:55 EST
version: v1
---

# Ruflo Plugin MCP Handler Assessment

## Summary

Of 3 evaluated plugins, only **autopilot** has implemented MCP tool handlers. The other two (loop-workers, cost-tracker) are skill-layer wrappers that reference MCP tools without backend handler implementations.

## Plugin-by-Plugin Assessment

### ruflo-autopilot — READY

**MCP Handlers:** 10 tools in `v3/@claude-flow/cli/src/mcp-tools/autopilot-tools.ts`

| Tool | Handler | Status |
|------|---------|--------|
| `autopilot_status` | `loadState()` + `discoverTasks()` | Implemented |
| `autopilot_enable` | Sets `state.enabled = true`, logs | Implemented |
| `autopilot_disable` | Sets `state.enabled = false`, logs | Implemented |
| `autopilot_config` | Max iterations, timeout, task sources | Implemented |
| `autopilot_iterate` | Runs one iteration cycle | Implemented |
| `autopilot_log` | Reads append-only log | Implemented |
| `autopilot_predict` | Predicts next actions | Implemented |
| `autopilot_progress` | Completion % | Implemented |
| `autopilot_learning` | Learning metrics | Implemented |
| `autopilot_reset` | Resets state | Implemented |

**State backend:** `autopilot-state.ts` — file-based JSON state + append-only log.
**Skill layer:** 2 skills (autopilot-predict, autopilot-loop) + 1 agent (autopilot-coordinator) + 2 commands.
**Verdict:** Fully functional. MCP handlers backed by real state management.

### ruflo-loop-workers — NOT READY

**MCP Handlers:** 0 tools.

No tool definitions found in the MCP tools directory matching loop-worker or schedule patterns.

**What exists:**
- 2 skills: `loop-worker/SKILL.md`, `cron-schedule/SKILL.md`
- 1 agent: `loop-worker-coordinator.md`
- 2 commands: `ruflo-loop.md`, `ruflo-schedule.md`
- 1 ADR: `0001-loop-workers-contract.md`

All are `.md` skill files that instruct Claude to use MCP tools (like `autopilot_*` tools) or Claude Code native features (`/loop`, `/schedule`). No executable code.

**What's needed to make it real:**
1. Define MCP tool handlers for: `loop_worker_spawn`, `loop_worker_status`, `loop_worker_stop`, `loop_worker_list`
2. Implement a background worker pool with interval-based execution
3. Integrate with the existing daemon process (`daemon start/stop`)
4. ~16-24 hours of implementation work

**Alternative:** Claude Code already has `/loop` (dynamic mode) and `/schedule` (remote triggers / routines). The skill-layer wrappers effectively delegate to these. If the goal is just to enable autonomous loop behavior, the native Claude Code features may be sufficient without custom MCP handlers.

### ruflo-cost-tracker — PARTIALLY READY

**MCP Handlers:** 0 tools.

No tool definitions found in the MCP tools directory matching cost-track, cost-summary, or cost-budget patterns.

**What exists:**
- 10 executable `.mjs` scripts in `scripts/`:
  - `track.mjs` — Parse session JSONL, calculate per-model token costs
  - `summary.mjs` — Aggregate cost summary across sessions
  - `budget.mjs` — Budget tracking with alerts
  - `trend.mjs` — Cost trend analysis over time
  - `conversation.mjs` — Per-conversation cost breakdown
  - `outcome.mjs` — Cost-to-outcome correlation
  - `compact.mjs` — Compact old session data
  - `export.mjs` — Export cost data to CSV/JSON
  - `federation.mjs` — Multi-project cost aggregation
  - `bench.mjs` — Benchmark cost estimations
- 1 agent: `cost-analyst.md`
- 1 command: `ruflo-cost.md`
- 1 ADR + 1 benchmark doc

The scripts are real executable code that reads Claude Code session JSONLs (`~/.claude/projects/*/sessions/*.jsonl`) and calculates costs using per-model pricing tables.

**What's needed for MCP integration:**
1. Wrap the existing `.mjs` scripts as MCP tool handlers
2. Define tools: `cost_track_session`, `cost_summary`, `cost_budget_check`, `cost_trend`, `cost_export`
3. Register in the MCP server's tool registry
4. ~8-12 hours (scripts exist, just need MCP wrapping)

**The scripts already work standalone** — they can be invoked via `node plugins/ruflo-cost-tracker/scripts/summary.mjs` from CLI. MCP wrapping would make them accessible to agents and the autopilot loop.

## Effort Summary

| Plugin | Current State | Effort to MCP-Ready |
|--------|--------------|---------------------|
| ruflo-autopilot | 10 MCP handlers, fully ready | 0 hours |
| ruflo-loop-workers | Skill wrappers only | 16-24 hours (or skip — native `/loop` + `/schedule` may suffice) |
| ruflo-cost-tracker | 10 real CLI scripts, no MCP handlers | 8-12 hours (wrapping existing scripts) |

## Recommendation

1. **Install ruflo-autopilot now** — it works and adds persistent completion tracking.
2. **Skip ruflo-loop-workers** — Claude Code's native `/loop` and `/schedule` cover the same use case. Revisit only if a gap surfaces.
3. **Defer ruflo-cost-tracker MCP wrapping** — the scripts work standalone today. When the Operator Portal cost page (P2 per portal spec) is built, wrap them as MCP tools so the portal can query costs via the API.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:55 | Claude | Initial assessment of 3 ruflo plugins for MCP handler readiness. |
