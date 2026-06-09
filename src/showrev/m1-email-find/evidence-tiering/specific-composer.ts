/**
 * Specific-mode composer
 *
 * The upgrade path for prospects with rich substrate. Reads tiered evidence
 * from substrate-query.getCompanyEvidence() and composes an email that:
 *
 *   - References USE_DIRECTLY claims as APPROXIMATIONS, never verbatim
 *     numbers ("north of 1,500 miles" not "1,700 miles"). Closes the
 *     stale-data reputation-damage failure mode the critique surfaced.
 *
 *   - Uses USE_TO_SHAPE claims to inform POV but NEVER quotes them as fact.
 *     Frame implicitly: "for operators at this scale…"
 *
 *   - Emits sentence-level sources_used (`bodySentences: Array<{text,
 *     claim_ids}>`) so the operator portal can render click-sentence-see-
 *     source attribution (BL-002 fix).
 *
 *   - Falls back to generalized mode if (USE_DIRECTLY + USE_TO_SHAPE) <
 *     SPECIFIC_MODE_THRESHOLD. The threshold is configurable per the
 *     calibration-first sequencing.
 *
 * Per critique synthesis: specific mode is the UPGRADE, generalized is
 * the default. Most cold prospects will use generalized; specific kicks
 * in when substrate-query returns ≥3 usable claims.
 */

import { callLLM } from '../llm-client.js';
import type {
  ProspectIdentity,
  ComposedEmail,
  AttributedSentence,
  EvidenceRecord,
} from './types.js';
import { SPECIFIC_MODE_THRESHOLD, computeTierCounts } from './types.js';
import { getAEDetails } from '../ae-config.js';
import { getCompanyEvidence, getAssociationPriorities } from './substrate-query.js';
import { selectPSVariant } from '../influence.js';
import {
  bannedPhrasesPromptBlock,
  ctaLibraryPromptBlock,
  companyNameLockPromptBlock,
  checkBannedPhrases,
  checkCompanyNameLock,
  checkNumericAnchorRepeat,
  checkBigramRepeat,
  checkReadingAge,
  countParagraphs,
  countWords,
  countWordsTotal,
  scoreAttempt,
  selectBestAttempt,
  type ComposeAttempt,
} from './composer-constraints.js';
import {
  composeGeneralized,
  detectPersona,
  type PersonaBucket,
} from './generalized-composer.js';

// Mirror constants from generalized-composer for self-contained prompts
const PITCH_VERBATIM: Record<PersonaBucket, string> = {
  revenue_leader:
    'We convert your GIS and LLD data into construction and permit drawings in minutes, so projects get to construction faster without adding headcount.',
  ops_builder:
    'We convert your GIS and LLD data into construction and permit drawings in minutes, so your team takes on more work without adding headcount.',
  technical_designer:
    'We convert your GIS and LLD data into construction and permit drawings in minutes. Deterministic output, full traceability back to source.',
};

const PERSONA_FRAMING: Record<PersonaBucket, string> = {
  revenue_leader:
    'Executive frame. Speak to capital efficiency, time-to-revenue, competitive market capture. Subscriber activation speed. BEAD ROI. NOT drawing throughput.',
  ops_builder:
    'Operations leader frame. Speak to drawing throughput, design capacity, permitting speed, crew utilization, builds moving and documentation not being the bottleneck.',
  technical_designer:
    'Engineering leader frame. Speak to GIS-to-CAD automation, data traceability, design tool integration, workforce scaling. Accuracy and source traceability matter.',
};

/**
 * Render an EvidenceRecord into a composer-readable line.
 * USE_DIRECTLY claims display with their full claim text + source citation.
 * USE_TO_SHAPE claims display with an explicit "DO NOT QUOTE" warning so the
 * LLM treats them as POV-shapers, not facts.
 */
function renderClaimForPrompt(r: EvidenceRecord): string {
  const cite = `[${r.id}, ${r.source.kind}, ${r.source.citation.slice(0, 80)}]`;
  if (r.tier === 'USE_DIRECTLY') {
    return `USE_DIRECTLY ${cite}: ${r.claim}`;
  }
  return `USE_TO_SHAPE ${cite}: ${r.claim} ← DO NOT quote this as fact. Use only to shape your POV.`;
}

