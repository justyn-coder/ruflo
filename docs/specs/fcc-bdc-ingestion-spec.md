---
title: FCC BDC + RuVector Ingestion Spec
status: DRAFT
last_updated: 2026-06-09 02:30 EDT
version: v1
purpose: Spec for ingesting FCC Broadband Data Collection into our evidence base via RuVector. Operator-driven promotion 2026-06-09 after Claude initially deferred. Replaces Apollo as the primary authoritative source for fiber-operator volume signals.
---

# FCC BDC + RuVector Ingestion Spec

## Why this exists

Operator pushback (2026-06-09): the FCC Broadband Data Collection is the authoritative regulatory filing every US ISP submits twice yearly. Claude initially dismissed ingesting it as "post-pilot" — that dismissal was lazy, not analytical. This spec captures the actual proposal.

### What's in BDC

- **Per-location coverage** — every broadband-serviceable address in the US (~115M), which ISPs serve it, what technology, what advertised speeds, service tier (residential/business)
- **Per-provider summary** — total locations served, geographic coverage by census block, technology mix
- **Time series** — submissions every 6 months since June 2022 (now 8 snapshots)
- **Provider directory** — FCC ID, official name, parent organization

### Why it's the best fiber-operator source we have

| Use case | BDC delivers | Replaces |
|---|---|---|
| Authoritative volume signal | Location count per ISP × ~5/mile density = mile estimate | Apollo `short_description` mining |
| ICP fit confidence | Any operator >5,000 locations served → above 250 mi/yr floor | Apollo crowdsourced employee count proxy |
| Competitive intel | All providers in any market + technology mix | Manual research |
| Growth signal | June 2024 vs June 2026 deltas → "added 12k locations / 24mo" | Apollo headcount growth (lower-quality proxy) |
| BEAD opportunity | Census blocks with weak coverage → BEAD-eligible markets; match to prospect adjacency | Industry intel KB manual mapping |

It's **free** (public data, public API + bulk download). No subscription dependency.

### Scale = RuVector territory

- ~400M records per snapshot
- ~3B records accumulated since 2022
- AgentDB pgvector at this scale: slow, memory-bound, expensive
- RuVector designed exactly for this scale: HNSW indexing, millions to billions of vectors, fast cosine

## Build

### Step 1 — BDC bulk download (1 day)

Source: <https://broadbandmap.fcc.gov/data-download>

- Format: CSV per filing, ~10-30 GB compressed
- Download every snapshot since June 2022 (16 files total: 8 snapshots × residential/business splits)
- Local storage: `data/fcc-bdc/raw/{snapshot_date}/{file}.csv`
- Provider directory: separate small CSV with FCC ID → official name mapping

### Step 2 — Parse + normalize (1 day)

Output schema:

```sql
CREATE TABLE fcc_bdc_coverage (
  id text PRIMARY KEY,
  snapshot_date date NOT NULL,
  provider_id text NOT NULL,                   -- FCC ID
  provider_normalized text NOT NULL,           -- normalized name for join to substrate company tags
  location_id text NOT NULL,                   -- FCC location identifier
  state text NOT NULL,
  county_fips text,
  census_block text,
  technology_code int NOT NULL,                -- 50=fiber, 40=cable, etc.
  max_down_mbps int,
  max_up_mbps int,
  service_tier text,                            -- 'residential' | 'business' | 'both'
  metadata jsonb
);

CREATE INDEX idx_bdc_provider ON fcc_bdc_coverage (provider_normalized, technology_code);
CREATE INDEX idx_bdc_state ON fcc_bdc_coverage (state, technology_code);
CREATE INDEX idx_bdc_census ON fcc_bdc_coverage (census_block);
CREATE INDEX idx_bdc_snapshot ON fcc_bdc_coverage (snapshot_date);
```

Aggregate rollup table for fast per-provider queries:

```sql
CREATE MATERIALIZED VIEW fcc_bdc_provider_summary AS
SELECT
  provider_normalized,
  snapshot_date,
  technology_code,
  COUNT(*) as locations_served,
  COUNT(DISTINCT state) as state_count,
  COUNT(DISTINCT census_block) as census_block_count
FROM fcc_bdc_coverage
GROUP BY provider_normalized, snapshot_date, technology_code;

CREATE INDEX idx_bdc_summary_provider ON fcc_bdc_provider_summary (provider_normalized);
```

### Step 3 — RuVector setup + index (1 day)

RuVector embeds the provider coverage descriptors (technology mix + geographic vector + temporal deltas) so we can semantic-search:

- "Find fiber operators in BEAD-active rural counties with fast growth"
- "Find peer operators similar to {Company X} by coverage profile"
- "Find census blocks with weak coverage adjacent to {Company X}'s footprint"

