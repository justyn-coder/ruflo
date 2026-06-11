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
  checkParticipialDensity,
  checkSentenceLengthVariance,
  checkEchoedStructures,
  checkReadingAge,
  checkCitationCoverage,
  countParagraphs,
  countWords,
  countWordsTotal,
  scoreAttempt,
  selectBestAttempt,
  pickSubjectWinner,
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

You're writing the first email to ${prospect.firstName}. You spent the past week deep-researching their world: the pains they wake up thinking about, the gains they're chasing, the jobs-to-be-done that sit on their team's plate. The email reads as a peer who genuinely *gets* it.

This is NOT a sales pitch. The email reads like one professional talking to another:
- It RECOGNIZES the prospect's reality from your deep research (you have actual evidence; use it)
- It doesn't tell them they have a problem — they already know
- It doesn't pitch Inorsa as the answer — it offers Inorsa as one path worth considering to alleviate the friction
- The hook is: "I see your world, I've thought about your angle, here's a way you might compress the friction"

Specific mode = you have substrate evidence on ${prospect.company}. Use it to SHOW you've done the research, not to flex what you know. Cite verifiable facts as **neutral** approximations ("approximately N locations", "around N customers") — never as exact numbers (stale-data risk). DO NOT use directionally-biased qualifiers like "over N", "north of N", "more than N" — those imply the actual value exceeds N, and the Tier 3 hallucination judge will flag them as exaggeration whenever substrate states an exact figure.

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
- NEVER quote a numeric value verbatim ("1,700 miles"). Frame as **neutral** approximation: "approximately 1,500 miles", "around 16,000 customers", "in the multi-state range." This protects against stale data. **DO NOT use "over N", "north of N", "more than N", "in excess of N", or any directionally-upward qualifier** — those imply substrate > value and the Tier 3 hallucination judge will flag them as fabricated whenever substrate states an exact figure. Use neutral hedges only ("approximately", "around", "roughly", "in the [magnitude] range").
- DO cite the source implicitly by being specific (e.g., "your ReConnect Round 3 award" not "your USDA funding") — specificity is its own credential.
- **MANDATORY citation rule (2026-06-09)**: For EVERY sentence that includes a numeric value, a company name, an industry-specific fact, or any claim that could be verified — you MUST include the claim_id(s) of the supporting USE_DIRECTLY evidence in that sentence's claim_ids array. Sentences without supporting evidence MUST be persona-frame only (no specifics — generic operator-typed framing).
- Audit hard rule: if a sentence contains a number / a proper noun / a verifiable claim AND its claim_ids array is empty, the email will be rejected as a hallucination risk. No exceptions.

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
- Dangling demonstratives ("that growth rate", "this gap", "the pace") in the opening sentence WITHOUT establishing the antecedent in the same sentence. The reader does not see your substrate — if your opener says "that growth rate is compounding fast," the reader cannot tell what growth rate. Either name the specific thing ("three years of 35-40% growth doesn't slow itself down"), or replace the demonstrative with a description the reader can identify without seeing substrate ("the pace you've kept for three years").

## NUMBERS RULE (HARD — composer is rejected if violated)

Any number you include — mile counts, subscriber counts, density figures, percentages, dollar amounts, growth rates, dates, vintages, polling intervals, customer counts, home-pass counts, ratios — MUST appear in the USE_DIRECTLY evidence block below. If substrate does NOT contain a number for the dimension you want to discuss, do NOT invent one. Drop the dimension or describe it qualitatively without a number (e.g., "at your scale" instead of "at your 1,500 mile scale"; "the growth pace" instead of "the 35-40% growth"). Fabricated specifics are the worst failure mode in this pipeline.

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

${ctaLibraryPromptBlock(icpType, prospect.firstName, prospect.lastName, prospect.company)}

${companyNameLockPromptBlock(prospect.company)}

${bannedPhrasesPromptBlock()}

