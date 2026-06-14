---
title: System Brief — Send Priority spec v2.1 (post-round-2 red-team)
status: DRAFT — pending round-3 judge review
author: Claude
date: 2026-06-09
supersedes: system-brief-priority-spec-v2-2026-06-09.md
---

# Round-2 findings addressed (11 fixes)

| # | Round-2 finding | Judge | v2.1 fix |
|---|---|---|---|
| 1 | DNC source `inorsa-source-of-truth.md §10` is "Show Facts", not DNC list | Eng | Sync DNC list from canonical hook (`~/.claude/hooks/inorsa_compliance_check.py` defines `DNC_COMPANY_NAMES` array, referenced at `engine/clients/inorsa/canonical/wiki-459-mirror.md §10`). Sync mechanism in §DNC. |
| 2 | 5 spec'd columns don't exist on sr_engine_output | Eng | §Migration below — explicit ALTER TABLE with rollback |
| 3 | N+1 cite-validation pattern | Eng | Single batched `SELECT id FROM sr_company_evidence WHERE id = ANY(...)` per prospect |
| 4 | Double-NULL email+ICP lands in OK band | Eng | Explicit cap: BOTH null → band capped at HOLD (priority ≤4) |
| 5 | tier3Hallucination not persisted | PM | NEW column `tier3_hallucination_result` jsonb; result written at compose-time |
| 6 | KILL never fires | PM | KILL triggers: compose failed OR ICP rejected OR raw_score < 3 |
| 7 | Tooltip jargon ("leaning_fit") | PM | Translation table in §Tooltip |
| 8 | HOLD-4 sentence too thin | PM | HOLD tooltip names the missing input + the unblock action |
| 9 | URL liveness (WC1) | Adv | Nightly job sets `url_dead` on `sr_company_evidence`; cite validation counts only `url_dead=false` |
| 10 | Body-vs-claim diff (WC2) | Adv | Numeric-token diff between body sentence and claim text; mismatch → `numeric_mismatch_flag=true` → cap at HOLD |
| 11 | halluc_pts loophole (Adv) | Adv | null=0.5, split=0.25, fail=0; if halluc_pts<1 AND raw_score≥7 → cap at OK |
| BONUS | Wire minimal contradiction detector NOW (WC3) | Adv | Substring check vs operator-curated keyword list → `substrate_contradiction_flag=true` → cap at OK |

# Intent (unchanged)

AE scanning N prospects makes `send / hold / skip` in ≤5 seconds per row. Decision must be: **right** (no client/domain harm), **trustable** (operator can re-derive), **deterministic** (same inputs → same score), **real** (every input is a live populated DB field).

# Inputs (4 — all verified populated or persisted at-write-time)

| # | Input | Source field | Notes | Weight |
|---|---|---|---|---|
| 1 | Email confidence | `sr_engine_output.confidence_color` | green=3, red/null=1 | 35% |
| 2 | ICP fit | `sr_engine_output.icp_volume_verdict` | fit=3, leaning_fit=2, miss/null=1 | 30% |
| 3 | Research depth + CITE VALIDITY | `research_summary` (TEXT-parsed) `body_sentences[].claim_ids` cross-checked against `sr_company_evidence` | Batched IN-clause; reject `url_dead=true` rows; numeric-token mismatch caps at HOLD | 25% |
| 4 | Hallucination check | NEW `sr_engine_output.tier3_hallucination_result` jsonb | `{verdict, unsupportedClaims, errored}` — written at compose-time | 10% |

Safety flags (override behaviour, beside the score):
- `dnc_match` boolean (synced from canonical compliance hook — see §DNC)
- `substrate_contradiction_flag` boolean (set by minimal detector — see §Contradiction Detector)
- `numeric_mismatch_flag` boolean (set by body-vs-claim diff — see §Cite Validation)

# Formula (deterministic, with explicit caps applied IN ORDER)