Setup:
- Install RuVector (npm: `@claude-flow/memory`, already used elsewhere in pipeline)
- Storage: SQLite at `data/fcc-bdc/ruvector.db`
- Index dimensions: 384 (matches existing all-MiniLM-L6-v2 embeddings)
- Per-provider records embedded: name + state coverage list + tech mix summary + growth delta

### Step 4 — Substrate-query integration (0.5 day)

Extend `src/showrev/m1-email-find/evidence-tiering/substrate-query.ts`:

```ts
/** Get authoritative coverage data for an ISP from FCC BDC. */
export async function getFccCoverage(companyName: string): Promise<{
  matched: boolean;
  providerId?: string;
  latestSnapshot?: string;
  fiberLocations?: number;
  estimatedMiles?: number;        // locations × 0.2 (suburban) to 0.5 (urban) per density
  stateFootprint?: string[];
  growthLast24mo?: { locationDelta: number; percentage: number };
  evidence: EvidenceRecord[];     // formatted for substrate-query.writeEvidence
}>;
```

Tier rules: FCC BDC data emits as source_kind = `fcc_bdc` which is a NEW source kind added to types.ts. Tier ceiling: **USE_DIRECTLY** (authoritative regulatory filing). No cross-source requirement needed — the FCC IS the source of truth.

Add to `types.ts`:
```ts
export type SourceKind =
  | 'apollo' | 'apollo_cross' | 'brain' | 'substrate' | 'substrate_quoted'
  | 'web_research' | 'web_research_dated' | 'csv_input' | 'manual'
  | 'fcc_bdc';                  // NEW

export function tierBySourceKind(kind: SourceKind): ClaimTier {
  switch (kind) {
    // ...
    case 'fcc_bdc': return 'USE_DIRECTLY';
  }
}
```

### Step 5 — Ingestion pipeline (0.5 day)

Automated twice-yearly: download new snapshot → parse → upsert → re-aggregate materialized view → rebuild RuVector index for changed providers.

Recommended: cron job at `~/.claude/hooks/fcc_bdc_refresh.sh`, runs first of January and July.

## Total build

| Step | Days | Cost |
|---|---|---|
| 1. BDC bulk download | 1 | $0 (free public data) |
| 2. Parse + normalize + DDL | 1 | $0 |
| 3. RuVector setup + index | 1 | $0 (open source, self-hosted) |
| 4. substrate-query integration | 0.5 | $0 |
| 5. Refresh pipeline | 0.5 | $0 |
| **Total** | **4 days** | **$0 ongoing** |

vs. Apollo Professional: $99/mo recurring, less authoritative, no growth trajectory, no BEAD adjacency intel.

## Impact on the substrate-tiering spec

- **Tier rules**: add `fcc_bdc` → USE_DIRECTLY mapping
- **Orchestrator Phase 1 (Pull facts)**: add FCC BDC lookup in parallel with Apollo + Brain
- **Composer specific-mode**: location count → "north of N miles" approximation passes the tier discipline
- **ICP volume verdict**: BDC location count is the authoritative input — flips most `leaning_fit` verdicts to `fit` for any ISP in BDC

## Risks

| Risk | Mitigation |
|---|---|
| Provider name normalization is harder than expected (some ISPs file under parent co, subsidiary names vary) | The provider directory CSV maps FCC ID → official name + DBA. Build a normalization layer with known aliases. |
| BDC data is "last filed" not real-time; growth deltas have 6-month lag | Acceptable; the data is still the most current authoritative source. |
| 30 GB local storage per snapshot × 8 snapshots = 240 GB | Acceptable on dev workstation. If we run on Vercel, use compressed JSONB columns + on-demand fetch. |
| RuVector setup has its own learning curve | Already used elsewhere in pipeline (memory module); skill is in the team. |

## Open decisions

1. Do we run RuVector self-hosted on the dev workstation, or stand up a small Supabase RPC for it?
2. Do we ingest residential + business filings, or fiber-only (technology_code=50)?
3. Do we backfill all 8 snapshots (full growth history) or just latest 2?

## What this spec is NOT

- Not a build plan for ingesting AT&T's filings (millions of locations per snapshot) on day 1. Start with operators we care about (Focus 100 + FC attendees).
- Not a real-time feed. Twice-yearly refresh aligned with FCC publication cycle.
- Not for cable/DSL operators (we're fiber-only ICP).

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 02:30 | Claude | Initial spec following operator pushback on dismissing FCC BDC. 4-day plan, $0 ongoing cost, replaces Apollo as primary fiber-operator volume signal source. |
