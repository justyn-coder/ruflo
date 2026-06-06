---
title: Code Review — ShowRev Modules (June 2-3 Build)
status: ACTIVE
last_updated: 2026-06-04 02:30 EST
version: v1
---

# Code Review — ShowRev Modules (June 2-3 Build)

**Reviewer:** Claude (Opus 4.6)
**Scope:** All files built or modified June 2-3 in m1-email-find/ + microsite/
**Focus:** Nick McManus corrections, DB alignment, wiring integrity, runtime safety

---

## CRITICAL: Stale Inorsa Claims (Nick McManus Violations)

### 1. personas.ts:158 — STALE VP DESCRIPTION (CRITICAL)

**Lines 157-160** contain the research persona prompt's "Client value proposition" section:

```
Inorsa generates engineering outputs from validated infrastructure data,
flags conflicts before they become rework or permit returns, and keeps
deployment moving instead of buried in manual review.
Key capabilities: ingest GIS/LLD inputs, validate, generate construction +
permit drawings with full traceability. Deterministic, no AI guesswork.
Key outcome for prospects: fewer permit kickbacks (each = 3-6 weeks saved).
Proof point: one customer cut review cycles from 3-4 weeks to 2 days.
```

**Violations:**
- "validated infrastructure data" — Inorsa does NOT validate inputs. Nick: "Errors in the network management tool translate directly as errors in the output."
- "flags conflicts before they become rework or permit returns" — Inorsa does NOT flag conflicts. Nick confirmed conflict avoidance is NOT supported.
- "validate" in "ingest GIS/LLD inputs, validate, generate" — same issue.
- "fewer permit kickbacks" — Nick: "Never claim Inorsa reduces permit returns." The speed gives teams MORE TIME for their own QC.
- "one customer cut review cycles from 3-4 weeks to 2 days" — This proof point is unconfirmed. Nick's approved metrics are: ~10 min source-to-preliminary, 2-5x scaling, 70% cycle time reduction.

**Fix:** Replace lines 157-161 with the VP summary that matches premium-pipeline.ts lines 35-95 (the corrected version). Research personas must receive the SAME corrected VP as the composer.

### 2. lean-composer.ts:63 — "built-in QC" CLAIM

```
What Inorsa does: converts GIS design data into CAD-ready construction
drawings with built-in QC. Fiber only.
```

"built-in QC" implies Inorsa validates quality. Nick's correction: Inorsa only catches missing key inputs (mistake proofing for absent fields), NOT general QC. This phrasing will generate emails claiming Inorsa does QC, which is the exact error Nick flagged.

**Fix:** Change to: "converts GIS design data into CAD-ready construction drawings. Fiber only. The speed gives your team more time for QC before submission."

### 3. influence.ts:197-200 — "built-in QC" + "pass review the first time"

The composer prompt's "What Inorsa does" section:
```
Core capability: automated GIS-to-CAD conversion with built-in QC.
...
- "permit packages that pass review the first time, because QC happens upstream."
```

"built-in QC" and "pass review the first time" both violate Nick's corrections. Inorsa does not guarantee permit packages pass review.

**Fix:** Replace with Nick-approved framing: "Core capability: automated GIS-to-CAD conversion. The speed gives teams more time for their own QC. ~10 min source data to preliminary drawing, 70% cycle time reduction."

### 4. microsite-composer.ts:59-63 — CASE STUDIES WITH STALE CLAIMS

Five default case studies contain claims Nick would reject:

- **cs-001:** "cut review cycles from 3 weeks to 2 days" — unverified proof point
- **cs-002:** "reduced first-pass permit rejection rates from 40% to under 5% by automating QC checks" — Inorsa does NOT automate QC checks, does NOT reduce rejection rates. Direct Nick violation.
- **cs-003:** "permit-ready drawings" — already flagged in mechanical checks as forbidden phrase, yet still in case study text
- **cs-004:** "cut first-pass approval time by 60%" — implies Inorsa improves approval rates. Unverified.
- **cs-005:** "eliminated the 2-week QC bottleneck" — implies Inorsa does QC.

All 5 case studies have `approved_by: null`. None should ship until approved.

**Fix:** Rewrite case studies using only Nick-approved metrics. Flag `approved_by: null` as a blocking gate — these should not render on microsites until an operator approves.

---

## Wiring Integrity Issues

### 5. premium-pipeline.ts:580-588 — TYPE MISMATCH (lean path)

The `EmailOutput` interface (line 233-241) declares `pattern: PatternSelection` (an object). The lean composer path assigns:

```typescript
pattern: pattern.pattern,       // string (InfluencePattern), not PatternSelection
antiTellChecks: [],             // not in EmailOutput interface
```

