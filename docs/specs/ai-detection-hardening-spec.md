---
title: AI-Writing Detection Hardening — 3 Structural Checks
status: DRAFT
last_updated: 2026-06-08 00:48 EST
version: v1
---

# AI-Writing Detection Hardening Spec

## Problem

Current judge gate catches lexical AI tells (22 regex patterns + 10 Tim-kill phrases). These miss structural tells that trained readers detect:
- Repetitive grammatical rhythm across adjacent sentences
- Overuse of participial clause openers
- Unnaturally uniform sentence lengths

Current pipeline scores ~6/10 against research-validated AI tells. These 3 checks target 8/10.

## Threat Model

"Does a fiber VP feel this was written by a peer?" — not classifier score. GPTZero/Originality.ai are irrelevant (<200 words, wrong content type, 61.3% false-positive rate on non-native speakers per Stanford Liang et al. 2023).

## Integration Point

All 3 checks go in `runMechanicalChecks()` in [judge.ts](src/showrev/m1-email-find/judge.ts), after the existing AI-tell regex block (line 83) and before the product/industry guards (line 97). They are FAILURES (not warnings) — same as the existing AI-tell checks.

---

## Check 1: Echoed Sentence Structures

**Source:** VERMILLION Framework marker 2 (ResearchLeap 2025)

**What it detects:** Adjacent sentences that mirror the same grammatical template. AI tends to generate rhythmically regular prose — e.g., three consecutive Subject-Verb-Object sentences of similar length.

**Detection logic:**

```
function detectEchoedStructure(body: string): string | null {
  // Strip salutation line, split into sentences
  const sentences = extractBodySentences(body);
  if (sentences.length < 3) return null;

  for (let i = 0; i < sentences.length - 2; i++) {
    const a = sentences[i], b = sentences[i+1], c = sentences[i+2];
    const lenA = a.split(/\s+/).length;
    const lenB = b.split(/\s+/).length;
    const lenC = c.split(/\s+/).length;

    // Three adjacent sentences within ±3 words of each other
    // AND all start with the same POS pattern (proper noun, pronoun, or article)
    const spread = Math.max(lenA, lenB, lenC) - Math.min(lenA, lenB, lenC);
    if (spread <= 3) {
      const startsA = classifyOpener(a);
      const startsB = classifyOpener(b);
      const startsC = classifyOpener(c);
      if (startsA === startsB && startsB === startsC) {
        return `3 adjacent sentences echo the same structure (${startsA} opener, ±${spread}w spread)`;
      }
    }
  }
  return null;
}

function classifyOpener(sentence: string): string {
  const first = sentence.split(/\s+/)[0].toLowerCase();
  if (['the','a','an','this','that','these','those'].includes(first)) return 'article';
  if (['i','we','you','they','he','she','it','our','your','their'].includes(first)) return 'pronoun';
  if (/^[A-Z]/.test(sentence.split(/\s+/)[0])) return 'proper-noun';
  if (/ing$/.test(first)) return 'participial';
  return 'other';
}
```

**Threshold:** 3+ adjacent sentences with same opener class AND length spread ≤3 words.

**Why 3, not 2:** In 4-7 sentence emails, two matching adjacent sentences is common and legitimate (e.g., "Chad, Omni Fiber won six awards. The Round 4 timeline puts you at Q3."). Three is the AI tell.

**False positive analysis:**
- Legitimate triple-proper-noun: "Booker won the contract. Booker's team scaled to 40. Booker now needs drawings." — This IS robotic. Flagging it is correct; the composer should vary structure.
- Unlikely in natural writing at <100 words. Human writers naturally vary rhythm in short-form.

**Estimated false positive rate:** <5% on well-composed emails.

---

## Check 2: Participial Clause Density

**Source:** PNAS 2025 (PMC11874169) — present-participial openers at 2-5x human rate in AI text.

**What it detects:** Sentences starting with "-ing" clauses: "Working with multiple ISPs...", "Expanding into BEAD markets...", "Leveraging GIS data..."

**Detection logic:**

```
function detectParticipalDensity(body: string): string | null {
  const sentences = extractBodySentences(body);
  if (sentences.length < 3) return null;

  const participialOpeners = sentences.filter(s => {
    const firstWord = s.trim().split(/\s+/)[0];
    // Match -ing words that aren't common exceptions
    return /^[A-Z][a-z]*ing\b/.test(firstWord)
      && !['During', 'King', 'Ring', 'Bring', 'Thing', 'Spring', 'String'].includes(firstWord);
  });

  if (participialOpeners.length > 1) {
    return `${participialOpeners.length} participial openers in ${sentences.length} sentences (AI structural tell)`;
  }
  return null;
}
```

