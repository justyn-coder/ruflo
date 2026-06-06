---
title: Wave 2 Implementation Specs — ICP-Aware Composition
status: ACTIVE
last_updated: 2026-06-06 00:20 EST
version: v1
---

# Wave 2 Implementation Specs

**Goal:** A&E firms get different CTAs, bridge framing, and judge scoring than fiber operators. Cold prospect framing replaces post-show follow-up framing when no aeNotes exist.

**Prerequisite:** Wave 1 PASSED post-implementation judge panel. icpType is threaded through all composition/pattern/judge function signatures but not yet used in prompt text. Wave 2 activates the icpType parameter in prompt bodies.

**Hard rules (carry forward from Wave 1):**
- Anti-validation rule stays UNIVERSAL: "NEVER claim Inorsa validates inputs or catches errors" — do NOT soften for A&E
- No Harmoni, no structural analysis, no tower/cellular, no MicroStation, no Drawing QC, no TNX, no mount analysis
- Tom Marciano = INERT. NEVER a sender.
- Salutation hard-lock: `[FirstName],` (comma only)
- Value prop scope: drawings-only (Engineering Suite + Data Suite)
- Pitch variants A/B/C are LOCKED — do NOT change

---

## 2a. ICP-Specific CTAs in Hypothesis Format

**File:** `src/showrev/m1-email-find/influence.ts`

**What changes:**

Add `ICP_CTA_OPTIONS` constant after `INFLUENCE_TOOLKIT` (after line 194). Maps icpType to 4 diagnostic CTA questions each.

```typescript
const ICP_CTA_OPTIONS: Record<string, string[]> = {
  fiber_operator: [
    'Are your construction drawings keeping pace with your build schedule, or is documentation the bottleneck?',
    'How many design iterations does a typical permit package go through before it clears?',
    'When your GIS data changes mid-build, how long does it take to get updated construction drawings back to the field?',
    'What percentage of your engineering time goes to drawing production versus actual design work?',
  ],
  ae_firm: [
    'How many hours does someone on your team spend cross-checking before engineering review can start?',
    'When a client sends updated GIS data mid-project, how long does the redraw cycle take?',
    'What does your drawing throughput look like per engineer per week — and where does it stall?',
    'How much of your project margin gets consumed by CD revision cycles?',
  ],
};
```

**CTA selection logic in `buildComposerPrompt`:**

Modify the T1 CTA instruction (currently line 306) to be ICP-aware and support hypothesis format:

Current (hardcoded):
```
Default: "Are your construction drawings keeping pace with your build schedule, or is documentation the bottleneck?"
```