/**
 * Build the specific-mode composer prompt.
 *
 * Same scaffold as generalized but with company-specific claim sections.
 * The LLM is instructed to emit sentence-level sources_used so the portal
 * can render click-trace attribution.
 */
export function buildSpecificPrompt(args: {
  prospect: ProspectIdentity;
  icpType: 'fiber_operator' | 'ae_firm';
  persona: PersonaBucket;
  useDirectly: EvidenceRecord[];
  useToShape: EvidenceRecord[];
  associationPriorities: EvidenceRecord[];
  aeName: string;
  micrositeSlug: string;
}): string {
  const { prospect, icpType, persona, useDirectly, useToShape, associationPriorities, micrositeSlug } = args;
  const pitchVerbatim = PITCH_VERBATIM[persona];
  const personaFraming = PERSONA_FRAMING[persona];

  const directlyBlock = useDirectly.length
    ? useDirectly.map(renderClaimForPrompt).join('\n')
    : '(none — composer should rely on USE_TO_SHAPE for POV)';

  const shapeBlock = useToShape.length
    ? useToShape.map(renderClaimForPrompt).join('\n')
    : '(none)';

  const assocBlock = associationPriorities.length
    ? associationPriorities.slice(0, 3).map(renderClaimForPrompt).join('\n')
    : '(none retrieved)';

  // PS rotation per persona/touch/company hash (deterministic; spam-defense at scale)
  const psLine = selectPSVariant(persona, 1, prospect.company, micrositeSlug, args.aeName);

  return `You are a senior fiber industry Account Executive at Inorsa.

## The intent of THIS email (load-bearing — read before composing)

Imagine you and ${prospect.firstName} met briefly at Fiber Connect 2026, exchanged business cards but didn't get to talk shop. You spent the next week deep-researching their world: the pains they wake up thinking about, the gains they're chasing, the jobs-to-be-done that sit on their team's plate. Now you're following up — as a peer who genuinely *gets* it.

This is NOT a sales pitch. The email reads like one professional talking to another:
- It RECOGNIZES the prospect's reality from your deep research (you have actual evidence; use it)
- It doesn't tell them they have a problem — they already know
- It doesn't pitch Inorsa as the answer — it offers Inorsa as one path worth considering to alleviate the friction
- The hook is: "I see your world, I've thought about your angle, here's a way you might compress the friction"

Specific mode = you have substrate evidence on ${prospect.company}. Use it to SHOW you've done the research, not to flex what you know. Cite verifiable facts as approximations ("north of N locations") — never as exact numbers (stale-data risk).

Cold reader test: would a peer fiber AE think "this person actually researched my world" or "this is a vendor pitch with my company name pasted in"? Your job is the former.

## Recipient
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- State: ${prospect.state || 'unknown'}
- ICP type: ${icpType}
- Persona bucket: ${persona}

## CRITICAL RULES — specific mode with tier discipline

You have actual evidence about this company. Use it carefully.

**USE_DIRECTLY claims** — evidence we can defend. You may reference these, but:
- NEVER quote a numeric value verbatim ("1,700 miles"). Frame as approximation: "north of 1,500 miles", "around 16,000 customers", "in the multi-state range." This protects against stale data.
- DO cite the source implicitly by being specific (e.g., "your ReConnect Round 3 award" not "your USDA funding") — specificity is its own credential.
- When you reference a USE_DIRECTLY claim in a sentence, record its [id] in that sentence's claim_ids array.

**USE_TO_SHAPE claims** — defensible inference, but you cannot quote them as fact:
- Use to shape your POV ("for operators at this scale…"). NEVER assert as a claim about the company.
- claim_ids stays empty for sentences that only USE_TO_SHAPE — they're not citations, they're POV-shapers.

**Trade-association priorities** — industry-stated priorities you can ground in:
- Use as the bridge for the friction your opener implies. "Permit-throughput is the most-cited capacity bottleneck FBA members named for 2026."
- Treat as USE_TO_SHAPE (do not quote claim numbers; ground the framing).

**Things NOT to do:**
- Forced company-name shoehorning. If the opener can frame the industry pattern without naming the company, do that.
- Generic "we help companies like yours."
- AI tells (see banned list below).
- Multiple questions / compound asks.

## Evidence base

### USE_DIRECTLY (defensible — frame as approximation; cite by id in claim_ids)
${directlyBlock}

### USE_TO_SHAPE (POV-shapers — do NOT quote; claim_ids stays empty)
${shapeBlock}

### Trade-association priorities (industry context — use to bridge)
${assocBlock}

## Inorsa positioning (Chris's framing — verbatim trust line)
- Headline: "10X Your Engineering"
- Subhead: "Your fiber builds are scaling. Your engineering workflows aren't."
- Trust line (verbatim if needed): "Every output is deterministic and traceable back to source data. No AI guesswork. No black box."

## Persona framing (this prospect is ${persona})
${personaFraming}

## Email structure (HARD — HubSpot Sequence: exactly 3 body paragraphs)

PARAGRAPH 1 (opener, 1-2 sentences):
Salutation inline: "${prospect.firstName}, ...". Open with a specific signal — either:
 (a) a USE_DIRECTLY-grounded company observation framed as approximation, OR
 (b) a state/region industry pattern that USE_DIRECTLY evidence supports.
Cite [id] in claim_ids when you reference a USE_DIRECTLY claim.

(blank line)

PARAGRAPH 2 (bridge, 1 sentence):
The friction the opener implies for this persona's role. Failure-friction template — what's failing or slowing, specific to their daily work. No Inorsa mention yet.

(blank line)

PARAGRAPH 3 (CTA + pitch, 2 sentences, same paragraph):
First sentence: the diagnostic question — pick from CTA QUESTION BANK below.
Second sentence: VERBATIM pitch — "${pitchVerbatim}"

NO 4th body paragraph. The P.S. is the 4th paragraph when HubSpot assembles.

${ctaLibraryPromptBlock(icpType)}

${companyNameLockPromptBlock(prospect.company)}

${bannedPhrasesPromptBlock()}

## Hard constraints
- WORD COUNT: aim for 60-70 words. **Hard ceiling 100 words on body + P.S. combined (URL excluded). Mechanical gate REJECTS above 100.** LLM tends to undercount, so the 60-70 target is intentional padding so you naturally land under 100.
- BODY MUST BE EXACTLY 3 PARAGRAPHS separated by single blank lines.
- NO em-dashes.
- ONE question with ONE question mark.
- Inorsa mentioned EXACTLY ONCE (the verbatim pitch sentence).
- Subject: 6 words max, specific to the angle you took, first letter capitalized.

## P.S. line (verbatim — variant assigned to this prospect by persona+touch+company rotation)
${psLine}

## Output format (JSON only)
{
  "subject": "",
  "body": "",
  "ps": "${psLine.replace(/"/g, '\\"')}",
  "bodySentences": [
    {"text": "<sentence 1>", "claim_ids": ["ev_xxx", ...]},
    {"text": "<sentence 2>", "claim_ids": [...]},
    ...
  ]
}

bodySentences MUST split the body on sentence boundaries. claim_ids contains evidence ids ONLY from the USE_DIRECTLY block above (never from USE_TO_SHAPE). If a sentence doesn't reference any USE_DIRECTLY claim, claim_ids is empty.
`;
}

