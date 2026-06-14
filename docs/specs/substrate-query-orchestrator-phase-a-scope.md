---
title: Substrate Query Orchestrator — Phase A Scope
status: DRAFT
last_updated: 2026-06-09 EST
version: v4
---

# Phase A — Substrate Query Orchestrator

## 1. INTENT

60% of zero-citation emails were fabricated because each composer invents its own ad-hoc fan-out across `sr_company_evidence`, the industry KB, and substrate search. Phase A replaces all of that with `getRichDossier(prospect)`: one function that pulls only verified claims, weights them by deterministic authority + recency rules, classifies them against the industry KB, tags each by persona, and returns a scored object. Composers become renderers, not generators. Citations and source rows are guaranteed by construction. Empty dossiers hard-stop to operator queue.

## 2. INPUTS

**DB** — `sr_company_evidence` (`slttpknnuthbttjuzrnz`, 756 rows / 179 companies). Used columns: `company_normalized`, `claim`, `source_kind`, `source_citation`, `source_date` (null 522/756 = 69%), `speaker_name`, `speaker_role`, `category` (3 values: `company_fact` 452, `industry_context` 211, `persona_signal` 93), `metadata`. Schema confirmed live 2026-06-09.

**Files** — `/data/showrev/industry-intelligence-kb.md` v1 ACTIVE; `/data/showrev/inorsa-source-of-truth.md` v9 ACTIVE.

**NEW checked-in files (Phase A creates)**:
- `/data/showrev/source-authority-map.yaml` — `[{ publisher: string, tier: 'A'|'B'|'C'|'D' }]`. Seeded ~30 hand-labeled rows; **unknown publisher → FAIL LOUD unless `--allow-unknown` flag** (Hardening 1).
- `/data/showrev/category-to-persona-map.yaml` — `[{ category?: string, speaker_role_substring?: string, personas: PersonaTag[] }]`. Deterministic, no LLM.
- `/tests/fixtures/kb-labels.json` — 20 hand-labeled (claim, expected_status) pairs for SC #3.
- `/tests/fixtures/publisher-labels.json` — 30 hand-labeled (publisher, expected_tier) pairs for SC #4.

**HTTP** — `search-substrate` edge function, 1.5s timeout, graceful degrade to `[]`.

## 3. INTERFACE

```ts
async function getRichDossier(
  prospect: { company_normalized: string; persona?: PersonaTag }
): Promise<RichDossier>;
type PersonaTag = 'revenue_leader' | 'ops_builder' | 'technical_designer';
```

## 4. ALGORITHM (deterministic)