New (ICP-aware + hypothesis):
```
${(() => {
  const ctaOptions = ICP_CTA_OPTIONS[icpType || ''] || ICP_CTA_OPTIONS['fiber_operator'];
  const ctaList = ctaOptions.map((q, i) => `  ${i + 1}. "${q}"`).join('\n');
  return `Choose ONE diagnostic question from this list (matched to this prospect's segment):
${ctaList}

HYPOTHESIS FORMAT (use when key facts have 3+ company-specific lines): Instead of a list question, frame as: "Based on [specific fact from key facts], I suspect [hypothesis about their situation]. Is that directionally right?" This tests whether your research insight resonates. Fall back to the list question when key facts are thin (only state-level data or <3 lines).`;
})()}
```

For T2 and T3, keep existing instructions but add: "Select a DIFFERENT diagnostic angle from the ICP CTA list above, or derive one from the dossier."

**CRITICAL:** These are workflow-pain questions about the prospect's bottleneck. A&E "cross-checking" and "CD revision cycles" refer to the prospect's internal workflow, NOT to Inorsa's Validation Suite product. The anti-validation rule still applies.

**Backward compat:** `icpType` param already exists (Wave 1). No signature changes needed.

---

## 2b. Cold Prospect Framing

**File:** `src/showrev/m1-email-find/influence.ts`

**What changes:**

### 2b-1: Composer prompt framing (buildComposerPrompt, line 275)

Current (hardcoded post-show):
```
return `You are writing a post-show follow-up email for Fiber Connect 2026 (May 18-19, Gaylord Palms Resort, Kissimmee FL, Booth 1728). The sender is ${aeName}, an AE at Inorsa.
```

New (conditional):
```typescript
const hasAeNotes = aeNotes && aeNotes.trim().length > 0;
const framingLine = hasAeNotes
  ? `You are writing a post-show follow-up email for Fiber Connect 2026 (May 18-19, Gaylord Palms Resort, Kissimmee FL, Booth 1728). The sender is ${aeName}, an AE at Inorsa.`
  : `You are writing a cold outreach email to a fiber industry professional. No prior interaction. The sender is ${aeName}, an AE at Inorsa.`;

return `${framingLine}
```

### 2b-2: Pattern selector exclusion (buildPatternSelectorPrompt)

When no aeNotes, exclude `commitment_consistency` from available patterns. Add after `patternsDesc` construction (line 207):

```typescript
const hasAeNotes = aeNotes && aeNotes.trim().length > 0;
const filteredPatternsDesc = hasAeNotes
  ? patternsDesc
  : patternsDesc.replace(
      /\*\*commitment_consistency\*\*:[\s\S]*?(?=\n\n\*\*|$)/,
      '**commitment_consistency**: [EXCLUDED — no booth interaction for this prospect. Do NOT select this pattern.]'
    );
```

Then use `filteredPatternsDesc` in the prompt instead of `patternsDesc`.

Also add a cold prospect instruction to the prompt body:
```
${!hasAeNotes ? '\n## COLD PROSPECT\nThis prospect did NOT visit the booth. There are NO AE notes and NO prior interaction. Do NOT reference a booth visit, a conversation, or anything implying prior contact. Lead with research-based insight only.' : ''}
```

### 2b-3: Touch guidance update

The `touchGuidance` object (line 212-216) has "Booth callback if notes exist" in T1. Make conditional:

```typescript
1: `T1 (first touch): Interest-based CTA. No links.${hasAeNotes ? ' Booth callback if notes exist.' : ''} Goal: get a reply, not a meeting.`,
```

**Note:** The `hasAeNotes` variable needs to be derived from the `aeNotes` parameter in `buildPatternSelectorPrompt`. Currently line 198 has `aeNotes: string`. The check is simply `aeNotes && aeNotes.trim().length > 0`.

---

## 2c. Activate ICP-Aware Prompt Framing

**File:** `src/showrev/m1-email-find/influence.ts`

**What changes:**

### 2c-1: Pattern selector ICP context (buildPatternSelectorPrompt)

Add ICP-segment context block after the persona detection section (after line 236):

```typescript
${icpType && icpType !== 'unknown' ? `
## ICP segment: ${icpType}
${icpType === 'fiber_operator' ? `This is a fiber operator (ISP, telco, electric coop, municipal broadband). Their pain points center on:
- GIS-to-CAD conversion bottleneck (manual redrawing from GIS exports)
- Build schedule pressure (BEAD construction deadlines, subscriber activation)
- Drawing throughput limiting crew deployment
- Permit cycle time eating into construction windows
Frame pattern selection around these operational bottlenecks.` : ''}
${icpType === 'ae_firm' ? `This is an A&E (Architecture & Engineering) firm doing fiber design work. Their pain points center on:
- Project throughput (drawings per engineer per week)
- CD revision cycles consuming project margin
- Cross-checking time before engineering review
- Scaling headcount to match project pipeline without proportional hiring
Frame pattern selection around margin-per-project and throughput bottlenecks.` : ''}` : ''}
```

### 2c-2: Composer prompt ICP context (buildComposerPrompt)

Add ICP-segment block after the persona framing section (after line 316, after `Value lens: ${persona.valueLens}`):

```typescript
${icpType && icpType !== 'unknown' ? `
## ICP segment: ${icpType}
${icpType === 'fiber_operator' ? `This prospect is a fiber operator. Frame the bridge around:
- GIS-to-CAD conversion pain (manual redrawing from GIS exports into construction drawings)
- Build schedule adherence (drawings as the bottleneck, not engineering talent)
- BEAD/grant construction deadlines creating time pressure
Do NOT reference "validation" or "cross-checking" as a primary pain — those are A&E firm pains.` : ''}
${icpType === 'ae_firm' ? `This prospect is an A&E firm. Frame the bridge around:
- Drawing throughput per engineer (how many permit-ready packages per week)
- CD revision cycles consuming margin on fixed-fee projects
- Scaling project capacity without proportional headcount growth
- Cross-referencing time between GIS source data and deliverable drawings
Do NOT frame around "build schedule" or "crew utilization" as primary pains — those are operator pains.
CRITICAL: Do NOT claim Inorsa "validates inputs" or "catches errors." The prospect's cross-checking pain is real, but the email must frame Inorsa's value as automated drawing generation, not as a validation tool.` : ''}` : ''}
```

### 2c-3: Run-pipeline.ts recompose paths

Already done in Wave 1 — both recompose paths (word-count at line 1636 and judge-failure at line 1774) pass `icpType` to `buildComposerPrompt`. No additional changes needed.

**IMPORTANT:** The anti-validation instruction on line 312 ("NEVER claim Inorsa validates inputs or catches errors") stays UNIVERSAL across all ICP types. The 2c-2 A&E block reinforces this — it does NOT soften it.

---

## 2d. Talk-Track Bridge Structure

**File:** `src/showrev/m1-email-find/influence.ts`

**What changes:**

Replace the bridge instruction in `buildComposerPrompt` (currently line 305):

Current:
```
3. BRIDGE (1 sentence): Connect that fact to drawing/documentation pressure or the persona's value lens.
```

New:
```
3. BRIDGE (1 sentence): Name the specific friction the opener fact implies for this prospect's workflow. Use the failure-friction micro-template:
   - Name what's failing or slowing down (the friction)
   - Make it specific to this persona's daily work
   - Do NOT name Inorsa or any fix yet — let the CTA invite the conversation

   GOOD bridges by ICP:
   ${icpType === 'ae_firm' ? `- "At that project volume, every CD revision cycle that takes a week instead of a day is margin you don't recover."
   - "When the source GIS changes mid-project, the redraw hours hit your fixed-fee bottom line."` : `- "At that build pace, a week of delayed construction drawings means crews sitting idle."
   - "When your GIS data updates and the drawings don't follow, the field runs on stale specs."`}

   BAD bridges (do NOT do this):
   - "Inorsa can help with that." (names the fix too early)
   - "Many companies face similar challenges." (generic, no friction named)
   - "That's where automation comes in." (solution before problem is felt)
```

---

## 2e. Competitive Bridge Adaptation

**File:** `src/showrev/m1-email-find/influence.ts`

**What changes:**

Add `COMPETITOR_CATEGORIES` constant after `ICP_CTA_OPTIONS`:

```typescript
const COMPETITOR_CATEGORIES: Record<string, { category: string; gap: string }> = {
  'iqgeo': { category: 'GIS platform', gap: 'manages network data but doesn\'t generate construction drawings from it' },
  '3gis': { category: 'GIS platform', gap: 'strong on fiber network modeling, gap on automated drawing output' },
  'sitetracker': { category: 'project management', gap: 'tracks projects but doesn\'t automate the drawing production that feeds them' },
  'katapult': { category: 'pole data collection', gap: 'captures field data but doesn\'t convert it to permit-ready construction drawings' },
  'vetro': { category: 'network planning', gap: 'plans routes but doesn\'t generate the construction documents for those routes' },
  'biarri': { category: 'network planning', gap: 'optimizes network design but doesn\'t produce construction-ready deliverables' },
  'osmose': { category: 'engineering software', gap: 'handles pole analysis but doesn\'t automate the downstream drawing generation' },
  'hexagon': { category: 'engineering software', gap: 'broad engineering suite, but fiber drawing automation isn\'t the core workflow' },
  'render networks': { category: 'GIS platform', gap: 'network design platform, gap on automated construction drawing output' },
  'comsof': { category: 'network planning', gap: 'fiber planning optimization, doesn\'t extend to construction drawing generation' },
};
```

Add competitive bridge instruction to `buildComposerPrompt`, inside the bridge section (after the failure-friction micro-template):

```
${(() => {
  if (!keyFacts) return '';
  const kfLower = keyFacts.toLowerCase();
  const matchedCompetitor = Object.entries(COMPETITOR_CATEGORIES).find(
    ([name]) => kfLower.includes(name)
  );
  if (!matchedCompetitor) return '';
  const [name, info] = matchedCompetitor;
  return `\n   COMPETITIVE CONTEXT: Key facts mention ${name} (${info.category}). If you reference the incumbent, acknowledge what it does well, then name the gap: "${info.gap}." Frame as complementary ("works alongside") not replacement ("replace your"). Tone: "acknowledge, not trash."`;
})()}
```

**Note:** This uses the same 10 competitors from `KNOWN_COMPETITORS` in brain-ingest.ts (Wave 1f). The categories and gap descriptions are sales-playbook-derived (from memory `reference_inorsa_sales_playbook.md`).

---

## 2f. ICP-Aware Judge Scoring — Bonus Only

**File:** `src/showrev/m1-email-find/judge.ts`

**What changes:**

### 2f-1: Add icpType to buildJudgePrompt signature

Current (line 164):
```typescript
function buildJudgePrompt(dossier: Dossier, touch: EmailTouch, researchContext?: string): string {
```

New:
```typescript
function buildJudgePrompt(dossier: Dossier, touch: EmailTouch, researchContext?: string, icpType?: string): string {
```

### 2f-2: Add ICP-segment JTBD guidance to judge prompt

After the JTBD alignment dimension description (line 192), add:

```
${icpType && icpType !== 'unknown' ? `
## ICP segment context (BONUS scoring guidance)
${icpType === 'fiber_operator' ? `This is a fiber operator. BONUS (+1-2 on jtbd_alignment) if the email:
- Frames pain around GIS-to-CAD conversion, build schedule pressure, or BEAD construction deadlines
- Uses a CTA question about drawing throughput, permit cycles, or field crew utilization
- Bridges from a company fact to drawing/documentation friction
Do NOT penalize if the email uses generic fiber framing instead of segment-specific framing. This is a bonus, not a requirement.` : ''}
${icpType === 'ae_firm' ? `This is an A&E firm. BONUS (+1-2 on jtbd_alignment) if the email:
- Frames pain around project throughput per engineer, CD revision cycles, or margin-per-project
- Uses a CTA question about cross-checking time, redraw cycles, or capacity scaling
- Bridges from a company fact to engineering workflow friction
Do NOT penalize if the email uses generic fiber framing instead of segment-specific framing. This is a bonus, not a requirement.
CRITICAL: If the email claims Inorsa "validates inputs" or "catches errors," that is a MECHANICAL FAILURE, not a JTBD bonus question. The anti-validation rule is absolute regardless of ICP type.` : ''}` : ''}
```

### 2f-3: Thread icpType through judgeEmail

Current (line 216):
```typescript
export async function judgeEmail(
  dossier: Dossier,
  touch: EmailTouch,
  model: string = 'sonnet',
  researchContext?: string,
): Promise<JudgeVerdict | null> {
```

New:
```typescript
export async function judgeEmail(
  dossier: Dossier,
  touch: EmailTouch,
  model: string = 'sonnet',
  researchContext?: string,
  icpType?: string,
): Promise<JudgeVerdict | null> {
```

And update the call to `buildJudgePrompt` (line 222):
```typescript
const prompt = buildJudgePrompt(dossier, touch, researchContext, icpType);
```

### 2f-4: Thread icpType through phaseJudge in run-pipeline.ts

In `phaseJudge` (line 664), the `icpType` param is already accepted (Wave 1). Need to pass it to `judgeDimensions` (alias for `judgeEmail`).

Current call at ~line 696:
```typescript
const verdict = await judgeDimensions(dossier, touchObj, config.model, researchSummary);
```

New:
```typescript
const verdict = await judgeDimensions(dossier, touchObj, config.model, researchSummary, icpType);
```

**CRITICAL CONSTRAINTS:**
- BONUS only (+1-2 on jtbd_alignment). No penalties. No existing email scores lower.
- The anti-validation rule enforcement is MECHANICAL (judge.ts runMechanicalChecks), not judge-prompt-level. The judge prompt reinforces it but the gate is the regex.
- Must deploy WITH or AFTER composition changes (2a-2e), never before. Since we implement all of Wave 2 together, this is satisfied.

---

## 2g. Tower A&E Exclusion

**File:** `src/showrev/m1-email-find/icp-gate.ts`

**What changes:**

### 2g-1: Add TOWER_AE_INDICATORS constant

After `NON_ICP_ROLES` (after line 41):

```typescript
const TOWER_AE_INDICATORS = [
  /\bcell\s*site/i,
  /\bmacro\s*site/i,
  /\bsmall\s*cell/i,
  /\btower\s+(?:engineering|design|analysis|construction)/i,
  /\bDAS\b/,
  /\bdistributed\s+antenna/i,
];
```

### 2g-2: Add FIBER_OVERRIDE_INDICATORS constant

```typescript
const FIBER_OVERRIDE_INDICATORS = [
  /\bfiber\b/i, /\bFTT[HPx]\b/i, /\bbroadband\b/i,
  /\bOSP\b/i, /\boutside\s+plant\b/i,
];
```

### 2g-3: Modify regexClassify

Add tower A&E check AFTER the AE indicator scoring block (after line 63, before the `return null`):

```typescript
// Tower A&E exclusion — narrow patterns, fiber overrides
if (aeScore >= 1) {
  const hasTowerSignals = TOWER_AE_INDICATORS.some(p => p.test(company));
  if (hasTowerSignals) {
    const hasFiberOverride = FIBER_OVERRIDE_INDICATORS.some(p => p.test(company));
    if (!hasFiberOverride) {
      return { verdict: 'reject', icpType: 'non_icp', reason: `A&E firm with tower/cellular indicators (no fiber override)`, confidence: 0.7, method: 'regex' };
    }
  }
}
```

### 2g-4: Update LLM classifier prompt

Add to the llmClassify prompt (after the "REJECT as non_icp" section, line 83):

```
ALSO REJECT as non_icp if the company is an A&E firm that ONLY does tower/cellular work (cell sites, macro sites, small cells, DAS, distributed antenna systems, tower structural analysis). These companies are NOT in Inorsa's fiber ICP.

HOWEVER: If the company does BOTH tower AND fiber work, classify as "ae_firm" — they have fiber-relevant needs even if tower is part of their business. Fiber indicators (fiber, FTTH, broadband, OSP, outside plant) override tower indicators.
```

**CRITICAL:** Narrow patterns only. "Tower" alone is NOT enough — must be combined with engineering/design/construction context or specific tower infrastructure terms. Fiber indicators always override.

---

## Dependency Order

Changes can be implemented in any order since they modify different sections, but must all deploy together:
1. **2a + 2b + 2c + 2d + 2e** — all in influence.ts (separate sections, no conflicts)
2. **2f** — judge.ts + run-pipeline.ts (judge scoring)
3. **2g** — icp-gate.ts (independent)

The constraint is: 2f (judge bonus) must not deploy BEFORE 2a-2e (composition changes). Since we ship everything together, this is satisfied.

---

## What NOT to Touch

| Item | Reason |
|---|---|
| Anti-validation rule (influence.ts line 312) | UNIVERSAL. Do not condition on ICP type. |
| Pitch variants A/B/C | LOCKED per operator directive. |
| Persona detection logic | Works correctly. ICP != persona. |
| extractKeyFacts | Already enriched in Wave 1h. No changes. |
| brain-ingest.ts | Already enriched in Wave 1f. No changes. |
| intel-structurer.ts | Already enriched in Wave 1e. No changes. |
| personas.ts | Already enriched in Wave 1g. No changes. |
| premium-pipeline.ts | Deprecated in Wave 1x. Do not modify. |
| lean-composer.ts | Does not use ICP-aware prompts (uses separate lean prompt). |

---

## Validation Gate (post-implementation)

Run 15-company set (5 A&E + 10 fiber operators) through run-pipeline.ts:
- [ ] A&E firms get throughput/QA-time CTAs (NOT Validation Suite references)
- [ ] Fiber operators get GIS-to-CAD CTAs
- [ ] No dimension drops >1 point vs baseline
- [ ] Average score >= 6.5 (baseline 6.92, regression budget 0.42)
- [ ] Zero tower/cellular contamination (grep all output)
- [ ] Cold prospect framing used (no "post-show follow-up" for prospects without aeNotes)
- [ ] `commitment_consistency` pattern NOT selected for cold prospects
- [ ] Hypothesis CTA format used when key facts have 3+ company-specific lines

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-06 00:20 | Claude | Initial Wave 2 detailed specs |
