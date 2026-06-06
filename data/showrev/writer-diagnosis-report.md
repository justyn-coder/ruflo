---
title: ShowRev Email Writer/Composer Degradation Diagnosis
status: ACTIVE
last_updated: 2026-06-02 09:00 EST
version: v1
---

# ShowRev Email Writer/Composer — Degradation Diagnosis & Improvement Plan

## Executive Summary

The email writer produces structurally sound, word-count-compliant emails (avg 63.6 words, 0% over 88) but suffers from **template smell at scale**. 96% of T1 emails fail mechanical checks due to a post-processing/judge conflict, 96% of 3-touch sequences repeat the same influence pattern, and 60% of T1 emails contain the VP verbatim sentence word-for-word. The system has five root causes, none of which are model quality — they are all prompt architecture and pipeline logic bugs.

---

## 1. Root Cause Analysis

### RC-1: Salutation Join vs. Mechanical Check Conflict (96% failure rate)

**The bug.** `premium-pipeline.ts` line 381 deliberately joins salutation with body text:
```
cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
```
This transforms `"Chris,\nyou said..."` into `"Chris, you said..."`.

But `judge.ts` line 44 checks that the first line equals exactly `"${prospectFirstName},"`:
```
if (firstLine !== `${prospectFirstName},`) {
    failures.push(`Salutation "${firstLine}" should be "${prospectFirstName},"`);
```

These two rules directly contradict. The post-processor merges the salutation; the judge expects it separated. Result: **66 of 69 prospects fail mechanical checks**, and the failure is meaningless — it does not indicate actual quality problems.

**Evidence:** The 3 prospects that pass are cases where the model happened to put the salutation on a separate paragraph, which the regex did not match.

**Impact:** The mechanical check is rendered useless. Real failures (word count, AI tells, wrong products) are buried under false salutation failures. Nobody trusts the gate.

### RC-2: Prompt Instructs Tim-Killed Phrases (100% compliance with bad instruction)

**The bug.** `influence.ts` line 217 explicitly instructs the model to use Tim-killed phrases:
```
'Final touch. 3-4 sentences MAX. Binary close: "worth a look, or not the right time?"'
```

Tim's edit patterns (documented in `judges.ts` lines 33-38) explicitly kill both:
- `"worth a look, or not the right time"` — killed
- `"worth a look"` — killed
- `"or not the right time"` — killed

**Result:** 57/69 T3 emails (83%) contain "not the right time/timing". 28/69 T3 emails contain "worth a look". The model is faithfully following the prompt instruction.

**Compounding:** The Tim Proxy judge (`judges.ts`) knows these are killed phrases, but this judge runs AFTER composition and its verdict does not trigger recomposition. The model gets contradictory instructions: the composition prompt says use the phrase; the judge says never use it.

### RC-3: VP Verbatim Used as Template Boilerplate (60% of T1 emails)

**The bug.** `influence.ts` line 194 instructs:
```
## What Inorsa does (use verbatim when describing the value prop)
We convert GIS design data into CAD-ready construction drawings. Quality control is built in, so builds keep moving.
```

"Use verbatim" is the instruction. The model obeys. 60% of T1 emails contain the exact sentence "We convert GIS design data into CAD-ready construction drawings." N-gram analysis confirms 63% share the 4-gram "gis design data into".

This violates Tim's approved pattern: "one mention of Inorsa per email, described by outcome" (judges.ts line 115). The verbatim sentence describes the product, not the outcome. It reads identically across all prospects. Any recipient who gets forwarded another prospect's email will see the same sentence.

**Compounding:** The sentence occupies 14 words of the 80-word budget (18%). In a 65-word email, it is 22% of the body. This squeezes out personalization and makes all emails structurally identical: opener insight + VP verbatim + question.

### RC-4: Pattern Repetition Within Sequences (96% repeat same pattern)

