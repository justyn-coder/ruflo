/**
 * Generalized-mode composer
 *
 * Built FIRST per critique synthesis (was Step 6, now Day 1-2).
 * Every prospect has a defensible path immediately. Specific-mode is
 * the upgrade for high-substrate prospects, not the default.
 *
 * Operator quality bar (2026-06-08): "better than top 0.01% of AEs."
 *
 * Inputs:
 *   - Prospect identity (firstName, lastName, company, title, state)
 *   - ICP type (fiber_operator | ae_firm)
 *   - generalizedFraming claims from TieredDossier (substrate-derived
 *     industry/region/peer framing — NOT company-specific)
 *
 * Output: ComposedEmail with composer_mode='generalized', bodySentences
 * for portal click-attribution (mostly empty claim_ids since these are
 * industry-context sentences).
 *
 * Constraints:
 *   - Zero company-specific factual claims (no "Company X has Y miles")
 *   - Salutation: [FirstName],
 *   - 3 body paragraphs (HubSpot Sequence)
 *   - Body 60-70 words target, 100w ceiling (operator-confirmed 2026-06-09)
 *   - P.S. uses industry_data_hook variant (FBA citation, neutral)
 *   - Pitch sentence verbatim per persona (Variant A/B/C from SoT §1)
 *   - No em-dashes, no AI tells, no forced company-name shoehorning
 *
 * Anti-fallback-tell test: a third party reading 5 specific + 5 generalized
 * emails cannot distinguish quality (only specificity).
 */

import { callLLM } from '../llm-client.js';
import type {
  ProspectIdentity,
  ComposedEmail,
  AttributedSentence,
  EvidenceRecord,
} from './types.js';
import { getAEDetails } from '../ae-config.js';
import { selectPSVariant, detectPersona } from '../influence.js';
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

/**
 * Persona buckets — mirrors `getPersonaFraming` in influence.ts.
 * Same 3 buckets, same pitch verbatim. Defined here so this module is
 * self-contained for generalized mode without coupling to specific-mode
 * influence.ts (which has 600+ lines of specific-mode framing).
 */
export type PersonaBucket = 'revenue_leader' | 'ops_builder' | 'technical_designer';

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
 * Persona detection — re-exported from influence.ts as the SINGLE source of
 * truth (operator-confirmed 2026-06-09 after red-team flagged split-brain).
 * Old simpler one-token regex deleted to avoid drift.
 *
 * The canonical detector uses two-token regex pairs (leadership word +
 * domain word) which correctly disambiguates "Director of Engineering"
 * (→ technical_designer) vs "Director of Construction" (→ ops_builder).
 */
export { detectPersona } from '../influence.js';

/**
 * Search the canonical Supabase substrate store for industry-context chunks
 * relevant to (state, ICP type, persona).
 *
 * Uses the existing `search-substrate` edge function — same retrieval path
 * as today's Phase B. Returns top-N relevant chunks.
 */
