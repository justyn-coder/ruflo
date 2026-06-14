---
title: System Brief — Send Priority spec v2 (post-red-team)
status: DRAFT — pending round-2 judge review
author: Claude
date: 2026-06-09
supersedes: system-brief-priority-spec-v1-2026-06-09.md
---

# What changed from v1 (round-1 judge findings, all addressed)

| Judge | Finding | v2 fix |
|---|---|---|
| Engineering | `research_summary` is TEXT not JSONB | v2 reads via explicit `JSON.parse(text)` once at row-load, never assumes JSONB path access |
| Engineering | `verification_report` is 0/357 populated | v2 drops it. Uses `tier3Hallucination` from `tiered-judge.ts` (already wired) |
| Engineering | `canon/wiki-459 §10` doesn't exist in ruflo | v2 reads DNC list from `data/showrev/inorsa-source-of-truth.md` §10 (verified path exists) |
| Engineering | NULL handling unspecified | v2 explicit table — every NULL maps to a documented default |
| Engineering | Rounding rule unpinned | v2 explicit: round half-up to int (`Math.round` is half-to-positive-infinity, deterministic in JS) |
| Engineering | No audit trail | v2 adds `priority_version`, `priority_inputs_snapshot` (jsonb of all 4 inputs at score-time) |
| Engineering + PM | `priority_weakest` is noise | v2 cuts it. The 3-input tooltip already conveys the weakest signal implicitly |
| PM | Score compresses to 3-7 in practice (52% HOLD) | v2 re-bands against real data: SEND ≥7, OK 5-6, HOLD 3-4, KILL 1-2 |
| PM | Email confidence binary in reality (no yellow/amber) | v2 collapses email_pts to 2 levels: green=3, red=1 (was 4 levels) |
| PM | Tooltip robotic | v2 templates a sales sentence: "Green email at multi-state operator; cites 3 dated sources" |
| Adversarial | Polished + fabricated stat → SEND tier | v2 adds CITE VALIDATION (every claim_id must resolve to a real sr_company_evidence row) |
| Adversarial | Hallucination flag only fires on 'fail' (null/pass silent) | v2: null = "not checked, treat as caution"; pass = "verified clean"; fail = MUST_NOT_SEND |
| Adversarial | No contradiction flag for ALLO/Finley class | v2 reserves `substrate_contradiction_flag` column. Wired by Phase C contradiction-check when it lands. Defaults to NULL today |

---

# Intent (unchanged from v1)

AE scanning N prospects makes `send / hold / skip` in ≤5 seconds per row. The decision must be: **right** (no client/domain harm), **trustable** (operator can re-derive), **deterministic** (same inputs → same score), **real** (every input is a live populated DB field).

# Inputs (4 — all verified populated)

| # | Input | Source field | Verified? | Weight |
|---|---|---|---|---|
| 1 | Email confidence | `sr_engine_output.confidence_color` | green/red dominant in live data; map to 3/1 pts | 35% |
| 2 | ICP fit | `sr_engine_output.icp_volume_verdict` | fit/leaning_fit/(null) — map to 3/2/1 pts | 30% |
| 3 | Research depth + CITE VALIDITY | `sr_engine_output.research_summary` (TEXT-parsed) `body_sentences[].claim_ids` cross-checked against `sr_company_evidence` | parse via JSON.parse once; validate each claim_id resolves | 25% |
| 4 | Hallucination check | `tier3Hallucination.verdict` from tiered-judge | wired today (always-on) | 10% (or MUST_NOT_SEND override) |

Source-of-truth for DNC: `data/showrev/inorsa-source-of-truth.md` §10 (Show Facts canonical per wiki-459-mirror). DNC names cached at process startup.

# Formula (single, deterministic)