/**
 * Compose a specific-mode email.
 *
 * If the prospect's evidence base is below SPECIFIC_MODE_THRESHOLD, falls
 * back to generalized mode automatically. Caller doesn't need to check.
 *
 * Cost: 1 substrate-query call + 1 association-priorities call + 1 Sonnet
 * composition call. ~$0.02-0.03 per prospect.
 */
export async function composeSpecific(args: {
  prospect: ProspectIdentity;
  icpType: 'fiber_operator' | 'ae_firm';
  persona?: PersonaBucket;
  aeName: string;
  micrositeSlug: string;
  model?: string;
  verbose?: boolean;
}): Promise<ComposedEmail> {
  const { prospect, icpType, aeName, micrositeSlug, model = 'claude-sonnet-4-6', verbose = false } = args;
  const persona = args.persona || detectPersona(prospect.title);

  if (verbose) console.log(`  Specific composer: ${prospect.firstName} ${prospect.lastName} (persona=${persona}, icp=${icpType})`);

  // 1. Pull evidence from substrate-query (the unified API)
  const allEvidence = await getCompanyEvidence(prospect.company, {
    semanticContext: { state: prospect.state, icpType },
  });
  const useDirectly = allEvidence.filter(e => e.tier === 'USE_DIRECTLY');
  const useToShape = allEvidence.filter(e => e.tier === 'USE_TO_SHAPE');
  const counts = computeTierCounts(allEvidence);
  if (verbose) console.log(`  Evidence: ${counts.useDirectly} USE_DIRECTLY + ${counts.useToShape} USE_TO_SHAPE`);

  // 2. Threshold check — fall back to generalized if too thin
  const usable = counts.useDirectly + counts.useToShape;
  if (usable < SPECIFIC_MODE_THRESHOLD) {
    if (verbose) console.log(`  ${usable} usable claims < threshold ${SPECIFIC_MODE_THRESHOLD} → falling back to generalized mode`);
    return composeGeneralized({
      prospect,
      icpType,
      persona,
      aeName,
      micrositeSlug,
      model,
      verbose,
    });
  }

  // 3. Pull industry-stated priorities for the bridge
  const associationPriorities = await getAssociationPriorities({ topN: 5 });

  // 4. Compose
  // Pre-select the P.S. variant so the retry loop can count total words
  // (body + P.S. excluding URL) against the 100w ceiling.
  const psLine = selectPSVariant(persona, 1, prospect.company, micrositeSlug, aeName);
  const prompt = buildSpecificPrompt({
    prospect,
    icpType,
    persona,
    useDirectly,
    useToShape,
    associationPriorities,
    aeName,
    micrositeSlug,
  });

  // Best-of-N retry (operator-approved #5 of rule archeology 2026-06-09).
  // Early-exit on first clean attempt; otherwise pick highest-scoring.
  const attempts: ComposeAttempt[] = [];
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const retryHint = attempt === 0 ? '' :
      `\n\n**RETRY (attempt ${attempt + 1} of 4)** — your previous attempt had these violations:\n${lastViolations.map(v => `- ${v}`).join('\n')}\n\nFix ALL of them. Re-read the constraints. Body must be ≤100 words, EXACTLY 3 paragraphs, no banned phrases, exact company name "${prospect.company}".`;
    const raw = await callLLM(prompt + retryHint, {
      model,
      timeoutMs: 60000,
      label: attempt === 0 ? 'specific-composer' : `specific-composer-retry-${attempt}`,
    });
    const jsonMatch =
      raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('Specific composer: no JSON in LLM output');
    const candidate = JSON.parse(jsonMatch[1]);
    const body: string = candidate.body || '';
    const subject: string = candidate.subject || '';

    const violations: string[] = [];
    const totalWords = countWordsTotal(body, psLine);
    if (totalWords > 100) violations.push(`Total (body + P.S., URL excluded) is ${totalWords} words — over 100w ceiling`);
    const paraCount = countParagraphs(body);
    if (paraCount !== 3) violations.push(`Body has ${paraCount} paragraphs — must be exactly 3`);
    const bannedHits = checkBannedPhrases(body, subject);
    for (const b of bannedHits) violations.push(`Banned: ${b}`);
    const companyMismatch = checkCompanyNameLock(body, prospect.company);
    if (companyMismatch) violations.push(companyMismatch);
    const numericRepeat = checkNumericAnchorRepeat(body);
    if (numericRepeat) violations.push(`Recompose regression: ${numericRepeat}`);
    const bigramRepeat = checkBigramRepeat(body);
    if (bigramRepeat) violations.push(`Recompose regression: ${bigramRepeat}`);
    const readingAge = checkReadingAge(body);
    if (readingAge) violations.push(readingAge);

    lastViolations = violations;
    attempts.push({ candidate, violations, attemptNumber: attempt + 1 });
    if (verbose) console.log(`  Compose attempt ${attempt + 1}: ${totalWords}w total, ${paraCount}p, ${violations.length} violations, score=${scoreAttempt(violations)}`);

    if (violations.length === 0) break;
  }
  // Post-process helper — em-dash strip, salutation inline join, paragraph
  // normalize. Pulled into a function so we can re-run after picking a
  // different best-of-N attempt during post-compose company-name verification.
  const postProcess = (cand: any) => {
    let cb = (cand.body || '')
      .replace(/(\d)[–—](\d)/g, '$1-$2')
      .replace(/[—–]/g, ',')
      .replace(/\s+,/g, ',')
      .trim();
    cb = cb.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
    cb = cb.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
    const cs = (cand.subject || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');
    const cp = (cand.ps || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');
    return { cleanBody: cb, cleanSubject: cs, cleanPs: cp };
  };

  // Post-compose company-name verification (item 5, operator-approved
  // 2026-06-09). Mirrors generalized-composer — see that file for full
  // commentary. Re-checks final post-processed cleanBody AND cleanPs; if
  // winner violates, walks next-best attempts before flagging.
  let winner = selectBestAttempt(attempts);
  if (!winner) throw new Error('Specific composer: no attempts');

  const orderedAttempts = [...attempts].sort((a, b) => {
    const diff = scoreAttempt(b.violations) - scoreAttempt(a.violations);
    return diff !== 0 ? diff : a.attemptNumber - b.attemptNumber;
  });

  let parsed = winner.candidate;
  let { cleanBody, cleanSubject, cleanPs } = postProcess(parsed);
  let postProcessViolation = checkCompanyNameLock(cleanBody, prospect.company)
    || checkCompanyNameLock(cleanPs, prospect.company);

  if (postProcessViolation) {
    for (const cand of orderedAttempts) {
      if (cand === winner) continue;
      const pp = postProcess(cand.candidate);
      const v = checkCompanyNameLock(pp.cleanBody, prospect.company)
        || checkCompanyNameLock(pp.cleanPs, prospect.company);
      if (!v) {
        if (verbose) console.log(`  Post-compose company-name verify: winner attempt ${winner.attemptNumber} failed, swapped to attempt ${cand.attemptNumber}`);
        winner = cand;
        parsed = cand.candidate;
        cleanBody = pp.cleanBody;
        cleanSubject = pp.cleanSubject;
        cleanPs = pp.cleanPs;
        postProcessViolation = null;
        break;
      }
    }
  }

  const winnerScore = scoreAttempt(winner.violations);
  if (postProcessViolation) {
    console.warn(`  ⚠ Post-compose company-name verify FAILED for ${prospect.company} after walking all ${attempts.length} attempts: ${postProcessViolation} — flagged for review`);
  } else if (winner.violations.length > 0) {
    console.warn(`  ⚠ Best-of-N winner = attempt ${winner.attemptNumber} (score ${winnerScore}, ${winner.violations.length} violations) — flagged for review`);
  } else if (winner.attemptNumber > 1 && verbose) {
    console.log(`  Best-of-N: shipped attempt ${winner.attemptNumber} (clean)`);
  }

  const knownIds = new Set(useDirectly.map(e => e.id));
  // bodySentences post-process — validate claim_ids against the actual
  // USE_DIRECTLY set so the composer can't hallucinate citations.
  const bodySentences: AttributedSentence[] = Array.isArray(parsed.bodySentences)
    ? parsed.bodySentences.map((s: any) => {
        const validClaimIds = (Array.isArray(s.claim_ids) ? s.claim_ids : []).filter(
          (id: string) => knownIds.has(id),
        );
        return {
          text: (s.text || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').trim(),
          claim_ids: validClaimIds,
        };
      })
    : [];

  // Telemetry: count how many sentences successfully cited USE_DIRECTLY claims
  const sentencesWithCitations = bodySentences.filter(s => s.claim_ids.length > 0).length;
  if (verbose) console.log(`  Composed: ${sentencesWithCitations}/${bodySentences.length} sentences with citations`);

  return {
    subject: cleanSubject,
    body: cleanBody,
    bodySentences,
    ps: cleanPs,
    composer_mode: 'specific',
    tier_breakdown: {
      use_directly_count: counts.useDirectly,
      use_to_shape_count: counts.useToShape,
      generalized_count: 0,
    },
  };
}