Two problems:
- `pattern.pattern` is a string, not `PatternSelection`. This breaks type safety.
- `antiTellChecks` does not exist on `EmailOutput`. TypeScript won't catch this with object literal excess property checks if `as any` is used elsewhere.

**Fix:** Assign the full `PatternSelection` object: `pattern: pattern` (not `pattern.pattern`). Remove `antiTellChecks` or add it to the interface.

### 6. hubspot-loader.ts:720-723 — MISSING `break` IN SWITCH (CRITICAL RUNTIME BUG)

```typescript
case 'verify': {
  const { blocked } = await runVerify();
  process.exit(blocked ? 1 : 0);
}
// NO break; — falls through to 'dry-run'/'load' case
case 'dry-run':
case 'load': {
```

The `verify` case has no `break` statement. Although `process.exit()` prevents actual fall-through at runtime, this is a code smell — if `process.exit` is ever removed or the error path changes, `verify` would silently execute the `load` path. Add `break;` for defensive coding.

### 7. actions.ts:25-36 — NO PAGINATION (will miss contacts > 100)

```typescript
body: JSON.stringify({
  ...
  limit: 100,
}),
```

The HubSpot search API returns max 100 results per page. If ShowRev grows past 100 contacts, this server action will silently drop contacts. Compare to watcher.ts (lines 52-68) which correctly paginates with `after` cursor.

**Fix:** Add pagination loop or confirm contact count will never exceed 100 for this pilot.

---

## Database Alignment

### 8. watcher.ts — Column references verified CLEAN

All table references verified against expected schemas:
- `sr_outcomes`: `prospect_id, event_type, event_source, contact_email, event_data, hs_event_id` — correct
- `sr_brain_outcomes`: `prospect_id, t1_opened, t1_replied, t1_reply_sentiment, microsite_viewed, microsite_booking_clicked, meeting_booked, meeting_booked_at, angle_that_landed, objection_encountered, ae_notes, updated_at` — correct
- `sr_brain_outreach_patterns`: `pattern_type, pattern_name, pattern_description, sample_size, success_rate, confidence, works_best_for, does_not_work_for, source_client, source_show, updated_at` — correct
- `sr_brain_substrate`: `source, title, url, published_date, chunk_index, content, char_count` — matches load-substrate.py
- `sr_prospects`: `id, email, first_name, last_name, company, assigned_ae, send_status` — correct

### 9. engagement.ts — sr_engine_output column `intel_signal_strength` verified

The engagement stats query selects `intel_signal_strength` from `sr_engine_output`. This matches the engine output schema. The sort order `['Strong', 'Good', 'Possible', 'Weak', 'Unknown']` matches the `SIGNAL_MAP` in hubspot-loader.ts.

### 10. premium-pipeline.ts:371 — sr_engine_output query uses `research_summary` column

Line 371 queries `research_summary` from `sr_engine_output`. Verified this column exists in the engine output schema.

---

## Error Handling Issues

### 11. premium-pipeline.ts:382-383 — SILENT `catch {}` ON SIMILAR-PROSPECT FETCH

```typescript
} catch {}
```

If the similar-prospect Supabase query fails (auth issue, network), the error is silently swallowed. This means the pipeline continues without logging why context was unavailable.

**Fix:** Add `catch (err: any) { console.log('  │  Similar prospects: skip (' + err.message?.slice(0, 40) + ')'); }` — same pattern used for substrate context at line 351-353.

### 12. premium-pipeline.ts:506-507 — SILENT `catch {}` ON THOMPSON SAMPLING

Same issue. If the outreach patterns query fails, Thompson Sampling silently degrades. This is a less critical issue (fallback is pattern selection without priors) but should log for debugging.

### 13. judge.ts:219-224 — SHELL INJECTION VULNERABILITY

```typescript
const escapedPrompt = prompt.replace(/'/g, "'\\''");
const result = execSync(
  `claude -p --model ${model} --max-budget-usd 0.05 --output-format json '${escapedPrompt}'`,
```

The prompt is passed via shell string with single-quote escaping. If the prompt contains `$()` or backticks, those would be shell-interpreted. The judge prompt includes user-controlled data (prospect names, research findings).

**Risk:** Low (research findings are LLM-generated, not direct user input), but still a code smell.

**Fix:** Use the temp-file pattern already used elsewhere (lean-composer.ts:82-91, premium-pipeline.ts:143-155). Write prompt to a temp file, pipe via `cat`.

### 14. load-substrate.py:26-31 — NO ERROR HANDLING ON HTTP POST

```python
def post(url, key, rows):
    req = urllib.request.Request(...)
    return urllib.request.urlopen(req).status
```

If the Supabase POST fails (network error, 400, 500), `urlopen` raises an exception that propagates up. The caller catches it at line 72-74 but only for the first 5 errors, then silently continues. Large batches could fail silently.