```
email_pts        = (cc === 'green') ? 3 : 1                    // 2 levels (was 4)
icp_pts          = verdict === 'fit'         ? 3
                 : verdict === 'leaning_fit' ? 2
                 : 1                                            // null → 1
research_pts     = composer_mode === 'generalized' ? 1
                 : cited_AND_validated >= 2     ? 3
                 : cited_AND_validated >= 1     ? 2
                 : 1                                            // 'specific' + 0 valid cites = 1 (penalty)
halluc_pts       = halluc_verdict === 'pass'      ? 1
                 : halluc_verdict === 'fail'      ? 0           // also triggers MUST_NOT_SEND
                 : 0.5                                          // null/split = caution

raw_score = (email_pts * 1.0) + (icp_pts * 0.85) + (research_pts * 0.7) + (halluc_pts * 1.0)
            // weights chosen so a clean prospect lands at ~8.4 (SEND), a thin one at ~5 (OK)

priority = Math.max(1, Math.min(10, Math.round(raw_score)))   // round half-up, clamp 1-10
```

**Worked examples** (validates band distribution against real data):

| Email | ICP | Research | Halluc | raw_score | Band |
|---|---|---|---|---|---|
| green | fit | 3 cited+valid | pass | 3 + 2.55 + 2.1 + 1.0 = 8.65 → **9** | SEND |
| green | leaning_fit | 2 cited+valid | pass | 3 + 1.7 + 2.1 + 1.0 = 7.8 → **8** | SEND |
| green | leaning_fit | 1 cited | pass | 3 + 1.7 + 1.4 + 1.0 = 7.1 → **7** | SEND |
| green | leaning_fit | 0 cited (specific) | null | 3 + 1.7 + 0.7 + 0.5 = 5.9 → **6** | OK |
| red | leaning_fit | 0 cited (specific) | null | 1 + 1.7 + 0.7 + 0.5 = 3.9 → **4** | HOLD |
| red | leaning_fit | generalized | null | 1 + 1.7 + 0.7 + 0.5 = 3.9 → **4** | HOLD |
| green | fit | 3 cited (but halluc fail) | fail | MUST_NOT_SEND override → **0** | MUST_NOT_SEND |