export async function pullIndustryContext(
  prospectState: string | undefined,
  icpType: 'fiber_operator' | 'ae_firm',
  persona: PersonaBucket,
  topN: number = 5,
): Promise<EvidenceRecord[]> {
  const sbUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!sbKey) return [];

  // Query mix: ICP type + persona + state. NOT prospect company name —
  // generalized mode explicitly avoids company-specific retrieval.
  const queryParts: string[] = [];
  if (icpType === 'fiber_operator') {
    queryParts.push('fiber operator construction drawing throughput');
  } else {
    queryParts.push('A&E firm fiber design drawing per engineer');
  }
  if (persona === 'revenue_leader') queryParts.push('revenue capital BEAD');
  else if (persona === 'ops_builder') queryParts.push('build schedule permit cycle crew');
  else queryParts.push('GIS CAD traceability automation');
  if (prospectState) queryParts.push(`${prospectState} BEAD broadband`);

  const query = queryParts.join('. ');

  try {
    const res = await fetch(`${sbUrl}/functions/v1/search-substrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: topN }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const rows = data.results || [];

    return rows.map((r: any, i: number): EvidenceRecord => ({
      id: `ev_substrate_${i}_${(r.id || Date.now()).toString().slice(0, 8)}`,
      claim: (r.content || '').slice(0, 500),
      source: {
        kind: 'substrate',
        citation: `${r.source}: ${r.title || 'untitled'}`,
        fetched_at: new Date(0).toISOString(), // Substrate is pre-loaded; not per-prospect fetched
      },
      tier: 'USE_TO_SHAPE',
      tierReason: 'Industry context chunk from canonical substrate store.',
      category: 'industry_context',
    }));
  } catch {
    return [];
  }
}

/**
 * Build the generalized-mode composer prompt.
 *
 * Pulls together:
 *   - Inorsa positioning (Chris's one-pager — verbatim from SoT §2)
 *   - Persona framing (revenue_leader / ops_builder / technical_designer)
 *   - Industry context (substrate chunks)
 *   - Pitch verbatim per persona
 *   - P.S. variant (industry_data_hook — FBA citation)
 *   - Hard constraints (3 paragraphs, salutation, no em-dashes, no AI tells)
 */
export function buildGeneralizedPrompt(args: {
  prospect: ProspectIdentity;
  icpType: 'fiber_operator' | 'ae_firm';
  persona: PersonaBucket;
  industryContext: EvidenceRecord[];
  aeName: string;
  aeFirstName: string;
  micrositeSlug: string;
}): string {
  const { prospect, icpType, persona, industryContext, aeName, micrositeSlug } = args;
  const pitchVerbatim = PITCH_VERBATIM[persona];
  const personaFraming = PERSONA_FRAMING[persona];

  const industryFraming = industryContext
    .slice(0, 5)
    .map((e, i) => `[CTX-${i + 1}] (${e.source.citation}):\n${e.claim.slice(0, 400)}`)
    .join('\n\n');

  // PS rotation per persona/touch/company hash (deterministic; spam-defense
  // at scale per operator 2026-06-09 — sending the same PS to 100 prospects
  // is a spam signal).
  const psLine = selectPSVariant(persona, 1, prospect.company, micrositeSlug, aeName);

  return `You are a senior fiber industry Account Executive at Inorsa.

## The intent of THIS email (load-bearing — read before composing)

You're writing the first email to ${prospect.firstName}. You spent the past week deep-researching their world: the pains they wake up thinking about, the gains they're chasing, the jobs-to-be-done that sit on their team's plate. The email reads as a peer who genuinely *gets* it.

This is NOT a sales pitch. The email reads like one professional talking to another:
- It RECOGNIZES the prospect's reality (a pain, a gain, or a job-to-be-done specific to ${prospect.title} at a ${icpType.replace('_', ' ')})
- It doesn't tell them they have a problem — they already know
- It doesn't pitch Inorsa as the answer — it offers Inorsa as one path worth considering
- The hook is: "I see your world, I've thought about it from your angle, here's a way you might compress the friction"

The opener earns the read because you sound like you've done the homework. The close is a soft hook ("worth a look?"), not a hard ask. Inorsa is named once, as the proposed alleviation — not as the hero of the story.

Cold reader test: if a peer fiber AE read this email, would they think "this person gets my world" or "this is a vendor pitch"? Your job is the former.

## Recipient
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- State: ${prospect.state || 'unknown'}
- ICP type: ${icpType}
- Persona bucket: ${persona}

## CRITICAL RULE — generalized mode

This is a GENERALIZED email. You do NOT have any company-specific facts you trust enough to assert.
- DO NOT make any claim about ${prospect.company} that you cannot directly cite from the industry context below.
- DO NOT shoehorn the company name into the opener trying to fake personalization. A cold reader can tell.
- DO frame around the INDUSTRY pattern, then close to the persona's day-to-day reality.
- The email reads like an informed observation about the industry, with a question that invites a yes/no/maybe response.

## Inorsa positioning (Chris's framing — verbatim trust line)
- Headline: "10X Your Engineering"
- Subhead: "Your fiber builds are scaling. Your engineering workflows aren't."
- The problem: Fiber teams are under pressure to build faster with leaner teams. Workflows that worked at 50 miles break at 250. Engineers spend hours on manual drawing production from GIS and LLD inputs. Outsourcing adds risk; hiring doesn't solve the underlying problem.
- The solution: Inorsa automates construction and permit drawing generation directly from GIS and LLD inputs. Deterministic output, traceable to source.
- Trust line (verbatim if needed): "Every output is deterministic and traceable back to source data. No AI guesswork. No black box."

## Persona framing (this prospect is ${persona})
${personaFraming}

## Industry context — pulled from canonical substrate (Community Broadband Bits, Dawson Pots-and-Pans, Fiber for Breakfast, Cartesian cost report, NTIA BEAD)
Use these chunks to inform the opener. Pull a real industry pattern. Do NOT cite the source by name in the email — these are background for YOUR understanding, not for the prospect.

${industryFraming || '[No substrate context returned. Open with PERSONA-LEVEL framing only — describe what teams in this prospect\'s role typically wrestle with, qualitatively. Do NOT introduce specific numbers, density figures, percentages, growth rates, mile counts, or industry-wide statistics from your training data. Do NOT make company-specific claims (e.g., NOT "at {company}\'s pace", NOT "for operators running networks at {company}\'s scale"). Stay at the qualitative job-level (e.g., "teams in your seat usually wrestle with X", not "{company}\'s X is Y").]'}

## Email structure (HARD — HubSpot Sequence requires exactly 3 body paragraphs)

PARAGRAPH 1 (opener, 1-2 sentences, salutation inline):
Frame an industry-wide pattern that this persona's day-to-day would recognize. NOT company-specific. Example: "Operators running multi-state fiber programs in BEAD-active regions usually hit a permit-throughput wall around month 6 of construction." DO start with "${prospect.firstName},". DO NOT open with a dangling demonstrative ("that growth rate", "this gap", "the pace") — the reader does not see your substrate, so they cannot tell what "that" refers to. Either name the specific thing in the same sentence or use a description the reader can identify without seeing substrate.

(blank line)

PARAGRAPH 2 (bridge, 1 sentence):
Name the friction that pattern implies for this persona's role. Use the failure-friction template — what's failing or slowing down, specific to their daily work, NO Inorsa mention yet.

(blank line)

PARAGRAPH 3 (CTA + pitch, 2 sentences, same paragraph):
First sentence: the diagnostic question — pick from CTA QUESTION BANK below. Second sentence: the verbatim pitch — "${pitchVerbatim}"

NO 4th body paragraph. The P.S. is the 4th paragraph when HubSpot assembles.

## NUMBERS RULE (HARD — composer is rejected if violated)

Any number you include — mile counts, subscriber counts, density figures, percentages, dollar amounts, growth rates, dates, vintages, polling intervals, customer counts, home-pass counts, ratios — MUST appear in the industry-context substrate above OR in a verified-stat citation. If substrate does NOT contain a number for the dimension you want to discuss, do NOT invent one. Drop the dimension or describe it qualitatively without a number (e.g., "at your scale" instead of "at your 1,500 mile scale"; "the growth pace" instead of "the 35-40% growth"). Do NOT make company-specific assertions when industry substrate is thin (e.g., NOT "at {company}'s pace", NOT "for operators running networks at {company}'s scale"). Fabricated specifics are the worst failure mode in this pipeline.

${ctaLibraryPromptBlock(icpType, prospect.firstName, prospect.lastName, prospect.company)}

${companyNameLockPromptBlock(prospect.company)}

${bannedPhrasesPromptBlock()}

## Hard constraints
- WORD COUNT: aim for 60-70 words. **Hard ceiling 100 words on body + P.S. combined (URL excluded). Mechanical gate REJECTS above 100.** LLM tends to undercount, so the 60-70 target is intentional padding so you naturally land under 100.
- BODY MUST BE EXACTLY 3 PARAGRAPHS separated by single blank lines. HubSpot Sequence breaks if paragraph count drifts.
- NO em-dashes. Use commas or periods.
- NO forced personalization: do NOT name the company in the opener if the framing is industry-level. The company can appear in the question or pitch.
- One question, one question mark. No compound asks joined by "and"/"or".
- Vary sentence length. Use contractions. Start one sentence with "And" or "But" if it flows.
- Inorsa is mentioned EXACTLY ONCE — in the verbatim pitch sentence.
- Subject lines: 6 words or fewer EACH, specific to the industry pattern (not the company), capitalized first letter. Emit TWO distinct subject candidates (\`subject\` + \`subject_alt\`) — different angles, not synonyms. Both obey the banned-phrase + em-dash + 6-word rules. Judge will pick the higher-scoring one as the shipped subject; loser becomes the A/B alternate.

## P.S. line (REQUIRED — verbatim, this is the variant assigned to this prospect by persona+touch+company rotation)
${psLine}

## Output format (JSON only)
{
  "subject": "",
  "subject_alt": "",
  "body": "",
  "ps": "${psLine.replace(/"/g, '\\"')}",
  "bodySentences": [
    {"text": "<sentence 1 of body>", "claim_ids": []},
    {"text": "<sentence 2 of body>", "claim_ids": []},
    "..."
  ]
}

\`subject\` and \`subject_alt\` are TWO DIFFERENT angles on the same email — not paraphrases of each other. Example pair: "Permit throughput at scale" + "Documentation as bottleneck". Both must independently obey ALL subject constraints (≤6 words, no em-dashes, no banned phrases, first letter capitalized). The judge picks the winner; the loser is preserved for portal A/B display.

bodySentences MUST split the body on sentence boundaries. claim_ids stays empty in generalized mode (no company-specific claims). The portal renders bodySentences for sentence-level review.
`;
}

/**
 * Compose a generalized email for the prospect.
 *
 * This is the FIRST-priority composer per critique synthesis: every prospect
 * has a defensible path here immediately, regardless of substrate richness.
 */
export async function composeGeneralized(args: {
  prospect: ProspectIdentity;
  icpType: 'fiber_operator' | 'ae_firm';
  persona?: PersonaBucket;
  aeName: string;
  micrositeSlug: string;
  model?: string;
  verbose?: boolean;
  /** 2026-06-11 Judge-feedback-loop — see specific-composer for shape. */
  excludeClaimIds?: string[];
  /** 2026-06-11 Judge-feedback-loop — see specific-composer for shape. */
  priorTier3Unsupported?: string[];
}): Promise<ComposedEmail> {
  const { prospect, icpType, aeName, micrositeSlug, model = 'claude-sonnet-4-6', verbose = false } = args;
  const persona = args.persona || detectPersona(prospect.title);
  const aeDetails = getAEDetails(aeName);
  const aeFirstName = aeName.split(/\s+/)[0] || aeName;
  const excludeClaimIds = new Set(args.excludeClaimIds || []);
  const priorTier3Unsupported = args.priorTier3Unsupported || [];

  if (verbose) console.log(`  Generalized composer: ${prospect.firstName} ${prospect.lastName} (persona=${persona}, icp=${icpType})`);

  // Phase 1: pull industry context from canonical substrate
  let industryContext = await pullIndustryContext(prospect.state, icpType, persona, 5);
  if (verbose) console.log(`  Substrate: ${industryContext.length} chunks pulled`);

  // Judge-feedback-loop: drop chunks the Tier 3 judge previously flagged.
  // Generalized context items have IDs from pullIndustryContext (sub-xxx).
  if (excludeClaimIds.size > 0) {
    const before = industryContext.length;
    industryContext = industryContext.filter((c) => !excludeClaimIds.has((c as { id?: string }).id ?? ''));
    const dropped = before - industryContext.length;
    if (verbose || dropped > 0) console.log(`  Excluded ${dropped} industry chunk(s) flagged by prior Tier 3 verdict`);
  }

  // Phase 2: compose
  // Pre-select the P.S. variant so the retry loop can count total words
  // (body + P.S. excluding URL) against the 100w ceiling.
  const psLine = selectPSVariant(persona, 1, prospect.company, micrositeSlug, aeName);
  let prompt = buildGeneralizedPrompt({
    prospect,
    icpType,
    persona,
    industryContext,
    aeName,
    aeFirstName,
    micrositeSlug,
  });

  // Judge-feedback-loop: forbidden-claim block (mirror of specific-composer).
  if (priorTier3Unsupported.length > 0) {
    const forbidBlock = `\n\n**PRIOR ATTEMPT REJECTED BY HALLUCINATION JUDGE.**\nThe previous email made claims our substrate evidence did not support. Do NOT make any of the following claims (or close variants):\n${priorTier3Unsupported.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n\nYou MUST pick a different industry pattern to ground this email. Lean on persona-frame if needed.\n`;
    prompt = forbidBlock + prompt;
  }

  // Compose with up to 5 retries + best-of-N selection (per operator
  // 2026-06-09 #5, bumped 4 → 6 on 2026-06-10 Fix 5 of composition 6-fix plan
  // alongside the new geographic-guard Tier-1 violation class).
  // LLM retries are non-monotonic — tracking attempts and picking the
  // highest-scoring one beats shipping the last attempt.
  // Early-exit on first clean attempt; otherwise pick best of all attempts.
  const attempts: ComposeAttempt[] = [];
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const retryHint = attempt === 0 ? '' :
      `\n\n**RETRY (attempt ${attempt + 1} of 6)** — your previous attempt had these violations. **Fix every single one:**\n${lastViolations.map(v => `- ${v}`).join('\n')}\n\nRe-read ALL constraints. Body must be ≤100 words, EXACTLY 3 paragraphs, no banned phrases, exact company name "${prospect.company}", NO ungrounded state/region/industry-wide claims (use company-specific facts or persona-frame).`;
    const raw = await callLLM(prompt + retryHint, {
      model,
      timeoutMs: 60000,
      label: attempt === 0 ? 'generalized-composer' : `generalized-composer-retry-${attempt}`,
    });
    const jsonMatch =
      raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('Generalized composer: no JSON in LLM output');
    const candidate = JSON.parse(jsonMatch[1]);
    const body: string = candidate.body || '';
    const subject: string = candidate.subject || '';
    const subjectAlt: string = candidate.subject_alt || '';

    const violations: string[] = [];
    const totalWords = countWordsTotal(body, psLine);
    if (totalWords > 100) violations.push(`Total (body + P.S., URL excluded) is ${totalWords} words — over 100w ceiling`);
    const paraCount = countParagraphs(body);
    if (paraCount !== 3) violations.push(`Body has ${paraCount} paragraphs — must be exactly 3`);
    // Mechanical checks run against BOTH subjects so a dirty alt forces a
    // retry, not just a "judge picks the cleaner one" silent pass.
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
    // Citation gate (generalized mode uses industryContext = USE_TO_SHAPE
    // by design — no USE_DIRECTLY claims to demand cites from). The check
    // is a no-op when useDirectlyClaimCount < 2, so we pass 0 here as
    // documentation but it never fires for generalized mode.
    const citationViolation = checkCitationCoverage(candidate.bodySentences, 0);
    if (citationViolation) violations.push(citationViolation);

    lastViolations = violations;
    attempts.push({ candidate, violations, attemptNumber: attempt + 1 });
    if (verbose) console.log(`  Compose attempt ${attempt + 1}: ${totalWords}w total, ${paraCount}p, ${violations.length} violations, score=${scoreAttempt(violations)}`);

    if (violations.length === 0) break; // clean → ship
  }
  // Post-process helper — em-dash strip, salutation inline join, paragraph
  // normalize. Pulled into a function so we can re-run after picking a
  // different best-of-N attempt during post-compose company-name verification.
  //
  // Strip-citation-id regex (2026-06-11): mirror of specific-composer fix.
  // LLM occasionally leaks claim_id tokens like "[ev_xxx, sub-xxx]" into
  // body/subject/ps. claim_ids belong in bodySentences array only.
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
    const cp = (cand.ps || '').replace(/[—–]/g, ',').replace(STRIP_CITATION_IDS, '').replace(/\s+,/g, ',');
    return { cleanBody: cb, cleanSubject: cs, cleanSubjectAlt: csAlt, cleanPs: cp };
  };

  // Post-compose company-name verification (item 5, operator-approved
  // 2026-06-09). The Andrew/UECI bug class: LLM substituted parent-co name
  // into the body despite the lock instruction. Pre-check only ran on raw
  // LLM body; em-dash strip / salutation join could re-introduce drift, and
  // we never checked the P.S. line. Now we re-verify against final
  // post-processed body AND P.S., and if the winner still violates, try
  // next-best attempt before flagging.
  let winner = selectBestAttempt(attempts);
  if (!winner) throw new Error('Generalized composer: no attempts');

  // Order attempts by score so we can walk best-first if winner fails
  // post-process verification. Stable sort tiebreaker = earliest attempt.
  const orderedAttempts = [...attempts].sort((a, b) => {
    const diff = scoreAttempt(b.violations) - scoreAttempt(a.violations);
    return diff !== 0 ? diff : a.attemptNumber - b.attemptNumber;
  });

  // Same null-candidate guard as specific-composer (2026-06-11 Gilliland class).
  if (!winner.candidate) {
    throw new Error(
      `Generalized composer: all 6 attempts failed JSON parse — likely an evidence/prompt the model can't structure cleanly. Hand-write this prospect or investigate the failure mode.`,
    );
  }
  let parsed = winner.candidate;
  let { cleanBody, cleanSubject, cleanSubjectAlt, cleanPs } = postProcess(parsed);
  let postProcessViolation = checkCompanyNameLock(cleanBody, prospect.company)
    || checkCompanyNameLock(cleanPs, prospect.company);

  if (postProcessViolation) {
    // Walk next-best attempts. Skip current winner.
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
  // A/B testing. If subject_alt is missing or empty, falls back to single-subject
  // behaviour (subject_alt undefined).
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

  // bodySentences post-process
  const bodySentences: AttributedSentence[] = Array.isArray(parsed.bodySentences)
    ? parsed.bodySentences.map((s: any) => ({
        text: (s.text || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').trim(),
        claim_ids: Array.isArray(s.claim_ids) ? s.claim_ids : [],
      }))
    : [];

  return {
    subject: finalSubject,
    subject_alt: finalSubjectAlt,
    body: cleanBody,
    bodySentences,
    ps: cleanPs,
    composer_mode: 'generalized',
    tier_breakdown: {
      use_directly_count: 0,
      use_to_shape_count: 0,
      generalized_count: industryContext.length,
    },
  };
}