**Fix:** Add explicit status check: `if status >= 400: raise Exception(f'HTTP {status}')`.

---

## Code Quality

### 15. premium-pipeline.ts — FILE LENGTH (1070 lines)

This file is 1070 lines, double the 500-line guideline in CLAUDE.md. The `processProspect` function alone is 647 lines (280-926). Each pipeline phase could be extracted.

**Suggestion:** Extract phases into separate functions or files:
- `phase-research.ts` (persona research + brain ingest + gap detection)
- `phase-influence.ts` (Thompson Sampling + pattern selection)
- `phase-compose.ts` (lean/full router + composition)
- `phase-verify.ts` (mechanical + fact verification + Tim Proxy + judge + Gemini)
- `phase-write.ts` (output + Supabase)

Not a blocker, but would improve maintainability.

### 16. watcher.ts + actions.ts — DUPLICATED HubSpot POLLING LOGIC

Both `watcher.ts` (poll function) and `actions.ts` (refreshEngagement) implement HubSpot contact search + event extraction + outcome upsert. The logic is nearly identical but with subtle differences:
- `watcher.ts` paginates (correct). `actions.ts` does not (issue #7).
- `watcher.ts` uses raw `fetch`. `actions.ts` uses `supabaseServer` client.
- `actions.ts` adds reply classification inline. `watcher.ts` has it as separate `classify` command.

**Risk:** Bugs fixed in one copy may not be fixed in the other. Already happened with the pagination difference.

**Fix:** Extract shared `extractEvents()` + `classifySentiment()` into a shared module. Both watcher and actions import from it.

### 17. premium-pipeline.ts:1048 — MISSING `await` ON TOP-LEVEL CALL

```typescript
case 'run':
case 'dry-run':
  runPremiumPipeline(config);
  break;
```

`runPremiumPipeline` is async but the call at the CLI entry point does not `await` it and has no `.catch()`. If the pipeline throws, the error is an unhandled promise rejection. Node.js will exit with a non-zero code on newer versions but the error message may be unhelpful.

**Fix:** `runPremiumPipeline(config).catch(err => { console.error('Pipeline failed:', err.message); process.exit(1); });`

### 18. hubspot-loader.ts:420-442 — `fetchSendData` uses ANON KEY, not SERVICE_ROLE_KEY

```typescript
const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
```

The `fetchSendData` function reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` but not `SUPABASE_SERVICE_ROLE_KEY`. If RLS policies restrict `sr_engine_output` or `sr_microsites` reads to service role, this will silently return empty arrays (Supabase returns 200 with `[]` for unauthorized reads).

Other functions in the same file (like `sbHeaders()` in watcher.ts) prefer `SUPABASE_SERVICE_ROLE_KEY`.

**Fix:** `const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';`

---

## Positive Findings

1. **premium-pipeline.ts:35-95** — The corrected `INORSA_VP_SUMMARY` is thorough and accurately reflects Nick's corrections. This is the gold standard; other files need to match it.

2. **Checkpoint/resume** — The checkpoint system (lines 206-231) is well-implemented. Runs can resume after failures without re-processing completed prospects.

3. **Thompson Sampling** — The Beta posterior sampling for pattern selection (lines 473-506) is a principled approach to exploration/exploitation. The variance-based noise injection is correct.

4. **Mechanical checks** — The 22 AI-tell patterns + Tim kill-list in judge.ts are comprehensive and catch real issues.

5. **Engagement OOO handling** — Both watcher.ts and engagement.ts correctly classify OOO replies separately from real replies, preventing inflation of reply rates.

6. **Pre-load verification** — The 10-check verification gate in hubspot-loader.ts is exactly the kind of defensive automation that prevents the manual QA failures seen in earlier loads.

7. **Sentiment preservation** — watcher.ts learn command (line 293) correctly preserves manually-set sentiments when auto-updating brain outcomes.

---

## Summary

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Nick McManus violations | 4 (issues 1-4) | | | |
| Runtime bugs | 1 (issue 6) | 2 (issues 7, 17) | | |
| Type safety | | 1 (issue 5) | | |
| Security | | | 1 (issue 13) | |
| Error handling | | | 3 (issues 11, 12, 14) | |
| Code quality | | | 3 (issues 15, 16, 18) | |

**Blocking:** Issues 1-4 (Nick McManus violations) must be fixed before any new prospect run. The research personas and lean composer are generating emails with claims Nick explicitly rejected.

**High priority:** Issue 6 (missing break), issue 7 (no pagination in actions.ts), issue 17 (missing await).

**Medium:** Issues 5, 11, 12, 13, 14, 15, 16, 18.

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-04 02:30 | Claude | Initial review of June 2-3 build |
