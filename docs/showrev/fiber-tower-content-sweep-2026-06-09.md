---
title: Fiber vs Tower Content Sweep — Inorsa ShowRev
status: ACTIVE
last_updated: 2026-06-09 EST
version: v1
---

# Fiber vs Tower Content Sweep — Inorsa ShowRev

## TL;DR

**4 confirmed tower-content surfaces filtered, 1 fiber-safe by design, 2 kept-as-is with contextual flags. NO unfiltered tower content reaching emails. Safe to fire P2 cohort.**

- Pipeline runtime filters (icp-gate.ts, judge.ts, composer-constraints.ts, test-quality-checker.ts) actively block tower terms (`tower`, `cellular`, `Harmoni`, `TNX`, `mount analysis`, `structural analysis`) at compose AND judge time.
- Brain context (`fiber-connect-2026/`) has 3 tower mentions in 986 entities — orders of magnitude below pollution threshold.
- Skill files (KB + highlevelae) carry tower content but front-load FIBER vs TOWER demarcation banners; consumed by AE-recap workflows, not by fiber-cold composer.
- Chris microsite has ONE tower reference — intentional fiber-vs-tower labor framing ("fiber pulling from tower workforce"). Context-appropriate.

## Per-surface findings

### Scan #1 — Pipeline code (`src/showrev/m1-email-find/`)
**Status: FILTER WORKING.** Five guard layers:
- `icp-gate.ts:35-76` — `TOWER_AE_INDICATORS` regex rejects A&E firms doing tower-only work; fiber-override clause for dual-vertical firms.
- `judge.ts:184-190` — judge fails any draft containing `tower`, `cellular`, `Harmoni`, `mount analysis`, `TNX`, `structural analysis` in subject or body.
- `composer-constraints.ts:64-68` — same regex set marks tower phrases OUT-OF-SCOPE at compose time.
- `test-quality-checker.ts:36-38` — Harmoni / cell tower / cellular flagged in test outputs.
- `premium-pipeline.ts:43` — system prompt declares "Fiber only (no tower/cellular)" to composer.

### Scan #2 — Brain context (`data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026/`)
**Status: FIBER-SAFE.** `entity-graph.jsonl` (986 entities, 359KB): 2 "tower" mentions, 1 "cellular", 0 TNX/Harmoni/RISA. Both tower mentions sit inside fiber-relevant fact strings (workforce framing), not as standalone tower entities. `brain-context-digest.md`: zero hits for tower/cellular/TNX/Harmoni/mount analysis/structural analysis.

### Scan #3 — Inorsa SOT + canonical skills (`data/showrev/`)
**Status: CONDITIONAL — documentary flag, not runtime gate.**
- `inorsa-source-of-truth.md` lines 125-169: RISA/TNX/Harmoni explicitly tagged "LOW — tower-side, not fiber" + closing rule "Do NOT cross-reference tower capabilities in fiber outreach." Good signal but consumed by humans/orchestrators, not by composer.
- `inorsa-knowledge-base/SKILL.md` (76 tower hits): top-of-file FIBER vs TOWER DEMARCATION banner (lines 6-44) instructs consumer to filter TOWER content out for ShowRev fiber outreach. Tower content stays for AE recap / account-plan workflows.
- `highlevelae/SKILL.md` (18 tower hits): same demarcation pattern (lines 6-35).

### Scan #4 — Microsite (`src/showrev/microsite/app/brief/chris/route.ts`)
**Status: KEEP-AS-IS.** Single tower reference at lines 827-828 is an intentional fiber-vs-tower labor-market frame: "Fiber pay continues to rise while tower hiring has fallen to a 20-year low… fiber is cannibalizing the tower workforce." This positions fiber correctly relative to tower. Removing it weakens the substrate point.

### Adversarial verify
- Searched all `.ts`/`.tsx`/`.md` under `src/showrev` for `Harmoni`/`RISA`/`TNX`/`mount analysis`/`structural analysis`. Only matches: judge.ts, test-quality-checker.ts, icp-gate.ts, composer-constraints.ts — all FILTER files. No leakage into compose templates, briefs, or scoring rubrics.
- Brain digest 970 lines: zero TNX/Harmoni/mount-analysis hits.

## Action list

| Surface | File:line | Action | Rationale |
|---|---|---|---|
| icp-gate.ts | :35-76 | KEEP-AS-IS | Runtime gate working |
| judge.ts | :184-190 | KEEP-AS-IS | Compose-time filter working |
| composer-constraints.ts | :64-68 | KEEP-AS-IS | Out-of-scope labels working |
| test-quality-checker.ts | :36-38 | KEEP-AS-IS | QA layer working |
| premium-pipeline.ts | :43 | KEEP-AS-IS | System prompt explicit |
| entity-graph.jsonl | full | KEEP-AS-IS | 3 hits in 986 entities, context-appropriate |
| brain-context-digest.md | full | KEEP-AS-IS | Zero hits |
| inorsa-source-of-truth.md | :125-169 | FLAG-AS-TOWER (done) | Demarcation present; documentary only |
| inorsa-knowledge-base/SKILL.md | :6-44 | CONDITIONAL (done) | Demarcation banner present; not loaded by composer |
| highlevelae/SKILL.md | :6-35 | CONDITIONAL (done) | Demarcation banner present; not loaded by composer |
| microsite chris brief | :827-828 | KEEP-AS-IS | Intentional fiber-vs-tower labor frame |

## Risk if not addressed

**Low residual risk.** Tower terms would only leak into a fiber email if (a) all 5 pipeline filter layers were bypassed AND (b) Brain substrate suddenly grew tower entities AND (c) composer ignored its system prompt. Three independent failures required. The skill files are the weakest link — if a future workflow loads them as composer context (instead of AE recap), tower content would surface; the demarcation banner mitigates but does not enforce. Recommend adding a Brain loader assertion that rejects skill files for fiber-cold compose paths.

## Recommendation

**Do NOT block P2 cohort fire.** Current filter layers are sufficient. Effort to harden skill-file loading: ~30 min (add allowlist check in Brain loader). Defer to post-fire hardening sprint unless cohort discovers a leakage case.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Initial sweep synthesis |