**The bug.** 43/69 prospects (62%) use the exact same influence pattern for T1 and T2. 25/69 (36%) use the same pattern for ALL THREE touches. Overall: 66/69 sequences have at least one repeated pattern.

The prompt at `influence.ts` line 165 says: "T1 and T2 should use DIFFERENT patterns." But the pattern selector runs independently per touch with no enforcement mechanism. The model sees the instruction but has no memory of what it selected for T1 when generating T2.

**Pattern distribution is heavily skewed:** loss_aversion accounts for 97/207 pattern selections (47%). T3 is 61% loss_aversion. The result is that most 3-touch sequences read as: "you'll lose if you don't act" x3.

### RC-5: `COMPOSITION_HARD_CONSTRAINTS` Declared But Never Used

**The bug.** `premium-pipeline.ts` line 79 defines a `COMPOSITION_HARD_CONSTRAINTS` constant with 6 strict rules. This constant is **never referenced** anywhere in the codebase — not passed to the composition prompt, not passed to `callLLM`, nothing. It is dead code.

The actual constraints live inline in `buildComposerPrompt` (`influence.ts` lines 242-250) and are a different, overlapping-but-divergent set. The LLM client has a `hardConstraints` parameter (line 28) designed to send constraints as a separate system block, but this path is never used for composition because composition routes through `executePromptCLI` (the `claude -p` path), not the SDK.

Result: two constraint sets that have diverged, with neither being authoritative.

---

## 2. Current State Assessment

