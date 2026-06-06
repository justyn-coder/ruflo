---
title: Wave 1 — Detailed Implementation Specs
status: DRAFT
last_updated: 2026-06-06 00:00 EST
version: v1
---

## Preamble

These specs pin every change to exact file, line, old code, new code, and test criteria. Wave 1 goal: ZERO email output changes. Safety guards + plumbing only.

---

## 1a. Unify tower/cellular guard scanning surface (judge.ts)

### Problem
Lines 108-110 scan `body` only for tower/cellular/Harmoni/structural-analysis. Line 114 scans `prospectCopy` (subject + body) for offshore/India. Inconsistent: a subject line containing "Tower engineering solutions" would pass undetected.

Additionally, two tower-adjacent products are unguarded: Mount Analysis (MA) and TNX.

### Current code (judge.ts lines 107-116)
```typescript
  // Pitch verbatim - should not reference tower-side or wrong products
  if (/structural analysis/i.test(body)) failures.push('References structural analysis (tower-side only)');
  if (/Harmoni/i.test(body)) failures.push('References Harmoni (tower product)');
  if (/\btower\b|\bcellular\b/i.test(body)) failures.push('References tower/cellular (fiber only)');

  // Sensitivity checks — scan body AND subject
  const prospectCopy = `${subject} ${body}`;
  if (/\bIndia\b|\boffshore\b|\boutsourc/i.test(prospectCopy)) {
    failures.push('References offshore/India (sensitive in prospect-facing copy)');
  }
```

### New code
```typescript
  // Pitch verbatim - should not reference tower-side or wrong products
  // All guards scan prospectCopy (subject + body) for consistency
  const prospectCopy = `${subject} ${body}`;
  if (/structural analysis/i.test(prospectCopy)) failures.push('References structural analysis (tower-side only)');
  if (/Harmoni/i.test(prospectCopy)) failures.push('References Harmoni (tower product)');
  if (/\btower\b|\bcellular\b/i.test(prospectCopy)) failures.push('References tower/cellular (fiber only)');
  if (/\bmount analysis\b/i.test(prospectCopy)) failures.push('References mount analysis (tower product)');
  if (/\bTNX\b/.test(prospectCopy)) failures.push('References TNX (tower product)');

  // Sensitivity checks
  if (/\bIndia\b|\boffshore\b|\boutsourc/i.test(prospectCopy)) {
    failures.push('References offshore/India (sensitive in prospect-facing copy)');
  }
```

### Key changes
1. Move `const prospectCopy` declaration ABOVE the tower guards (currently declared at line 113, move to before line 108)
2. Change `body` → `prospectCopy` in structural analysis, Harmoni, and tower/cellular guards
3. Add mount analysis guard: `/\bmount analysis\b/i`
4. Add TNX guard: `/\bTNX\b/` (case-sensitive — TNX is always uppercase)

### Risk assessment
- **False positive risk:** "mount analysis" is unlikely in fiber context. TNX is a specific tower product name. Low risk.
- **Existing email impact:** Zero — these patterns don't appear in any of the 45 P1 emails sent to date (fiber-only).

### Test criteria
- Existing 5-company validation set passes unchanged
- Synthetic: subject "Tower engineering solutions" → triggers tower/cellular guard
- Synthetic: body "mount analysis credits" → triggers mount analysis guard
- Synthetic: body "TNX structural loading" → triggers TNX guard
- Synthetic: Pitch A "Quality control is built in" → does NOT trigger any guard

---

## 1b. MicroStation guard (judge.ts)

### Problem
MicroStation is a hard sales guardrail ("Do NOT sell to MicroStation customers. Files don't convert. Customer churned."). No mechanical check exists.

### New code (add after TNX guard, before sensitivity checks)
```typescript
  if (/\bMicroStation\b/i.test(prospectCopy)) failures.push('References MicroStation (hard disqualifier — files don\'t convert)');
```

### Risk assessment
- "MicroStation" is a proper noun. Zero false positive risk in fiber email context.
- The word will never appear in a correctly composed email. This guard catches LLM hallucination only.

### Test criteria
- "compatible with MicroStation" → triggers
- Pitch A "Quality control is built in" → does NOT trigger
- Existing corpus passes unchanged