1. `SELECT * FROM sr_company_evidence WHERE company_normalized = $1 ORDER BY id ASC, extracted_at ASC` — single query.
2. Skip rows where `source_citation IS NULL OR ''`; increment `skipped_counts.no_citation`.
3. Derive `publisher` from `source_citation` host. Lookup → `authority_original`. **Unknown → throw `UnknownPublisherError` unless `--allow-unknown` flag set; then tier C + flag** (Hardening 1).
4. **Null-date rule** (`source_date IS NULL`): `recency_boost=0.6`, demote one tier (A→B…D→D), set `date_confidence='unknown'`, `date_penalty_applied=true`.
5. Else `recency_boost`: 1.0 if ≤30d, linear decay to 0.5 at 365d, floor 0.5; `date_confidence='verified'`.
6. `persona_tags` = union of map matches on `category` + `speaker_role` substring. Empty if no match.
7. `kb_status` = Haiku one-call-per-claim returning `{ status, confidence: 0-1, evidence_quote }`. **If `confidence<0.7 OR evidence_quote=''` → force `unaddressed`** (PM fix 3). Cache key: `sha256(claim + sha256(kb_file_contents))`, TTL 7 days (Hardening 4).
8. `inorsa_relevance` = SOT-v9 angle keyword substring (boolean per angle).
9. `score = authorityWeight × recency_boost × kbWeight`. Weights: A=1.0 B=0.75 C=0.5 D=0.25; confirmed=1.0 unaddressed=0.7 contradicted=0.2.
10. **Drop filter** (SC #6): omit row where `persona_tags=[]` AND `kb_status='unaddressed'`.
11. Bucket by persona; call `search-substrate` once; assemble `RichDossier`.

## 5. OUTPUT

```ts
type ScoredClaim = {
  claim: string; source_citation: string; source_kind: string;
  source_date: string | null;
  authority: 'A'|'B'|'C'|'D'; authority_original: 'A'|'B'|'C'|'D';
  date_confidence: 'verified'|'unknown'; date_penalty_applied: boolean;
  recency_boost: number; persona_tags: PersonaTag[];
  kb_status: 'confirmed'|'contradicted'|'unaddressed';
  kb_confidence: number; kb_evidence_quote: string;
  inorsa_relevance: string[]; score: number;
};
type RichDossier = {
  prospect: { company_normalized: string; persona?: PersonaTag };
  claims_by_persona: Record<PersonaTag, ScoredClaim[]>;
  kb_corroborations: ScoredClaim[]; kb_contradictions: ScoredClaim[];
  inorsa_angles: string[];
  skipped_counts: { no_citation: number };
  empty_reason?: 'no_rows'|'all_dropped'|'all_low_authority'|'timeout'|'db_error';
};
```

## 6. EDGE CASES

| Condition | Behavior |
|---|---|
| Zero rows | `empty_reason='no_rows'`. No throw. |
| All rows dropped by SC #6 | `empty_reason='all_dropped'`. |
| All survivors authority=D | `empty_reason='all_low_authority'`. |
| `source_date` NULL | §4 step 4 (boost=0.6, tier demote, flags set). |
| `source_citation` NULL/empty | Skip + `skipped_counts.no_citation++`. |
| Substrate >1.5s or 5xx | Log warn, substrate=[], dossier still returned. |
| Haiku fail or low-confidence | `kb_status='unaddressed'`, `kb_confidence=0`. |
| Unknown publisher, no flag | Throw `UnknownPublisherError`. |
| DB error | Throw `SubstrateQueryError` (caller wraps). |

## 7. INTEGRATION POINTS

- `run-pipeline-v2.ts:321` — replace `orchestrateEvidence(...)`; attach existing `dossier` field at line 336.
- `specific-composer.ts`, `generalized-composer.ts:139`, `microsite-composer.ts` — read `dossier.claims_by_persona[persona]` and `dossier.substrate` only. No direct DB/KB reads.

## 7.5 COMPOSER CONTRACT (enforced via type guard)

Composers MUST early-return `{ skip: true, reason: dossier.empty_reason }` when `empty_reason` is set — route to operator queue, never auto-send (PM fix 4, Hardening 3). Composers MUST refuse temporal language ("recently", "this year", "just announced") when any cited claim's `date_confidence !== 'verified'` (Hardening 2). Enforced by `assertDossierFresh(claims)` helper, not convention.

## 8. TEST PLAN

1. Happy path — A-tier dated row → score=1.0, citation present.
2. Null-date — `recency_boost=0.6`, tier demoted, `date_penalty_applied=true`.
3. Unknown publisher with `--allow-unknown` → tier C; without flag → throws.
4. SC #6 drop — persona_tags=[] + unaddressed → omitted.
5. Zero rows → `empty_reason='no_rows'`.
6. Substrate timeout — substrate=[], dossier returned.
7. KB classifier: ≥18/20 on `/tests/fixtures/kb-labels.json` (10 confirmed, 10 contradicted).
8. Publisher map: ≥27/30 on `/tests/fixtures/publisher-labels.json`; unknown-rate <15% on full 756-row corpus.
9. **Temporal-language guard** — composer rejects "recently" when any claim `date_confidence='unknown'`.
10. **Empty-dossier hard-stop** — composer with `empty_reason` set returns `{skip:true}`, does NOT emit email.
11. Haiku low-confidence → forced unaddressed; `kb_confidence` logged.
12. 50-prospect benchmark: p95 <3s cold, <2s warm.

## 9. DETERMINISM

`ORDER BY id ASC, extracted_at ASC`; YAML maps checked-in; Haiku cached `sha256(claim + sha256(kb_file_contents))` with 7-day TTL; constants only. Same inputs → same output.

## 10. PERFORMANCE & OPS

Per call: 1 indexed DB SELECT, 1 substrate HTTP (1.5s cap), N Haiku (4-7 cold / 0 warm). Cold p95 <3s, warm <2s. Weekly RemoteTrigger lints `source-authority-map.yaml` against `SELECT DISTINCT publisher FROM sr_company_evidence` → Slack alert on diff (Hardening 1).

## 11. SUCCESS CRITERIA

1. Zero composer reads `sr_company_evidence` directly (grep verified).
2. Every `ScoredClaim` has non-empty `source_citation`.
3. `kb_status` ≥18/20 on hand-labeled fixture.
4. `authority` ≥27/30 on hand-labeled fixture; unknown-publisher rate <15% on 756-row corpus.
5. Latency p95 <3s cold, <2s warm.
6. Zero `ScoredClaim` where `persona_tags=[]` AND `kb_status='unaddressed'`.
7. Zero emails emitted when `dossier.empty_reason` is set (composer hard-stop).
8. Zero temporal-language emissions citing `date_confidence !== 'verified'` claims.

## 12. NON-GOALS

No composer rewrite (separate ticket — `assertDossierFresh` + early-return helper land here, full rewrite later), no schema changes, no new edge function, no persona inference, no `verification_report` integration, no score write-back.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v4 | 2026-06-09 | Claude | Eng fixes (ORDER BY secondary key, KB-contents hash, skipped_counts). PM fixes (authority_original + date_penalty_applied flags, Haiku confidence+quote+force-unaddressed, composer hard-stop contract §7.5). Adversarial hardening (unknown-publisher fail-loud + weekly lint, date_confidence + temporal-language guard, empty-dossier hard-stop, Haiku cache TTL). Added tests 9-11 + fixtures + SC #4/#7/#8 |
| v3 | 2026-06-09 | Claude | Full implementation spec — algorithm pseudocode, output examples, edge case table, file:line integration points, 8-test plan, determinism + perf sections |
| v2 | 2026-06-09 | Claude | Null-date rule, authority-map file, persona map, cold-cache SC, empty-output SC |
| v1 | 2026-06-09 | Claude | Initial lean scope, schema-verified |