| # | Dimension | Score | Evidence |
|---|-----------|-------|----------|
| 1 | Constraint compliance | 4/10 | 96% fail mechanical checks (salutation bug). Word count compliance is excellent (0% over 88), masking structural failures. |
| 2 | Tone consistency | 5/10 | "Happy to" and "I'm curious" are successfully blocked (0 occurrences). But "worth a look" (killed) appears 28 times. VP verbatim makes emails sound robotic. |
| 3 | Personalization depth | 6/10 | Research phase produces good prospect-specific intel. But composition squeezes it into 3 template paragraphs, and the VP verbatim displaces space for personalization. |
| 4 | Fact accuracy | 7/10 | Web verification gate catches most unverified claims. Entity resolution works. BEAD-specific claims need more scrutiny (Tim flagged in Sample 108). |
| 5 | Structure | 3/10 | 60% share the same 3-paragraph skeleton: insight opener + VP verbatim + question. 96% repeat patterns across touches. T3 is near-identical across all prospects. |
| 6 | Word count adherence | 9/10 | avg 63.6 words, 2% over 80, 0% over 88. This is the system's strongest dimension. |
| 7 | AI-tell avoidance | 7/10 | Em-dashes: 0. "Happy to": 0. "Curious": 0. Good. But structural uniformity IS an AI tell (Skeptic judge's #3 concern). The same sentence in 60% of emails is the largest remaining AI fingerprint. |
| 8 | CTA quality | 3/10 | T1 CTAs are reasonable ("Is this something you're running into?"). T3 CTAs are almost all Tim-killed phrases ("worth a look, or not the right time?"). T2 CTAs cluster on "Worth 20 minutes?" (45 occurrences), which Tim approved but is now overused. |
| 9 | P.S. effectiveness | 6/10 | Microsite links are correctly appended. Multi-thread seeding works. But many P.S. lines are generic ("Put together a quick overview...") rather than pattern-breaking. |
| 10 | Scalability | 4/10 | Parse errors on T3 (7 total), no retry logic, Brain KB digest is noisy garbage (see entity extraction issues), research data passed untrimmed (~44KB per prospect), pattern selector has no dedup across touches. |

**Overall: 5.4/10** — Mechanically clean emails that read like templates.

---

## 3. Improvement Plan

### P1: Fix Salutation Join/Judge Conflict [CRITICAL, effort: XS]

**What:** Align the mechanical check with the post-processing behavior. The join at line 381 is the correct behavior (Tim wants "Chris, you said..." not "Chris,\nyou said..."). The judge must check for `"${firstName}, "` as the start of the first line, not `"${firstName},"` as the entire first line.

**File:** `src/showrev/m1-email-find/judge.ts` line 44

**Change:**
```typescript
// Before
if (firstLine !== `${prospectFirstName},`) {
// After  
if (!firstLine.startsWith(`${prospectFirstName},`)) {
```

Also remove the "blank line between salutation and first paragraph" warning (lines 49-51) since the join explicitly removes it.

**Impact:** Mechanical check goes from 4% pass to ~90%+ pass. Real failures (word count, AI tells, wrong products) become visible again.

### P2: Remove Tim-Killed Phrases from Prompt [CRITICAL, effort: XS]

**What:** Replace the T3 binary close instruction with Tim-approved alternatives.

**File:** `src/showrev/m1-email-find/influence.ts` line 217

**Change:**
```typescript
// Before
'Final touch. 3-4 sentences MAX. Binary close: "worth a look, or not the right time?" Easy to say yes or no. Respectful.'
// After
'Final touch. 3-4 sentences MAX. Binary close CTA. Use: "Worth a 20-minute conversation?" or "Worth 15 minutes?" Do NOT use: "worth a look", "or not the right time", "just say the word", "say the word". Easy to say yes or no. Professional.'
```

Also add an explicit kill-list to the anti-AI-tell section (influence.ts line 219):
```
- NEVER use: "worth a look", "or not the right time", "just say the word", "say the word", "on my end", "just let me know", "Different angle", "eat construction time", "bleeding", "binding constraint"
```

**Impact:** T3 emails stop using phrases Tim kills on sight. Estimated fix rate: 57/69 T3 emails.

### P3: Replace VP Verbatim with Outcome-First Instruction [HIGH, effort: S]

**What:** Change the prompt from "use verbatim" to "describe by outcome, adapt phrasing."

**File:** `src/showrev/m1-email-find/influence.ts` lines 193-195

**Change:**
```typescript
// Before
`## What Inorsa does (use verbatim when describing the value prop)
We convert GIS design data into CAD-ready construction drawings. Quality control is built in, so builds keep moving.`
// After
`## What Inorsa does (describe by OUTCOME, vary the phrasing across emails)
Core capability: automated GIS-to-CAD conversion with built-in QC.
When mentioning Inorsa, describe the RESULT for THIS prospect, not the product. Examples:
- "Inorsa automates the GIS-to-CAD step, so your team stops hand-drawing what's already designed."
- "permit packages that pass review the first time, because QC happens upstream."
- "your designers spend time designing, not reformatting."
Do NOT copy any example sentence verbatim. Adapt to the prospect's situation.
Mention Inorsa ONCE in the email. Describe it by outcome, not product features.`
```

**Impact:** Eliminates the 63% n-gram repetition. Frees ~14 words per email for personalization. Matches Tim's approved pattern: "one mention of Inorsa per email, described by outcome."

### P4: Enforce Pattern Dedup Across Touches [HIGH, effort: S]

**What:** Pass the T1 pattern selection as a constraint when selecting T2, and both when selecting T3. The pattern selector currently has no memory.

**File:** `src/showrev/m1-email-find/premium-pipeline.ts` lines 322-342

**Change:** Modify the loop to pass previously selected patterns:
```typescript
const patternSelections: PatternSelection[] = [];
for (const touchNum of [1, 2, 3] as const) {
  const previousPatterns = patternSelections.map(p => p.pattern);
  const prompt = buildPatternSelectorPrompt(
    enrichedDossierSummary, prospect.aeNotes, prospect.title, touchNum,
    previousPatterns  // NEW parameter
  );
  // ... rest stays the same
}
```

**File:** `src/showrev/m1-email-find/influence.ts` `buildPatternSelectorPrompt`

**Change:** Add parameter and constraint:
```typescript
export function buildPatternSelectorPrompt(
  dossierSummary: string,
  aeNotes: string,
  contactTitle: string,
  touchNumber: 1 | 2 | 3,
  previousPatterns: InfluencePattern[] = []  // NEW
): string {
  // Add to prompt:
  const dedup = previousPatterns.length > 0
    ? `\n## MANDATORY: Do NOT repeat these patterns already used: ${previousPatterns.join(', ')}. Select a DIFFERENT pattern.`
    : '';
  // ... insert dedup into the prompt template
}
```

**Impact:** Eliminates 96% pattern repetition. Each 3-touch sequence uses 3 distinct angles. Dramatically reduces template smell.

### P5: Delete Dead `COMPOSITION_HARD_CONSTRAINTS` [LOW, effort: XS]

**What:** Remove the unused constant to prevent confusion. The real constraints live in `buildComposerPrompt`.

**File:** `src/showrev/m1-email-find/premium-pipeline.ts` lines 79-86

**Change:** Delete the constant entirely.

**Impact:** Code clarity. Prevents future developers from assuming it's used.

### P6: Add Tim Kill-List to Mechanical Checks [MEDIUM, effort: S]

**What:** The mechanical check (`judge.ts`) catches some AI tells ("I'm curious", "Happy to") but not Tim's full kill list. Add the high-fire-rate kills from `judges.ts` TIM_EDIT_PATTERNS.killed to the mechanical check.

**File:** `src/showrev/m1-email-find/judge.ts` lines 72-77

**Change:** Add checks for:
```typescript
if (/\bworth a look\b/i.test(body)) failures.push('Tim-kill: "worth a look"');
if (/\bor not the right time\b/i.test(body)) failures.push('Tim-kill: "or not the right time"');
if (/\bsay the word\b/i.test(body)) failures.push('Tim-kill: "say the word"');
if (/\bon my end\b/i.test(body)) failures.push('Tim-kill: "on my end"');
if (/\bjust let me know\b/i.test(body)) failures.push('Tim-kill: "just let me know"');
if (/\bDifferent angle\b/i.test(body)) failures.push('Tim-kill: "Different angle"');
if (/\beat construction\b/i.test(body)) failures.push('Tim-kill: "eat construction"');
if (/\bbleeding\b/i.test(body)) failures.push('Tim-kill: "bleeding"');
if (/\bbinding constraint\b/i.test(body)) failures.push('Tim-kill: "binding constraint"');
```

**Impact:** Catches Tim-killed phrases before Supabase write, instead of only catching them in the Tim Proxy judge (which is advisory-only today).

### P7: Truncate Research Data in Composition Prompt [MEDIUM, effort: S]

**What:** The composition prompt receives the full concatenation of all 3 persona research outputs (~44KB, ~11,000 tokens average). This overwhelms the 80-word composition instruction. The model sees 11,000 tokens of research and tries to cram everything in, producing dense, information-heavy emails rather than selecting the ONE best insight.

**File:** `src/showrev/m1-email-find/premium-pipeline.ts` line 354

**Change:**
```typescript
// Before
const researchSummary = Object.values(personaResults).join('\n\n');
// After
const researchSummary = Object.values(personaResults)
  .map(r => r.slice(0, 1500))  // ~375 tokens each, ~1125 total
  .join('\n\n---\n\n');