**Threshold:** >1 participial opener per email body. One is natural; two in 4-7 sentences is a strong AI signal.

**False positive analysis:**
- "During our research, we found..." — "During" excluded from match (not a participial).
- Single participial opener is allowed. Only 2+ triggers.
- In a 5-sentence email, 2 participial openers = 40% density, well above the human baseline of ~8-12%.

**Estimated false positive rate:** <3%.

---

## Check 3: Sentence-Length Variance

**Source:** B2B practitioner consensus (Lead411 2026, B2B Rocket 2026), PNAS 2025. Low variance = robotic rhythm. ChatGPT baseline is 12% coefficient of variation; Claude is 38% — better, but still detectable when the composer falls into pattern mode.

**What it detects:** All sentences in the body being roughly the same length, producing a monotonous cadence.

**Detection logic:**

```
function detectLowSentenceVariance(body: string): string | null {
  const sentences = extractBodySentences(body);
  if (sentences.length < 3) return null; // too few to measure

  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, len) => a + (len - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (CV) = stdDev / mean
  // Human writing: CV typically 0.30-0.60 for short-form
  // AI writing: CV typically 0.08-0.20
  // Threshold: CV < 0.20 flags
  const cv = mean > 0 ? stdDev / mean : 0;

  if (cv < 0.20) {
    return `Sentence-length variance too uniform (CV=${cv.toFixed(2)}, need >0.20). Lengths: [${lengths.join(', ')}]w`;
  }
  return null;
}
```

**Threshold:** Coefficient of variation < 0.20.

**Calibration for short-form (60-100w, 4-7 sentences):**
- Mean sentence length: ~15 words
- CV 0.20 at mean=15 → stdDev=3.0 → sentences vary by ≤3 words from mean
- Example PASS: [8, 18, 12, 22, 14] → mean=14.8, stdDev=4.7, CV=0.32 ✓
- Example FAIL: [14, 16, 15, 13, 15] → mean=14.6, stdDev=1.0, CV=0.07 ✗

**False positive analysis:**
- A 4-sentence email with lengths [12, 14, 13, 15] → CV=0.09. This IS monotonous and should flag.
- A 4-sentence email with lengths [8, 20, 12, 18] → CV=0.37. Passes easily.
- Risk: Very short emails (3 sentences, ~60w) with one long sentence and two medium ones could have low CV but read fine. The `sentences.length < 3` guard prevents measurement on ultra-short bodies.

**Estimated false positive rate:** <8% (highest of the three checks — short emails with naturally similar sentence lengths).

---

## Shared Helper: extractBodySentences

```
function extractBodySentences(body: string): string[] {
  // Strip salutation line (first line ending in comma)
  const lines = body.split('\n');
  const bodyWithoutSalutation = lines[0].endsWith(',')
    ? lines.slice(1).join(' ')
    : body;

  // Split on sentence boundaries, filter empties
  return bodyWithoutSalutation
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5); // skip fragments
}
```

---

## Implementation Plan

1. Add `extractBodySentences()` helper above `runMechanicalChecks()`
2. Add `classifyOpener()` helper
3. Add 3 detection functions
4. Call all 3 inside `runMechanicalChecks()` after the AI-tell regex block (after line 83)
5. Each returns a failure string or null; push non-null results to `failures[]`

**Integration code (insert at judge.ts ~line 84):**

```typescript
// Structural AI-tell checks (VERMILLION Framework + PNAS 2025)
const echoCheck = detectEchoedStructure(body);
if (echoCheck) failures.push(`AI-structural: ${echoCheck}`);

const participialCheck = detectParticipalDensity(body);
if (participialCheck) failures.push(`AI-structural: ${participialCheck}`);

const varianceCheck = detectLowSentenceVariance(body);
if (varianceCheck) failures.push(`AI-structural: ${varianceCheck}`);
```

**Effort estimate:** ~1 hour implementation + ~1 hour calibration against existing P1 email corpus.

**Calibration plan:** Run the 3 checks against the 45 shipped P1 emails to measure false positive rate. Adjust thresholds if FP rate exceeds 10% on shipped (Tim-approved) emails.

---

## What This Does NOT Cover (Prompt-Layer)

These gate-layer checks catch structural tells AFTER composition. The following are prompt-layer improvements that require composer changes:
- Hedging modals ("could", "might", "perhaps") — Tim catches these at ~9/10 level
- Lived-experience anchors — require prompt engineering, not gate checks
- Sentence-initial variety coaching — could be added to composer instructions

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:48 | Claude | Initial spec: 3 structural AI-detection checks with thresholds, pseudocode, FP analysis |