```ts
// Inputs
email_pts    = (cc === 'green') ? 3 : 1
icp_pts      = verdict === 'fit'         ? 3
             : verdict === 'leaning_fit' ? 2
             : 1
research_pts = composer_mode === 'generalized'      ? 1
             : cited_validated_count >= 2           ? 3
             : cited_validated_count >= 1           ? 2
             : 1                                              // specific but 0 valid cites = penalty
halluc_pts   = halluc.verdict === 'pass'  ? 1
             : halluc.verdict === 'fail'  ? 0                 // also MUST_NOT_SEND override below
             : halluc.verdict === 'split' ? 0.25
             : halluc.errored             ? 0.25
             : 0.5                                            // null

// Score
let raw_score = (email_pts * 1.0) + (icp_pts * 0.85) + (research_pts * 0.7) + (halluc_pts * 1.0)
let priority  = Math.max(1, Math.min(10, Math.round(raw_score)))

// HARD CAPS — priority can only descend, never ascend through these
if (cc IS NULL && verdict IS NULL)                                            priority = Math.min(priority, 4)   // double-NULL cap (Eng R2)
if (numeric_mismatch_flag === true)                                           priority = Math.min(priority, 4)   // WC2 cap (Adv R2)
if (substrate_contradiction_flag === true)                                    priority = Math.min(priority, 6)   // WC3 cap (Adv R2)
if (halluc_pts < 1 && raw_score >= 7)                                         priority = Math.min(priority, 6)   // halluc-not-verified cap (Adv R2)
if (compose_failed === true)                                                  priority = 1                       // KILL: pipeline broke (PM R2)
if (icp_verdict !== 'pass')                                                   priority = 1                       // KILL: ICP rejected (PM R2)
if (raw_score < 3)                                                            priority = Math.min(priority, 2)   // KILL band trigger (PM R2)
if (dnc_match === true)                                                       priority = 0                       // MUST_NOT_SEND
if (halluc.verdict === 'fail' && halluc.unsupportedClaims.length > 0)         priority = 0                       // MUST_NOT_SEND

// Bands
band = priority >= 7 ? 'SEND'
     : priority >= 5 ? 'OK'
     : priority >= 3 ? 'HOLD'
     : priority >= 1 ? 'KILL'
     :                 'MUST_NOT_SEND'   // priority = 0
```

# §DNC list source — canonical hook sync

Per Eng round-2 finding: the file path `canon/wiki-459 §10` doesn't exist in ruflo. Path `data/showrev/inorsa-source-of-truth.md §10` is Show Facts, not DNC.

**The DNC list is authoritatively held in the Claude Code compliance hook** at `~/.claude/hooks/inorsa_compliance_check.py` (variable `DNC_COMPANY_NAMES`). This hook is operator-canonical and references `engine/clients/inorsa/canonical/wiki-459-mirror.md §10` which lives in the operator's other repo (outside ruflo).

**v2.1 mechanism**: at pipeline startup, parse the hook source and extract `DNC_COMPANY_NAMES`. Caches normalized list in memory. Throws at startup if hook file is missing or array parse fails (loud failure, no silent degradation).

```ts
// src/showrev/m1-email-find/evidence-tiering/dnc-list.ts
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

let cachedList: string[] | null = null;

export function loadDncList(): string[] {
  if (cachedList) return cachedList;
  const hookPath = resolve(homedir(), '.claude/hooks/inorsa_compliance_check.py');
  const src = readFileSync(hookPath, 'utf-8');
  // Extract DNC_COMPANY_NAMES = [ ... ]
  const match = src.match(/DNC_COMPANY_NAMES\s*=\s*\[([^\]]+)\]/s);
  if (!match) throw new Error('Could not parse DNC_COMPANY_NAMES from compliance hook — refusing to start pipeline');
  const names = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1].toLowerCase().trim());
  if (names.length === 0) throw new Error('DNC list is empty — refusing to start pipeline');
  cachedList = names;
  return names;
}

export function isDncMatch(companyNormalized: string): boolean {
  const list = loadDncList();
  return list.includes(companyNormalized.toLowerCase().trim());
}
```

**Why this design**: single source of truth (the hook), no drift, loud failure if hook moves or array changes shape, no DNC names committed in this repo's spec.

# §Cite Validation (WC1 + WC2 fixes)

After parsing `research_summary.body_sentences`, for each unique `claim_id`:

```ts
// 1. Batched lookup
SELECT id, claim, source_url, url_dead, source_date
FROM sr_company_evidence
WHERE id = ANY($1)

// 2. For each cite the body references:
//    - row exists?         → if not, drop (not counted toward cited_validated)
//    - url_dead?           → if true, drop (WC1 fix)
//    - numeric-token diff between this sentence's text and row.claim
//      diff = setOf(numbers-in-body-sentence) NOT a subset of setOf(numbers-in-claim)
//      if diff non-empty → set numeric_mismatch_flag=true (WC2 fix, caps priority at HOLD)

cited_validated_count = count of unique claim_ids that survive all 3 checks
```

# §Contradiction Detector (minimal, ships in v2.1)

```ts
// Query prospect's own substrate
SELECT claim FROM sr_company_evidence WHERE company_normalized = $1

// Operator-curated keyword list — when prospect's substrate names something
// that contradicts our default pitch framing
const CONTRADICTION_KEYWORDS = [
  'outgrowing autocad',
  'leveraging gis',
  'transformed legacy data',
  'streamlined drawings',
  'fully automated',
  'gis-native',
  'gis-cad pipeline',
];

function detectSubstrateContradiction(prospectClaims: string[]): boolean {
  return prospectClaims.some(claim =>
    CONTRADICTION_KEYWORDS.some(kw => claim.toLowerCase().includes(kw))
  );
}
```

Catches Finley-class (their own whitepaper champions "outgrowing AutoCAD, leveraging GIS"). Sets `substrate_contradiction_flag` → caps band at OK. Operator can extend keyword list via PR.

# §Tooltip (no jargon, sales sentence)

```ts
const ICP_LABEL = {
  'fit': 'confirmed multi-state operator',
  'leaning_fit': 'borderline ICP fit',
  null: 'ICP not confirmed',
};
const EMAIL_LABEL = {
  'green': 'green email',
  'red': 'unverified email pattern',
  null: 'no email signal',
};

function tooltipFor(p) {
  switch (p.band) {
    case 'MUST_NOT_SEND':
      return p.dnc_match
        ? 'On DNC list — do NOT send.'
        : `Hallucination check failed on: "${p.halluc_unsupported[0]?.slice(0, 60)}..." Do NOT send.`;
    case 'SEND':
      return `${EMAIL_LABEL[p.cc]} at ${ICP_LABEL[p.verdict]}; ${p.cited_validated} dated cites verified.`;
    case 'OK':
      if (p.substrate_contradiction_flag) return `${EMAIL_LABEL[p.cc]} at ${ICP_LABEL[p.verdict]} — prospect's own positioning contradicts our default frame. Re-frame before sending.`;
      if (p.halluc_pts < 1) return `${EMAIL_LABEL[p.cc]} at ${ICP_LABEL[p.verdict]}; hallucination check not verified.`;
      return `${EMAIL_LABEL[p.cc]} at ${ICP_LABEL[p.verdict]}; ${p.weakest_caveat}.`;
    case 'HOLD':
      if (p.numeric_mismatch_flag) return 'Email cites a number that does not match the source. Verify before sending.';
      if (p.cc !== 'green') return 'Email pattern unverified. Verify domain or hand-check before sending.';
      if (p.verdict !== 'fit') return 'ICP not confirmed. Add volume signal before sending.';
      return 'Research is generalized. Add substrate-cited frame before sending.';
    case 'KILL':
      if (p.compose_failed) return 'Pipeline error — see system_brief for technical details.';
      if (p.icp_verdict !== 'pass') return 'Not an ICP. Drop.';
      return 'Email unverified, ICP unconfirmed, no substrate. Drop or hand-research.';
  }
}
```

# §Migration

```sql
ALTER TABLE sr_engine_output
  ADD COLUMN IF NOT EXISTS priority_score INT,
  ADD COLUMN IF NOT EXISTS priority_band TEXT,
  ADD COLUMN IF NOT EXISTS priority_version INT,
  ADD COLUMN IF NOT EXISTS priority_inputs_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS tier3_hallucination_result JSONB,
  ADD COLUMN IF NOT EXISTS numeric_mismatch_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS substrate_contradiction_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS dnc_match BOOLEAN;