---

## 1c. Drawing QC guard (judge.ts)

### Problem
Drawing QC is "NOT on roadmap. Do NOT mention to customers." (Zane, explicit). No mechanical check exists. The regex must NOT trigger on Pitch A's "Quality control is built in" — that describes QC during drawing generation, not a standalone product.

### New code (add after MicroStation guard)
```typescript
  if (/\b(?:drawing\s+QC|drawing\s+quality\s+control)\b/i.test(prospectCopy)) failures.push('References Drawing QC (not on roadmap — never mention to customers)');
```

### Why this regex is safe
- Requires "drawing" prefix before "QC" or "quality control"
- Pitch A says "Quality control is built in" — no "drawing" prefix → no trigger
- "Drawing QC" is the specific product name Zane prohibited

### Test criteria
- "Drawing QC tool" → triggers
- "drawing quality control" → triggers
- "Quality control is built in" → does NOT trigger
- "QC process" alone → does NOT trigger

---

## 1d. Thread icpType through function signatures

### Problem
`icp-gate.ts` classifies prospects as `fiber_operator`, `ae_firm`, or `non_icp`, but this value is never passed to the composer, pattern selector, or judge. All prospects get identical prompts regardless of ICP segment. Wave 2 needs this parameter to activate ICP-aware composition.

### Changes

#### influence.ts — buildPatternSelectorPrompt (line 196)
**Old signature:**
```typescript
export function buildPatternSelectorPrompt(
  dossierSummary: string,
  aeNotes: string,
  contactTitle: string,
  touchNumber: 1 | 2 | 3,
  previousPatterns: InfluencePattern[] = []
): string {
```

**New signature:**
```typescript
export function buildPatternSelectorPrompt(
  dossierSummary: string,
  aeNotes: string,
  contactTitle: string,
  touchNumber: 1 | 2 | 3,
  previousPatterns: InfluencePattern[] = [],
  icpType?: string,
): string {
```

No changes to the function body. The parameter exists but is unused in Wave 1.

#### influence.ts — buildComposerPrompt (line 258)
**Old signature:**
```typescript
export function buildComposerPrompt(
  patternSelection: PatternSelection,
  dossierSummary: string,
  prospect: { firstName: string; lastName: string; title: string; company: string },
  aeNotes: string,
  touchNumber: 1 | 2 | 3,
  previousTouchSubject?: string,
  aeName: string = 'Tim',
  aeEmail: string = 'tim@inorsa.com',
  micrositeSlug?: string,
  keyFacts?: string,
): string {
```

**New signature:**
```typescript
export function buildComposerPrompt(
  patternSelection: PatternSelection,
  dossierSummary: string,
  prospect: { firstName: string; lastName: string; title: string; company: string },
  aeNotes: string,
  touchNumber: 1 | 2 | 3,
  previousTouchSubject?: string,
  aeName: string = 'Tim',
  aeEmail: string = 'tim@inorsa.com',
  micrositeSlug?: string,
  keyFacts?: string,
  icpType?: string,
): string {
```

No changes to the function body.

#### judge.ts — buildJudgePrompt (line 159)
**Old signature (private function):**
```typescript
function buildJudgePrompt(dossier: Dossier, touch: EmailTouch, researchContext?: string): string {
```

**New signature:**
```typescript
function buildJudgePrompt(dossier: Dossier, touch: EmailTouch, researchContext?: string, icpType?: string): string {
```

No changes to the function body.

#### judge.ts — runMechanicalChecks (line 18)
**Old signature:**
```typescript
export function runMechanicalChecks(
  body: string,
  subject: string,
  ps: string,
  aeName: string,
  aeEmail: string,
  prospectFirstName: string,
  micrositeSlug: string
): MechanicalCheckResult {
```

**New signature:**
```typescript
export function runMechanicalChecks(
  body: string,
  subject: string,
  ps: string,
  aeName: string,
  aeEmail: string,
  prospectFirstName: string,
  micrositeSlug: string,
  icpType?: string,
): MechanicalCheckResult {
```

No changes to the function body.

#### run-pipeline.ts — Pass icpType at call sites

