/**
 * Microsite composer — LLM-driven Option A (operator-approved 2026-06-09).
 *
 * Produces the personalized content for the Field Brief template's
 * finding/bloom structure:
 *
 *   <p>
 *     [headline: generic persona-typed lead-in]
 *     <span class="bloom">
 *       [bloom_text: personalized middle, USE_DIRECTLY substrate, fades in on scroll]
 *     </span>
 *   </p>
 *
 * Constraints:
 *   - Same voice as the email (peer, not vendor)
 *   - Banned phrases enforced (same list as composer-constraints)
 *   - Company-name lock (Andrew/UECI bug class)
 *   - Pulled from the dossier the email composer already produced — no
 *     extra LLM round-trips for substrate retrieval
 *
 * Word targets (operator-confirmed: tight is good):
 *   - headline:   ~15 words (max 20)
 *   - bloom_text: ~20 words (max 30, since fade-in animation rewards brevity)
 *
 * The template's static `assessment` close ("The workflows powering your
 * builds weren't designed for this volume.") stays in place — that's the
 * generic third section. We don't override it.
 */

import { callLLM } from '../llm-client.js';
import {
  bannedPhrasesPromptBlock,
  companyNameLockPromptBlock,
  checkBannedPhrases,
  checkCompanyNameLock,
  countWords,
} from './composer-constraints.js';
import type { ProspectIdentity, TieredDossier } from './types.js';

export interface MicrositeComposed {
  headline: string;        // The generic persona-typed lead-in (BEFORE bloom)
  bloom_text: string;      // The personalized middle (INSIDE bloom span)
  attempts: number;
  violations_final: string[];
}

interface ComposeArgs {
  prospect: ProspectIdentity;
  persona: 'revenue_leader' | 'ops_builder' | 'technical_designer';
  icpType: 'fiber_operator' | 'ae_firm';
  dossier: TieredDossier;
  emailBody: string;       // The email body the composer just produced — for voice consistency
  emailSubject: string;
  model?: string;
  verbose?: boolean;
}

const HEADLINE_TARGET_WORDS = 15;
const HEADLINE_CEILING_WORDS = 20;
const BLOOM_TARGET_WORDS = 20;
const BLOOM_CEILING_WORDS = 30;