```

Alternatively, use the `structuredDossier` output from Phase 5 (already trimmed to key fields) as the composition context instead of raw research. This would require reordering phases (structure intel before compose).

**Impact:** Reduces context pressure. The model can focus on the 80-word composition task rather than trying to compress 11K tokens of research into 80 words. May reduce parse errors too.

### P8: Wire Judge Feedback into Recomposition [HIGH, effort: M]

**What:** Currently, composition produces the email, the Tim Proxy judge evaluates it, and the result is logged but NEVER triggers recomposition. The judge is advisory-only.

**Change:** After Tim Proxy judge, if `timVerdict.pass === false` and `timVerdict.score < 6`, recompose with the `mustFix` items appended to the prompt:
```typescript
if (timVerdict && !timVerdict.pass && timVerdict.score < 6) {
  const fixPrompt = composerPrompt + `\n\n## MANDATORY FIXES from review:\n${timVerdict.mustFix.join('\n')}\n\nRewrite the email incorporating these fixes.`;
  const retryResult = await executePrompt(fixPrompt, config.model, 300000, `T${touchNum}-compose-retry`);
  // ... parse and replace
}
```

**Impact:** Closes the feedback loop. Currently the system detects problems but cannot fix them. This change would catch ~30% of issues the Tim Proxy identifies. Cost: one additional LLM call per failing email.

### P9: Clean Brain KB Entity Extraction [MEDIUM, effort: M]

**What:** The Brain KB digest is extremely noisy. Entity extraction (`brain-ingest.ts` lines 54-139) uses regex patterns that capture garbage: `"Troy Hoover's LinkedIn profile or career h"` as a company name, `"BEAD exposure"` as a company, `"GM who"` as a company. 440 entities, most are noise.

The digest (`brain-context-digest.md`) inherits this noise and passes 25KB of low-quality context into research prompts.

**File:** `src/showrev/m1-email-find/brain-ingest.ts` `extractEntities` function

**Change:** Add quality filters:
```typescript
// After extraction, filter garbage
entities = entities.filter(e => {
  if (e.type === 'company') {
    if (e.name.length < 3 || e.name.length > 50) return false;
    if (/LinkedIn|profile|career|URL|specifically|exposure/i.test(e.name)) return false;
    if (/^(BEAD|GM|CFO|COO|CEO|CTO|VP)\b/.test(e.name)) return false;
  }
  return true;
});
```

**Impact:** Cleaner Brain KB. Less noise in research context. Better semantic search results from AgentDB.

### P10: Add T3 Parse Error Retry [LOW, effort: XS]

**What:** 4/69 T3 emails (6%) fail JSON parsing, producing `[Parse error - manual review needed]`. No retry is attempted.

**File:** `src/showrev/m1-email-find/premium-pipeline.ts` lines 409-420

**Change:** Wrap the T3 composition in a retry:
```typescript
} catch (e) {
  if (touchNum === 3 && retryCount < 1) {
    console.log(`  │  ⏳ T${touchNum} parse retry...`);
    retryCount++;
    i--; continue; // retry this touch
  }
  // ... existing fallback
}
```

**Impact:** Eliminates most T3 parse errors. T3 is shortest, so retry cost is minimal.

---

## 4. Scale Readiness

### Current ceiling: ~70 prospects per run (tested)

### What breaks at 200-500 prospects:

| Risk | Current State | At Scale | Fix |
|------|--------------|----------|-----|
| Brain KB noise | 440 entities, mostly garbage | 1500+ entities, unusable | P9 (entity quality filters) |
| Research context size | 44KB avg, no truncation | Same per prospect, but Brain KB grows | P7 (truncate research in composition) |
| `claude -p` rate limits | Sequential composition, no concurrency | ~500 sequential CLI calls (T1+T2+T3 x 170) | Add batch parallelism with rate limiting |
| Pattern selector no memory | T1/T2/T3 pick independently | Same at any scale, but repetition becomes glaringly obvious in batch | P4 (pattern dedup) |
| Checkpoint/resume | Works, tested at 69 | Should work, but test at 200+ | Monitor for edge cases |
| Supabase write throughput | Sequential upserts | May hit rate limits at 200+ concurrent | Add batch upsert or queue |
| Template detection by recipients | 60% share VP verbatim | If 10+ prospects at same company/event see emails, template is exposed | P3 (outcome-first VP) |
| Brain KB semantic search | AgentDB with 440 entities | Growing KB improves, but noisy entities degrade search relevance | P9 + periodic Brain KB cleanup job |

### Pre-scale checklist:
1. Fix P1 (salutation) — gate must work before scaling
2. Fix P2 (Tim kills) — must stop producing emails Tim rejects
3. Fix P3 (VP verbatim) — template smell is the #1 risk at scale
4. Fix P4 (pattern dedup) — recipients will compare emails internally
5. Fix P7 (research truncation) — prevents context window pressure as Brain grows
6. Add composition parallelism — 3 prospects at a time with 2s delay between calls
7. Add batch Supabase upsert — single call per batch instead of per-prospect

---

## 5. Baseline Recovery (minimum changes for initial quality)

The initial emails were strong because they were the first few, with smaller Brain KB, and the operator (Tim) was closely reviewing. The system itself has not degraded — the same bugs existed from the start. What changed is that at 69 prospects, the template patterns become statistically visible.

**Minimum viable fix — 3 changes, < 30 minutes each:**

1. **P1: Fix salutation check** (`judge.ts` line 44) — one line change. Mechanical gate starts working.
2. **P2: Remove Tim-killed phrases from T3 prompt** (`influence.ts` line 217) — one line change. T3 stops producing dead-on-arrival emails.
3. **P3: Replace "use verbatim" with "describe by outcome"** (`influence.ts` lines 193-195) — small edit. Breaks the 63% n-gram repetition.

These three changes address 80% of the quality gap. Combined estimated effort: 1 hour including testing.

---

## 6. Excellence Path (consistently excellent at scale)

### Tier 1: Foundation (week 1)
- P1 + P2 + P3 (baseline recovery above)
- P4 (pattern dedup) — prevents structural repetition
- P5 (delete dead code) — housekeeping
- P6 (Tim kill-list in mechanical checks) — catch issues before Supabase

### Tier 2: Intelligence (week 2)
- P7 (research truncation) — better signal-to-noise in composition
- P8 (judge feedback loop) — auto-fix detectable problems
- P9 (Brain KB cleanup) — stop polluting the knowledge base

### Tier 3: Scale (week 3)
- P10 (T3 retry) — eliminate parse errors
- Wire `prompt-optimizer.ts` (dspy.ts) — currently built but not connected (line 6 of prompt-optimizer.ts: `loadTrainingExamples` reads from output dir, but no pipeline step calls the optimizer)
- Add composition parallelism (3-wide with backpressure)
- Add batch Supabase writes
- Add per-run template-smell score: compute n-gram overlap across the batch and warn if >30%

### Tier 4: Continuous Improvement
- Tim Proxy verdict data should feed back into `TIM_EDIT_PATTERNS` automatically
- Cross-model judge should run on a sample (10%) per batch, not skipped entirely (currently not wired into premium-pipeline.ts)
- A/B test different VP phrasing variants across batches
- Track open/reply rates per influence pattern to validate pattern selection

---

## Appendix: Key Numbers from 69-Prospect Analysis

```
Mechanical pass rate:             4% (3/69) — meaningless due to salutation bug
Word count compliance:            98% under 80, 100% under 88
VP verbatim in T1:                60% (41/68)
Pattern repetition in sequence:   96% (66/69)
Tim-killed "worth a look":       41% (28/69 T3)
Tim-killed "not the right time": 83% (57/69 T3)
T3 parse errors:                 6% (4/69)
loss_aversion overuse:           47% of all pattern selections
Signature in body (post-strip):  3% (5/200)
"Happy to" (blocked):           0%
"I'm curious" (blocked):        0%
Em-dashes (blocked):            0%
Avg word count:                  63.6
Avg research context size:       44KB (~11K tokens) per prospect
Brain KB entities:               440 (est. 60%+ noise)
```

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-02 09:00 | Claude | Initial diagnosis from full codebase + 69-prospect output analysis |