Predicted distribution on current 357-row data: SEND ~25%, OK ~35%, HOLD ~30%, KILL ~5%, MUST_NOT_SEND ~5%. (PM's 52% HOLD worry addressed.)

# Output columns (new on sr_prospects + sr_engine_output)

| Column | Type | Notes |
|---|---|---|
| `priority_score` | int 1-10 | 0 reserved for MUST_NOT_SEND |
| `priority_band` | text | `SEND`, `OK`, `HOLD`, `KILL`, `MUST_NOT_SEND` |
| `priority_version` | int | Schema version, incremented when formula changes (v2 = `2`) |
| `priority_inputs_snapshot` | jsonb | `{email_pts, icp_pts, research_pts, halluc_pts, cited_resolved, cited_total, raw_score}` — for audit |
| `substrate_contradiction_flag` | bool | Defaults NULL. Wired by Phase C when it lands. |

# Display (portal)

| Band | Visual | Approve button |
|---|---|---|
| SEND (7-10) | green badge | enabled |
| OK (5-6) | yellow badge | enabled |
| HOLD (3-4) | orange badge | disabled (operator must explicit-override) |
| KILL (1-2) | red badge | disabled |
| MUST_NOT_SEND (0) | gray badge with 🚫 | disabled, requires `--override-must-not-send` from CLI |

Sales-sentence tooltip (no LLM):

```
function tooltip(inputs):
  if MUST_NOT_SEND: "Hallucination check failed on claim: <claim_text>. DO NOT SEND."
  elif SEND:        "<email_level> at <icp_level>; cites <N> dated sources."
  elif OK:          "<email_level> at <icp_level>; <weakest_dim_reason>."
  elif HOLD:        "<weakest_dim_reason>. Hold."
  elif KILL:        "Email <email_level>, ICP <icp_level>, research <research_level>. Don't send."
```

Examples:
- SEND 9: "Green email at confirmed multi-state operator; cites 3 dated sources."
- SEND 8: "Green email at confirmed operator; cites 2 dated sources from Light Reading + Telecompetitor."
- OK 6: "Green email at leaning-fit operator; substrate present but only 1 dated source."
- HOLD 4: "Email pattern unverified. Hold."
- KILL 2: "Email risky, ICP uncertain, research generalized. Don't send."

# Safety flags (BESIDE the score, never folded in)

| Flag | Source | Behavior |
|---|---|---|
| `hallucination_check_failed` | `tier3Hallucination.verdict === 'fail'` AND ≥1 unsupported claim | MUST_NOT_SEND override + names the offending claim |
| `dnc_match` | Static lookup vs DNC list cached from `inorsa-source-of-truth.md` §10 at startup | MUST_NOT_SEND override |
| `substrate_contradiction_flag` | (Phase C placeholder — null until Phase C ships) | Reserved column, no behavior in v2.0 |

# NULL handling (explicit)

| Input NULL | v2 behavior |
|---|---|
| `confidence_color` IS NULL | Treat as 'red' → email_pts=1 |
| `icp_volume_verdict` IS NULL | icp_pts = 1 |
| `research_summary` IS NULL | research_pts = 1 (treat as generalized) |
| `research_summary` parsed but no body_sentences | research_pts = 1 |
| `tier3Hallucination` IS NULL | halluc_pts = 0.5 (caution, not fail) |
| any combined → score < 1 | clamp to 1 (KILL band) |

# Determinism (auditable)

- `priority_inputs_snapshot` saves the exact 4 inputs that produced the score
- `priority_version` records the formula version (v2 = `2`)
- Re-computing 6 months later: load snapshot + v2-formula → re-derives the same score

# Test plan (TDD-style — 8 tests before any code lands)

1. **Happy path**: green/fit/3-cited+valid/pass → expect 9, band=SEND
2. **Sad path**: red/null/null/null → expect 4 (clamped), band=HOLD
3. **MUST_NOT_SEND on hallucination**: green/fit/3-cited/fail → expect 0, band=MUST_NOT_SEND
4. **MUST_NOT_SEND on DNC**: any inputs + DNC match → expect 0, band=MUST_NOT_SEND
5. **Determinism**: same inputs called 3x → same score 3x
6. **Cite validation**: claim_id pointing to non-existent evidence row → research_pts reduced (not crashed)
7. **Empty research_summary**: parses gracefully to research_pts=1
8. **Tooltip generation**: each band produces a non-empty sentence ≤25 words

# Integration points

- New module: `src/showrev/m1-email-find/evidence-tiering/send-priority.ts` (replaces v1 draft)
- Called from `run-pipeline-v2.ts:persistToSupabase` AFTER all compose + judge wiring, BEFORE the sr_engine_output upsert
- New DB columns (migration): `priority_score`, `priority_band`, `priority_version`, `priority_inputs_snapshot`, `substrate_contradiction_flag` on `sr_engine_output` + `sr_prospects`
- Portal `app/ops/page.tsx` reads + sorts by `priority_score DESC`; bands set badge colors; HOLD/KILL/MUST_NOT_SEND disable Approve

# Non-goals (deferred to v2.1+)

- BDC location count granularity for ICP strength (needs extraction from JSON column first)
- Reply-rate feedback loop (no send data yet)
- Distinct-source-count for research depth (Phase 3A library needs evidence_id fix first)
- Live `substrate_contradiction_flag` (Phase C wires it)
- Stat library autocite (Phase B wires it)

# Open operator decisions (3 yes/no)

1. **Band thresholds**: SEND ≥ 7 (current) vs SEND ≥ 8 (stricter). Stricter = fewer prospects make SEND but each one is more defensible. Y/N to stricter?
2. **HOLD Approve disabled** (current) vs always-enabled. Disabled prevents accidental send; enabled gives AE more control. Y/N to disabled-by-default?
3. **`substrate_contradiction_flag` column NOW** (placeholder, no behavior) vs add later when Phase C ships. Now = no schema churn later; later = leaner v2. Y/N to add now?