## Hard constraints
- WORD COUNT: aim for 60-70 words. **Hard ceiling 100 words on body + P.S. combined (URL excluded). Mechanical gate REJECTS above 100.** LLM tends to undercount, so the 60-70 target is intentional padding so you naturally land under 100.
- BODY MUST BE EXACTLY 3 PARAGRAPHS separated by single blank lines.
- NO em-dashes.
- ONE question with ONE question mark.
- Inorsa mentioned EXACTLY ONCE (the verbatim pitch sentence).
- Subject lines: 6 words max EACH, specific to the angle you took, first letter capitalized. Emit TWO distinct subject candidates (\`subject\` + \`subject_alt\`) — different angles on the same email, not synonyms. Both obey the banned-phrase + em-dash + 6-word rules. Judge picks the higher-scoring one; loser becomes the A/B alternate.

## P.S. line (verbatim — variant assigned to this prospect by persona+touch+company rotation)
${psLine}

## Output format (JSON only)
{
  "subject": "",
  "subject_alt": "",
  "body": "",
  "ps": "${psLine.replace(/"/g, '\\"')}",
  "bodySentences": [
    {"text": "<sentence 1>", "claim_ids": ["ev_xxx", ...]},
    {"text": "<sentence 2>", "claim_ids": [...]},
    ...
  ]
}

\`subject\` and \`subject_alt\` are TWO DIFFERENT angles on the same email — not paraphrases. Example pair: "ReConnect Round 3 throughput" + "Permit cycle at scale". Both must independently obey ALL subject constraints (≤6 words, no em-dashes, no banned phrases, exact company name "${prospect.company}" if used, first letter capitalized). The judge picks the winner; loser is preserved for portal A/B display.

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
  /**
   * 2026-06-11 Judge-feedback-loop: claim_ids the Tier 3 hallucination
   * judge previously flagged as unsupported. Filtered out of useDirectly
   * so the composer is forced to lean on its 2nd / 3rd-best evidence.
   */
  excludeClaimIds?: string[];
  /**
   * 2026-06-11 Judge-feedback-loop: free-text claims the Tier 3 judge
   * said weren't supported. Passed as a retry hint to the model so it
   * avoids the same hallucination CLASS even if the underlying claim_id
   * mapping was incomplete.
   */
  priorTier3Unsupported?: string[];
}): Promise<ComposedEmail> {
  const { prospect, icpType, aeName, micrositeSlug, model = 'claude-sonnet-4-6', verbose = false } = args;
  const persona = args.persona || detectPersona(prospect.title);
  const excludeClaimIds = new Set(args.excludeClaimIds || []);
  const priorTier3Unsupported = args.priorTier3Unsupported || [];

  if (verbose) console.log(`  Specific composer: ${prospect.firstName} ${prospect.lastName} (persona=${persona}, icp=${icpType})`);

  // 1. Pull evidence from substrate-query (the unified API)
  const allEvidence = await getCompanyEvidence(prospect.company, {
    semanticContext: { state: prospect.state, icpType },
  });
  let useDirectly = allEvidence.filter(e => e.tier === 'USE_DIRECTLY');
  const useToShape = allEvidence.filter(e => e.tier === 'USE_TO_SHAPE');

  // Judge-feedback-loop: drop claims the Tier 3 judge previously flagged
  if (excludeClaimIds.size > 0) {
    const before = useDirectly.length;
    useDirectly = useDirectly.filter(e => !excludeClaimIds.has(e.id));
    const dropped = before - useDirectly.length;
    if (verbose || dropped > 0) console.log(`  Excluded ${dropped} USE_DIRECTLY claim(s) flagged by prior Tier 3 verdict`);
  }
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
  let prompt = buildSpecificPrompt({
    prospect,
    icpType,
    persona,
    useDirectly,
    useToShape,
    associationPriorities,
    aeName,
    micrositeSlug,
  });

  // Judge-feedback-loop: prepend a forbidden-claim block when retrying after
  // a Tier 3 hallucination flag. The composer's internal best-of-N retry
  // gets a STRONG signal from the start, not just on its own retries.
  if (priorTier3Unsupported.length > 0) {
    const forbidBlock = `\n\n**PRIOR ATTEMPT REJECTED BY HALLUCINATION JUDGE.**\nThe previous email made claims our substrate evidence did not support. Do NOT make any of the following claims (or close variants):\n${priorTier3Unsupported.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n\nYou MUST pick a different substrate fact to ground this email. The flagged claims and their supporting evidence have been removed from your USE_DIRECTLY set. Rebuild the opener around a different fact.\n`;
    prompt = forbidBlock + prompt;
  }

  // Best-of-N retry (operator-approved #5 of rule archeology 2026-06-09).
  // Bumped 4 → 6 on 2026-06-10 (Fix 5 of composition 6-fix plan): the new
  // geographic-guard adds another Tier-1 violation class, so we need more
  // attempts to land a clean candidate without inflating the flag rate.
  // Early-exit on first clean attempt; otherwise pick highest-scoring.
  const attempts: ComposeAttempt[] = [];
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const retryHint = attempt === 0 ? '' :
      `\n\n**RETRY (attempt ${attempt + 1} of 6)** — your previous attempt had these violations. **Fix every single one:**\n${lastViolations.map(v => `- ${v}`).join('\n')}\n\nRe-read ALL constraints. Body must be ≤100 words, EXACTLY 3 paragraphs, no banned phrases, exact company name "${prospect.company}", NO ungrounded state/region/industry-wide claims (use company-specific facts or persona-frame).`;
    const raw = await callLLM(prompt + retryHint, {
      model,
      timeoutMs: 60000,
      label: attempt === 0 ? 'specific-composer' : `specific-composer-retry-${attempt}`,
    });
    const jsonMatch =
      raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      // No JSON found — treat as a violation, retry rather than throw. The
      // composer's own retry loop already exists; we feed this violation
      // into lastViolations so attempt N+1 sees an explicit fix-it hint.
      const violations = ['Composer output had no JSON object — wrap your response in a single ```json {...} ``` block'];
      lastViolations = violations;
      attempts.push({ candidate: null as any, violations, attemptNumber: attempt + 1 });
      if (verbose) console.log(`  Compose attempt ${attempt + 1}: no-JSON violation`);
      continue;
    }
    // Tolerant JSON parse: try strict first; on failure, normalize smart
    // quotes + strip trailing commas (common LLM artifacts) and retry once.
    // Previously a single LLM JSON glitch (e.g. position 963 on Blue Stream
    // Fiber, position 637 on ALLO in v2-mq7iex0p / v2-mq7lm7h8) threw out
    // of the for-loop entirely — composer returned no result and the
    // prospect landed as compose_failed with an unfixable JSON parse error.
    let candidate: any;
    let parseFailureReason: string | null = null;
    try {
      candidate = JSON.parse(jsonMatch[1]);
    } catch (e1) {
      const fixed = jsonMatch[1]
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,(\s*[}\]])/g, '$1');
      try {
        candidate = JSON.parse(fixed);
      } catch (e2) {
        parseFailureReason = (e1 as Error).message;
      }
    }
    if (parseFailureReason || !candidate) {
      const violations = [
        `Composer output JSON was malformed (parse error: ${parseFailureReason ?? 'unknown'}) — return STRICTLY valid JSON: no trailing commas, no smart-quote characters, escape any double-quotes inside string values with \\".`,
      ];
      lastViolations = violations;
      attempts.push({ candidate: null as any, violations, attemptNumber: attempt + 1 });
      if (verbose) console.log(`  Compose attempt ${attempt + 1}: JSON-parse violation`);
      continue;
    }
    const body: string = candidate.body || '';
    const subject: string = candidate.subject || '';
    const subjectAlt: string = candidate.subject_alt || '';

    const violations: string[] = [];
    const totalWords = countWordsTotal(body, psLine);
    if (totalWords > 100) violations.push(`Total (body + P.S., URL excluded) is ${totalWords} words — over 100w ceiling`);
    const paraCount = countParagraphs(body);
    if (paraCount !== 3) violations.push(`Body has ${paraCount} paragraphs — must be exactly 3`);
    // Mechanical checks run against BOTH subjects so a dirty alt forces a
    // retry, not a silent "judge picks the cleaner one" pass.
    const bannedHits = checkBannedPhrases(body, subject);
    for (const b of bannedHits) violations.push(`Banned: ${b}`);
    if (subjectAlt) {
      const bannedAlt = checkBannedPhrases('', subjectAlt);
      for (const b of bannedAlt) violations.push(`Banned (subject_alt): ${b}`);
      if (/[—–]/.test(subjectAlt)) violations.push('Em/en-dash in subject_alt');
      const altCompanyMismatch = checkCompanyNameLock(subjectAlt, prospect.company);
      if (altCompanyMismatch) violations.push(`subject_alt: ${altCompanyMismatch}`);
    }
    const companyMismatch = checkCompanyNameLock(body, prospect.company);
    if (companyMismatch) violations.push(companyMismatch);
    const numericRepeat = checkNumericAnchorRepeat(body);
    if (numericRepeat) violations.push(`Recompose regression: ${numericRepeat}`);
    const bigramRepeat = checkBigramRepeat(body);
    if (bigramRepeat) violations.push(`Recompose regression: ${bigramRepeat}`);
    // DL-199 AI-detection signals (PNAS 2025, Stanford 2023, VERMILLION marker 2)
    const participialDensity = checkParticipialDensity(body);
    if (participialDensity) violations.push(`AI-tell: ${participialDensity}`);
    const sentenceVariance = checkSentenceLengthVariance(body);
    if (sentenceVariance) violations.push(`AI-tell: ${sentenceVariance}`);
    const echoedStructures = checkEchoedStructures(body);
    if (echoedStructures) violations.push(`AI-tell: ${echoedStructures}`);
    // Flesch-Kincaid reading-age check (grade ceiling 12)
    const readingAge = checkReadingAge(body);
    if (readingAge) violations.push(readingAge);
    // Citation gate (2026-06-09 SPM hallucination defense): if substrate
    // had >=2 USE_DIRECTLY claims AND body has zero claim_ids → reject.
    const citationViolation = checkCitationCoverage(candidate.bodySentences, useDirectly.length);
    if (citationViolation) violations.push(citationViolation);

    lastViolations = violations;
    attempts.push({ candidate, violations, attemptNumber: attempt + 1 });
    if (verbose) console.log(`  Compose attempt ${attempt + 1}: ${totalWords}w total, ${paraCount}p, ${violations.length} violations, score=${scoreAttempt(violations)}`);

    if (violations.length === 0) break;
  }
  // Post-process helper — em-dash strip, salutation inline join, paragraph
  // normalize. Pulled into a function so we can re-run after picking a
  // different best-of-N attempt during post-compose company-name verification.
  //
  // Strip-citation-id regex (2026-06-11): the LLM occasionally leaks
  // claim_id tokens like "[ev_3544a585-..., sub-b15-...]" directly into
  // the body text instead of confining them to the bodySentences array.
  // Adam Collins / EPB Fiber Optics had this exact leak on 2026-06-11.
  // Strip ALL bracketed tokens beginning with "ev_" or "sub-".
  const STRIP_CITATION_IDS = /\s*\[(?:ev_|sub-)[^\]]*\]/g;
  const postProcess = (cand: any) => {
    let cb = (cand.body || '')
      .replace(/(\d)[–—](\d)/g, '$1-$2')
      .replace(/[—–]/g, ',')
      .replace(STRIP_CITATION_IDS, '')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .trim();
    cb = cb.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
    cb = cb.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
    const cs = (cand.subject || '').replace(/[—–]/g, ',').replace(STRIP_CITATION_IDS, '').replace(/\s+,/g, ',').trim();
    const csAlt = (cand.subject_alt || '').replace(/[—–]/g, ',').replace(STRIP_CITATION_IDS, '').replace(/\s+,/g, ',').trim();
    // P.S. PREFIX STRIP (2026-06-11): renderer always prepends "P.S." — if
    // content also starts with "P.S.", recipient sees "P.S. P.S." (visible
    // bug, caught by QA workflow). Strip a leading "P.S." (any case, optional
    // colon/space) from the content here.
    const cp = (cand.ps || '')
      .replace(/[—–]/g, ',')
      .replace(STRIP_CITATION_IDS, '')
      .replace(/\s+,/g, ',')
      .replace(/^\s*P\.?\s*S\.?\s*:?\s*/i, '')
      .trim();
    return { cleanBody: cb, cleanSubject: cs, cleanSubjectAlt: csAlt, cleanPs: cp };
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

  // Belt-and-suspenders: if even after the selectBestAttempt fix we somehow
  // still got a null candidate (all 6 attempts failed JSON parse on this
  // prospect's evidence), surface a clean error instead of crashing.
  // Pipeline will catch + flag the prospect with a useful system_brief.
  if (!winner.candidate) {
    throw new Error(
      `Specific composer: all 6 attempts failed JSON parse — likely an evidence-set the model can't structure cleanly (e.g., very long claims, embedded code blocks, unbalanced quotes). Hand-write this prospect or tune evidence pre-trim.`,
    );
  }

  let parsed = winner.candidate;
  let { cleanBody, cleanSubject, cleanSubjectAlt, cleanPs } = postProcess(parsed);
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
        cleanSubjectAlt = pp.cleanSubjectAlt;
        cleanPs = pp.cleanPs;
        postProcessViolation = null;
        break;
      }
    }
  }

  // A/B subject pick — judge the two cleaned candidates and ship the higher
  // scorer. Loser is preserved on the ComposedEmail for portal display / future
  // A/B testing.
  const ab = pickSubjectWinner(cleanSubject, cleanSubjectAlt);
  if (verbose && ab.loser !== undefined) {
    console.log(`  Subject A/B: "${ab.winner}" (${ab.winnerScore}/5) > "${ab.loser}" (${ab.loserScore}/5)`);
  }
  const finalSubject = ab.winner;
  const finalSubjectAlt = ab.loser;

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
    subject: finalSubject,
    subject_alt: finalSubjectAlt,
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
