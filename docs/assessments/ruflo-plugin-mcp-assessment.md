---
title: Ruflo Plugin MCP Readiness Assessment
status: ACTIVE
last_updated: 2026-06-08 00:45 EST
version: v1
---

# Ruflo Plugin MCP Readiness Assessment

## Executive Summary

All three recommended plugins (ruflo-autopilot, ruflo-loop-workers, ruflo-cost-tracker) have **complete MCP tool handlers** already registered in the CLI. The skills reference these tools correctly. No new MCP server code is needed. Installation is skill + config activation only.

## Plugin-by-Plugin Assessment

### 1. ruflo-autopilot

**Purpose:** Persistent loop that tracks task completion across sessions and auto-resumes work.

**MCP Tools (10, all implemented in `v3/@claude-flow/cli/src/mcp-tools/autopilot-tools.ts`):**

| Tool | Handler | State |
|------|---------|-------|
| `autopilot_status` | `loadState()` + `discoverTasks()` | Real logic, reads persisted JSON |
| `autopilot_enable` | Sets `enabled=true`, saves state | Real |
| `autopilot_disable` | Sets `enabled=false`, saves state | Real |
| `autopilot_config` | Validates + applies config (maxIterations, timeoutMinutes, taskSources) | Real |
| `autopilot_reset` | Clears state + log | Real |
| `autopilot_log` | `appendLog()` to persistent journal | Real |
| `autopilot_progress` | Computes % complete from discovered tasks | Real |
| `autopilot_learn` | Stores learning records for pattern improvement | Real |
| `autopilot_history` | Reads full session history | Real |
| `autopilot_predict` | Returns next optimal action based on task state | Real |

**Skill:** `plugins/ruflo-autopilot/skills/autopilot-loop/SKILL.md` — references correct MCP tool names, uses `ScheduleWakeup` for cache-aware 270s pacing.

**State Backend:** Persists to `.claude-flow/autopilot-state.json` via `loadState()`/`saveState()` helpers in `src/autopilot-state.ts`.

**Task Discovery:** Reads from three sources: `team-tasks` (Claude Code TaskList), `swarm-tasks` (MCP task_list), `file-checklist` (markdown checkboxes in tracked files).

**Verdict: READY.** Install the skill, configure task sources, enable via `autopilot_enable`. No code changes needed.

### 2. ruflo-loop-workers

**Purpose:** Background workers that run on `/loop` schedule for maintenance tasks (audit, optimize, testgaps, etc.).

**MCP Tools (5, all implemented in `v3/@claude-flow/cli/src/mcp-tools/hooks-tools.ts`):**

| Tool | Line | Handler | State |
|------|------|---------|-------|
| `hooks_worker-list` | 3768 | Lists all 12 registered workers with priority/interval | Real |
| `hooks_worker-dispatch` | 3817 | Queues worker to daemon or executes inline | Real (writes to `.claude-flow/daemon-queue/`) |
| `hooks_worker-status` | 3956 | Reads worker execution state | Real |
| `hooks_worker-detect` | 4014 | Auto-detects which workers should run based on file changes | Real |
| `hooks_worker-cancel` | 4369 | Cancels queued/running worker | Real |

**Skill:** `plugins/ruflo-loop-workers/skills/loop-worker/SKILL.md` — references `hooks_worker-dispatch` and `hooks_worker-status`, documents 8 available workers with intervals.

**Cron Skill:** `plugins/ruflo-loop-workers/skills/cron-schedule/SKILL.md` — references `CronCreate` + `hooks_worker-dispatch` for scheduled recurring execution.

**Daemon Integration:** Worker dispatch writes to `.claude-flow/daemon-queue/`. The daemon (`npx claude-flow daemon start`) polls every 5s and processes queue entries. Completed items move to `.processed/` subdir.

**Verdict: READY.** Install skills, ensure daemon is running. Dispatch via `/loop-worker audit` or cron via `/cron-schedule`.

### 3. ruflo-cost-tracker

**Purpose:** Track per-session, per-agent, per-model API costs from Claude Code session JSONL files.