**phasePatternSelection (~line 481):** Pass icpType to buildPatternSelectorPrompt
```typescript
// Old:
const prompt = buildPatternSelectorPrompt(enrichedSummary, '', row.title, touchNum, previousPatterns);
// New:
const prompt = buildPatternSelectorPrompt(enrichedSummary, '', row.title, touchNum, previousPatterns, icpType);
```
Where `icpType` is received as a new parameter to `phasePatternSelection`.

**phaseComposition (~line 597):** Pass icpType to buildComposerPrompt
```typescript
// Old (10 args):
const prompt = buildComposerPrompt(
  pattern as any, researchSummary,
  { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
  '', touchNum,
  i > 0 ? emails[i - 1]?.subject : undefined,
  ae.name, ae.email, micrositeSlug, keyFacts,
);
// New (11 args):
const prompt = buildComposerPrompt(
  pattern as any, researchSummary,
  { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
  '', touchNum,
  i > 0 ? emails[i - 1]?.subject : undefined,
  ae.name, ae.email, micrositeSlug, keyFacts, icpType,
);
```

**phaseJudge (~line 671):** Pass icpType to runMechanicalChecks
```typescript
// Old:
const mechanical = runMechanicalChecks(
  email.body, email.subject, email.ps,
  ae.name, ae.email,
  row.firstName, micrositeSlug,
);
// New:
const mechanical = runMechanicalChecks(
  email.body, email.subject, email.ps,
  ae.name, ae.email,
  row.firstName, micrositeSlug, icpType,
);
```

**processOneProspect (~line 1556):** Pass icpType from ICP gate result
```typescript
// Where phasePatternSelection is called:
const icpType = result.icpResult?.icpType || 'fiber_operator';
patterns = await phasePatternSelection(row, researchSummary, config.model, config.verbose, config.touches, icpType);
```

**Recompose paths (~lines 1601-1650, 1736-1790):** Pass icpType to buildComposerPrompt in both word-count recompose and judge-failure recompose.

### Call site compatibility check
| Caller | File | Currently passes icpType? | After change |
|--------|------|--------------------------|--------------|
| phasePatternSelection | run-pipeline.ts | No → add | Yes |
| phaseComposition | run-pipeline.ts | No → add | Yes |
| phaseJudge | run-pipeline.ts | No → add | Yes |
| premium-pipeline.ts | premium-pipeline.ts | No → keeps working (optional param) | Unchanged |
| lean-composer.ts | lean-composer.ts | No → keeps working (optional param) | Unchanged |
| validate-only callers | various | No → keeps working (optional param) | Unchanged |

### Test criteria
- TypeScript compiles without errors
- Pipeline on 3-company set produces byte-identical output (diff before/after)
- icpType logged at entry to phasePatternSelection, phaseComposition, phaseJudge
- premium-pipeline.ts and lean-composer.ts compile and run without changes

---

## 1e. Intel structurer fields (intel-structurer.ts)

### Problem
The intel structurer doesn't capture automation level or product fit — two signals critical for ICP-aware composition in Wave 2.

### Changes to buildStructurerPrompt

Add two fields to the JSON schema in the prompt (after `showrev_external_deadlines`):

```
    "showrev_automation_level": "manual | partial | moderate | high | unknown",
    "showrev_product_fit": "fiber_drawings | validation_suite | data_suite | multiple | unknown"
```

Add to the Rules section at the bottom:
```
- showrev_automation_level MUST be exactly one of: manual, partial, moderate, high, unknown
- showrev_product_fit MUST be exactly one of: fiber_drawings, validation_suite, data_suite, multiple, unknown
```

### Changes to validateAndClean

Add validation arrays and logic:

```typescript
const VALID_AUTOMATION_LEVELS = ['manual', 'partial', 'moderate', 'high', 'unknown'];
const VALID_PRODUCT_FIT = ['fiber_drawings', 'validation_suite', 'data_suite', 'multiple', 'unknown'];

// In validateAndClean, after the persona_classification validation:
if (company.showrev_automation_level && !VALID_AUTOMATION_LEVELS.includes(company.showrev_automation_level)) {
  warnings.push(`Invalid automation_level "${company.showrev_automation_level}", defaulting to unknown`);
  company.showrev_automation_level = 'unknown';
}

if (salesIntel.showrev_product_fit && !VALID_PRODUCT_FIT.includes(salesIntel.showrev_product_fit)) {
  warnings.push(`Invalid product_fit "${salesIntel.showrev_product_fit}", defaulting to unknown`);
  salesIntel.showrev_product_fit = 'unknown';
}
```