ALTER TABLE sr_prospects
  ADD COLUMN IF NOT EXISTS priority_score INT,
  ADD COLUMN IF NOT EXISTS priority_band TEXT,
  ADD COLUMN IF NOT EXISTS priority_version INT,
  ADD COLUMN IF NOT EXISTS priority_inputs_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS substrate_contradiction_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS dnc_match BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_sr_prospects_priority_score
  ON sr_prospects(priority_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_sr_company_evidence_company_normalized
  ON sr_company_evidence(company_normalized);
-- (used by Contradiction Detector lookup)

-- ALSO add url_dead column on sr_company_evidence for WC1 nightly job
ALTER TABLE sr_company_evidence
  ADD COLUMN IF NOT EXISTS url_dead BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS url_last_checked TIMESTAMPTZ;
```

# NULL handling (explicit)

| Input NULL combo | Behavior |
|---|---|
| `confidence_color IS NULL` | Treat as 'red' → email_pts=1 |
| `icp_volume_verdict IS NULL` | icp_pts=1 |
| `research_summary IS NULL` | research_pts=1 |
| `research_summary` parses but no body_sentences | research_pts=1 |
| `research_summary` malformed JSON | research_pts=1 (caught by try/catch) |
| `tier3_hallucination_result IS NULL` | halluc_pts=0.5; if raw_score≥7 → band capped OK |
| `tier3_hallucination_result.errored === true` | halluc_pts=0.25 |
| Both confidence + icp NULL | priority capped at HOLD (≤4) |
| All inputs NULL | clamps to 1 KILL — diagnose as upstream bug |

# Test plan (10 tests — TDD before any code lands)

1. **Happy path SEND**: green / fit / 3-valid-cites / halluc=pass → priority=9, band=SEND
2. **Sad path HOLD**: red / null / null / null → priority=4 (cap), band=HOLD
3. **MUST_NOT_SEND on hallucination**: green / fit / 3-cites / halluc=fail → priority=0, MUST_NOT_SEND
4. **MUST_NOT_SEND on DNC**: any inputs + dnc_match=true → priority=0, MUST_NOT_SEND
5. **WC2 numeric-mismatch cap**: green / fit / 3-cites BUT body says "1700 miles", claim_text says "1500 miles" → priority=4, HOLD
6. **WC3 contradiction cap**: green / fit / 3-cites BUT substrate has "outgrowing AutoCAD" → priority=6, OK
7. **WC1 broken URL**: green / fit / 3-cites BUT 1 cite url_dead=true → cited_validated=2, priority=8, SEND
8. **halluc=split loophole**: green / fit / 3-cites / halluc=split → halluc_pts=0.25 → raw_score≥7 cap → priority=6, OK
9. **Determinism**: same inputs called 3x → identical priority + snapshot
10. **All NULL**: priority=1, KILL

# Predicted distribution (post tier3 persistence)

Assuming halluc pass-rate ~80% (today's sweep):
- SEND: ~35%
- OK: ~30%
- HOLD: ~25%
- KILL: ~7%
- MUST_NOT_SEND: ~3%

# Integration

- New module: `src/showrev/m1-email-find/evidence-tiering/send-priority.ts`
- DNC sync: `src/showrev/m1-email-find/evidence-tiering/dnc-list.ts` (reads from compliance hook)
- Contradiction keywords: const at top of `send-priority.ts` (operator-editable)
- Wire into `run-pipeline-v2.ts:persistToSupabase` AFTER tier3Hallucination wires, BEFORE sr_engine_output upsert
- Portal `app/ops/page.tsx`: sort by `priority_score DESC NULLS LAST`; bands set badge colors; HOLD/KILL/MUST_NOT_SEND disable Approve
- Backfill script: re-compute priority on all existing rows after migration

# Open operator decisions (3 yes/no — needed before build)

1. **DNC sync mechanism** — read directly from `~/.claude/hooks/inorsa_compliance_check.py` (proposed). Alternative: operator exports list to ruflo via a sync command. Lean: read-from-hook is cleanest, fails loudly if hook moves.
2. **WC1 nightly URL HEAD job** — ship in v2.1 OR defer? Lean: ship; URL liveness is real prod concern.
3. **Backfill on existing 357 rows** — yes/no. Lean: yes for portal consistency.

# Non-goals (deferred to v2.2+)

- BDC location count granularity for ICP strength
- Reply-rate feedback loop
- Distinct-source-count for research
- Replace minimal contradiction detector with Phase C orchestrator output (when Phase C ships)
- Stat library autocite (Phase B wires it)