export async function composeMicrosite(args: ComposeArgs): Promise<MicrositeComposed> {
  const { prospect, persona, icpType, dossier, emailBody, emailSubject, model = 'claude-sonnet-4-6', verbose = false } = args;

  const useDirectlyClaims = [
    ...(dossier.claims?.company_fact || []),
    ...(dossier.claims?.persona_signal || []),
    ...(dossier.claims?.industry_context || []),
  ].filter(c => c.tier === 'USE_DIRECTLY').slice(0, 6);

  const useToShapeClaims = [
    ...(dossier.claims?.company_fact || []),
    ...(dossier.claims?.persona_signal || []),
    ...(dossier.claims?.industry_context || []),
  ].filter(c => c.tier === 'USE_TO_SHAPE').slice(0, 4);

  const directlyBlock = useDirectlyClaims.length
    ? useDirectlyClaims.map(c => `- ${c.claim} [${c.source.kind}]`).join('\n')
    : '(none — bloom text should stay industry-frame, not company-specific)';
  const shapeBlock = useToShapeClaims.length
    ? useToShapeClaims.map(c => `- ${c.claim}`).join('\n')
    : '(none)';

  const personaFrame =
    persona === 'revenue_leader' ? 'capital efficiency, time-to-revenue, subscriber activation, BEAD ROI, market capture' :
    persona === 'ops_builder' ? 'drawing throughput, permitting speed, crew utilization, build schedule pressure' :
    'GIS-to-CAD automation, data traceability, design tool integration, source accuracy';

  const prompt = `You're writing the personalized content for the landing page the prospect lands on when they click the email's PS link. This page extends the email's voice — they should read as ONE conversation from a peer who did deep research.

## The intent (load-bearing — read carefully)

Imagine you met ${prospect.firstName} briefly at Fiber Connect 2026, exchanged cards but didn't get to talk shop. You spent a week deep-researching their world. The email opened the conversation; this landing page continues it — as a peer who genuinely *gets* their operation. NOT a sales pitch. Inorsa is mentioned ZERO times in your content; the product positioning is elsewhere on the page.

## The email you're extending

Subject: ${emailSubject}

Body:
${emailBody}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- State: ${prospect.state || '(unknown)'}
- Persona: ${persona}
- Their lens (what they care about): ${personaFrame}

## Substrate evidence we can defend (cite as approximations — never exact stale numbers)
${directlyBlock}

## POV-shapers (inform angle, do NOT quote as fact)
${shapeBlock}

${companyNameLockPromptBlock(prospect.company)}

${bannedPhrasesPromptBlock()}

## What to write (two pieces)

The Field Brief template renders one paragraph in the Finding section:
\`\`\`
<p>{HEADLINE} <span class="bloom">{BLOOM_TEXT}</span></p>
<p class="assessment">The workflows powering your builds weren't designed for this volume.</p>
\`\`\`

### 1. HEADLINE — the generic persona-typed lead-in
- ~${HEADLINE_TARGET_WORDS} words. Hard ceiling: ${HEADLINE_CEILING_WORDS}.
- INDUSTRY-frame statement that frames the systemic reality. NOT prospect-specific. NOT a question. Doesn't name the prospect or their company.
- Sets up the bloom with a "this is the operational reality for operators like you" feel.

### 2. BLOOM_TEXT — the personalized middle that fades in on scroll
- ~${BLOOM_TARGET_WORDS} words. Hard ceiling: ${BLOOM_CEILING_WORDS}.
- PROSPECT-SPECIFIC. Names a real fact about ${prospect.company} drawn from the substrate above. Connects that fact to the operational friction the headline frames.
- This is the "wow, they actually researched us" moment. The fade-in animation rewards brevity + specificity.
- Use approximations ("north of", "in the multi-state range") not exact numbers.

## Output JSON

{
  "headline": "<${HEADLINE_TARGET_WORDS}±5 words industry-frame statement>",
  "bloom_text": "<${BLOOM_TARGET_WORDS}±5 words personalized middle referencing ${prospect.company}>"
}`;

  // Up to 3 attempts with violation retry
  let lastViolations: string[] = [];
  let parsed: { headline: string; bloom_text: string } | null = null;
  let attemptNum = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    attemptNum = attempt + 1;
    const retryHint = attempt === 0 ? '' :
      `\n\n**RETRY ${attempt + 1}/3** — previous attempt had violations:\n${lastViolations.map(v => `- ${v}`).join('\n')}\nFix all. Tighten ruthlessly. headline ≤${HEADLINE_CEILING_WORDS}w, bloom_text ≤${BLOOM_CEILING_WORDS}w.`;
    const raw = await callLLM(prompt + retryHint, {
      model,
      timeoutMs: 60000,
      label: attempt === 0 ? 'microsite-composer' : `microsite-composer-retry-${attempt}`,
    });
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('Microsite composer: no JSON in LLM output');
    const candidate = JSON.parse(jsonMatch[1]) as { headline: string; bloom_text: string };

    const violations: string[] = [];
    const headlineW = countWords(candidate.headline || '');
    if (headlineW > HEADLINE_CEILING_WORDS) violations.push(`headline ${headlineW}w over ${HEADLINE_CEILING_WORDS} ceiling`);
    const bloomW = countWords(candidate.bloom_text || '');
    if (bloomW > BLOOM_CEILING_WORDS) violations.push(`bloom_text ${bloomW}w over ${BLOOM_CEILING_WORDS} ceiling`);
    const bannedHits = checkBannedPhrases(`${candidate.headline} ${candidate.bloom_text}`, '');
    for (const b of bannedHits) violations.push(`Banned: ${b}`);
    const nameLockBloom = checkCompanyNameLock(candidate.bloom_text || '', prospect.company);
    if (nameLockBloom) violations.push(`bloom_text: ${nameLockBloom}`);
    // headline must NOT reference company by name (it's the generic frame)
    if (candidate.headline && candidate.headline.toLowerCase().includes(prospect.company.toLowerCase().slice(0, Math.min(8, prospect.company.length)))) {
      violations.push(`headline references company "${prospect.company}" — should be generic industry-frame, not prospect-specific`);
    }

    lastViolations = violations;
    if (verbose) console.log(`  Microsite attempt ${attempt + 1}: headline=${headlineW}w bloom=${bloomW}w violations=${violations.length}`);

    if (violations.length === 0) {
      parsed = candidate;
      break;
    }
    if (attempt === 2) parsed = candidate; // accept-with-flag on last attempt
  }

  if (!parsed) throw new Error('Microsite composer: no candidate produced');

  // Em-dash + en-dash strip — Tim flags these as AI tells; SoT §11 bans them
  // in prospect-facing copy and microsite IS prospect-facing. Composers strip
  // post-LLM; microsite must match (red-team CRITICAL #3 2026-06-09).
  const cleanHeadline = (parsed.headline || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').trim();
  const cleanBloom = (parsed.bloom_text || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').trim();

  return {
    headline: cleanHeadline,
    bloom_text: cleanBloom,
    attempts: attemptNum,
    violations_final: lastViolations,
  };
}