### Test criteria
- Run structurer on 3 existing research outputs
- New fields appear in output
- Values are from the valid enum sets
- Unknown when evidence is thin
- Existing field quality unchanged

---

## 1f. Brain competitor entities (brain-ingest.ts)

### Problem
When research output mentions a known Inorsa competitor (IQGeo, SiteTracker, etc.), the entity is classified as generic `tool`. It should be `competitor_tool` with competitive category metadata for Wave 2's competitive bridge adaptation.

### Changes

#### BrainEntity type (line 4)
**Old:**
```typescript
export interface BrainEntity {
  type: 'company' | 'funding' | 'relationship' | 'tool' | 'regulation' | 'person' | 'market_dynamic';
```

**New:**
```typescript
export interface BrainEntity {
  type: 'company' | 'funding' | 'relationship' | 'tool' | 'competitor_tool' | 'regulation' | 'person' | 'market_dynamic';
```

#### Known competitor map (add after DEFAULT_BRAIN_DIR constant, ~line 19)
```typescript
const KNOWN_COMPETITORS: Record<string, string> = {
  'iqgeo': 'system_of_record',
  'sitetracker': 'system_of_record',
  'esri': 'system_of_record',
  'biarri': 'system_of_record',
  'render networks': 'system_of_record',
  '3gis': 'system_of_record',
  'katapult': 'system_of_record',
  'sharepoint': 'document_repository',
  'osmose': 'engineering_software',
  'autodesk': 'engineering_software',
};
```

#### extractEntities tool-matching block (~line 113)
After the existing `while ((match = toolPattern.exec(...))` block, add competitor classification:

```typescript
  while ((match = toolPattern.exec(researchOutput)) !== null) {
    const toolName = match[1].trim().replace(/[.,]+$/, '');
    if (toolName.length > 2 && toolName.length < 40) {
      const toolLower = toolName.toLowerCase();
      const competitorCategory = KNOWN_COMPETITORS[toolLower];
      entities.push({
        type: competitorCategory ? 'competitor_tool' : 'tool',
        name: toolName,
        facts: [match[0].slice(0, 200)],
        sources: sources.slice(0, 2),
        firstSeen: prospectId,
        lastUpdated: now,
        metadata: competitorCategory ? { competitive_category: competitorCategory } : undefined,
      });
    }
  }
```

Also add a direct scan for competitor names that might not match the tool regex:
```typescript
  for (const [competitor, category] of Object.entries(KNOWN_COMPETITORS)) {
    const competitorRegex = new RegExp(`\\b${competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (competitorRegex.test(researchOutput)) {
      const existingKey = `competitor_tool::${competitor.replace(/[^a-z0-9]/g, '-')}`;
      if (!entities.some(e => entityKey(e) === existingKey)) {
        entities.push({
          type: 'competitor_tool',
          name: competitor.charAt(0).toUpperCase() + competitor.slice(1),
          facts: [`Competitor mention in research for ${prospectId}`],
          sources: sources.slice(0, 2),
          firstSeen: prospectId,
          lastUpdated: now,
          metadata: { competitive_category: category },
        });
      }
    }
  }
```

### Changes to generateDigest (~line 175)
Add a `competitor_tool` section:
```typescript
  const competitors = byType.get('competitor_tool') || [];
  if (competitors.length > 0) {
    digest += `## Competitor tools in use (${competitors.length})\n`;
    for (const c of competitors) {
      digest += `- ${c.name}${c.metadata?.competitive_category ? ` (${c.metadata.competitive_category})` : ''}\n`;
    }
    digest += '\n';
  }