**Implementation:**
- `plugins/ruflo-cost-tracker/scripts/track.mjs` — real executable Node.js script
  - Reads Claude Code session `.jsonl` files from `~/.claude/projects/`
  - Parses token usage per model tier (haiku/sonnet/opus)
  - Calculates USD costs using current pricing table
  - Persists to AgentDB `cost-tracking` namespace via `memory store` CLI
- `plugins/ruflo-cost-tracker/scripts/smoke.mjs` — smoke test that validates the tracker runs
- `plugins/ruflo-cost-tracker/bench/` — benchmark harness

**Skill:** `plugins/ruflo-cost-tracker/skills/cost-report/SKILL.md` — references `memory_search`, `memory_list`, `memory_retrieve` on `cost-tracking` namespace. Documents 7-step report generation process with tier breakdown.

**Pricing Model (hardcoded in track.mjs):**
| Model | Input/M | Output/M | Cache Write/M | Cache Read/M |
|-------|---------|----------|---------------|--------------|
| Haiku | $0.25 | $1.25 | $0.30 | $0.03 |
| Sonnet | $3.00 | $15.00 | $3.75 | $0.30 |
| Opus | $15.00 | $75.00 | $18.75 | $1.50 |

**Verdict: READY.** Run `node plugins/ruflo-cost-tracker/scripts/track.mjs` after sessions. Skill generates reports from persisted data.

## Installation Steps

All three are skill-only installs — no MCP server additions, no npm packages, no code changes.

### Step 1: Copy skills to Claude Code skills directory

```bash
# Autopilot
cp -r plugins/ruflo-autopilot/skills/autopilot-loop ~/.claude/skills/

# Loop workers
cp -r plugins/ruflo-loop-workers/skills/loop-worker ~/.claude/skills/
cp -r plugins/ruflo-loop-workers/skills/cron-schedule ~/.claude/skills/

# Cost tracker
cp -r plugins/ruflo-cost-tracker/skills/cost-report ~/.claude/skills/
```

### Step 2: Verify MCP tools are registered

The `claude-flow` MCP server already exposes all required tools. Verify:
```bash
# Should show autopilot_* and hooks_worker-* in tool list
npx claude-flow@v3alpha mcp tools | grep -E "autopilot_|hooks_worker"
```

### Step 3: Start daemon (for loop-workers)

```bash
npx claude-flow@v3alpha daemon start
```

### Step 4: Smoke test each plugin

```bash
# Autopilot
# In Claude Code: /autopilot-loop → should call autopilot_status and report state

# Loop workers
# In Claude Code: /loop-worker audit → should dispatch audit worker

# Cost tracker
node plugins/ruflo-cost-tracker/scripts/track.mjs
# In Claude Code: /cost-report → should generate report from cost-tracking namespace
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Autopilot loops too aggressively | Low | Med | `maxIterations` default is 50, configurable. `timeoutMinutes` default is 120. |
| Worker dispatch fails silently | Low | Low | `hooks_worker-status` provides execution state. Daemon logs to stderr. |
| Cost tracker reads wrong session | Low | Low | Can pin session via `TRACK_SESSION` env var. Default reads most recent. |
| Skills not found after install | Med | Low | Run `/reload-skills` after copying skill directories. |
| Daemon not running for workers | Med | Med | Workers fall back to inline execution if daemon not detected. |

## ShowRev Pipeline Integration

These plugins are general-purpose Ruflo tools, not ShowRev-specific. Their value for ShowRev:

| Plugin | ShowRev Use Case |
|--------|-----------------|
| **ruflo-autopilot** | Run overnight batch processing (e.g., process 45 P1 prospects autonomously, resuming if interrupted) |
| **ruflo-loop-workers** | Schedule periodic audit workers for pipeline code, testgap detection, memory consolidation |
| **ruflo-cost-tracker** | Track per-run API costs to measure cost-per-prospect and forecast batch budgets |

## Recommendation

Install all three. Total effort: ~15 minutes (copy skills, verify MCP tools, start daemon, smoke test). No code changes needed. All MCP handlers are production-ready with real persistence and error handling.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:45 | Claude | Initial assessment. All 3 plugins verified ready. 15 MCP tool handlers confirmed implemented. |