```

### Test criteria
- Run pipeline on prospects known to use IQGeo → Brain captures `competitor_tool` entity with `system_of_record` category
- No duplicates in entity graph
- Existing `tool` entities still work for non-competitors
- Digest includes competitor section

---

## 1g. Research qualification signals (personas.ts)

### Problem
Technical Evaluator doesn't ask about GIS-to-CAD automation level or MicroStation usage — two disqualification signals from the sales playbook.

### Changes
Add 2 questions to the Technical Evaluator persona's `questions` array (after the existing 5 questions):

```typescript
'What is their GIS-to-CAD automation level? Look for evidence of existing automation tools, custom scripts, or manual workflow. If they have >50-60% automation already, the value prop declines.',
'Is this company a MicroStation shop? Check job postings and tech stack mentions for MicroStation or Bentley indicators. MicroStation is a hard disqualifier — files don\'t convert.',
```

### Risk assessment
- These questions are about the prospect's tooling, not about Inorsa's products. No tower/cellular contamination risk.
- "MicroStation" appears only as a question to the researcher about what the prospect uses, not as a product claim.

### Test criteria
- Research output mentions automation level assessment
- Research output checks for MicroStation/Bentley
- No tower/cellular language introduced in research output (verify by grepping)

---

## 1h. Enrich extractKeyFacts (run-pipeline.ts)

### Depends on: 1e (intel structurer fields must exist first)

### Problem
`extractKeyFacts()` (line 432) doesn't include competitive tools, automation level, or product fit in the facts passed to the composer.

### Changes
Add 3 conditional lines before the `return facts.join('\n')` at line 462:

```typescript
  if (company.showrev_competitive_landscape && company.showrev_competitive_landscape !== '[insufficient data]')
    facts.push(`Competitive tools: ${company.showrev_competitive_landscape}`);
  if (company.showrev_automation_level && company.showrev_automation_level !== 'unknown' && company.showrev_automation_level !== '[insufficient data]')
    facts.push(`Automation level: ${company.showrev_automation_level}`);
  if (sales.showrev_product_fit && sales.showrev_product_fit !== 'unknown' && sales.showrev_product_fit !== '[insufficient data]')
    facts.push(`Best product fit: ${sales.showrev_product_fit}`);
```

### Test criteria
- Run pipeline on 3 prospects
- keyFacts includes competitive tools when present
- `unknown` values omitted
- `[insufficient data]` values omitted

---

## 1x. Consolidate premium-pipeline.ts into run-pipeline.ts

### Problem
Two parallel pipelines create drift risk. Different call signatures (premium passes 9 args to buildComposerPrompt, run-pipeline passes 10 including keyFacts). run-pipeline.ts is the production path.

### What to audit in premium-pipeline.ts
1. **Lean-composer routing (signal strength → lean/full decision)** — run-pipeline.ts already has this in `phaseComposition` (lines 545-551). Verify logic is identical.
2. **INORSA_VP_SUMMARY block** — already in run-pipeline.ts (via llm-client.js brain cache). No merge needed.
3. **AE territory mapping** — already in run-pipeline.ts (lines 97-120). Identical.
4. **Thompson Sampling pattern selection** — in premium-pipeline.ts but not in run-pipeline.ts. This is the one feature to consider.
5. **Gap detection (acquisition/subsidiary search)** — in premium-pipeline.ts but not run-pipeline.ts. Consider merging.

### Decision
After audit, add deprecation header to premium-pipeline.ts. The lean-composer routing already exists in run-pipeline.ts. Thompson Sampling and gap detection are premium-pipeline features worth considering for future merge but NOT required for Wave 1 safety goal.

### Changes
Add deprecation header to top of premium-pipeline.ts:
```typescript
/**
 * @deprecated Use run-pipeline.ts instead. This file is retained for reference only.
 * All production pipeline work targets run-pipeline.ts.
 * Features unique to this file (Thompson Sampling, gap detection) are candidates
 * for future merge into run-pipeline.ts.
 * 
 * Deprecated: 2026-06-06 per Wave 1 implementation plan.
 */
```

Verify run-pipeline.ts `--composer=auto` routes weak signals to lean-composer correctly.

### Test criteria
- run-pipeline.ts with `--composer=auto` routes weak-signal prospects to lean-composer
- TypeScript compiles
- 3-company test produces identical output via run-pipeline.ts
- premium-pipeline.ts has deprecation header

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-06 00:00 | Claude | Initial detailed specs for all Wave 1 changes |
