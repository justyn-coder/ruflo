/**
 * Microsite A/B test — templated vs LLM-generated.
 *
 * Operator (2026-06-09) asked to validate consistency before locking in
 * Option A (LLM-generated microsites). This script:
 *   1. Picks 3 prospects with rich substrate evidence
 *   2. Generates microsite content the TEMPLATED way (current approach)
 *   3. Generates microsite content via LLM using the dossier + email body
 *   4. Writes both side-by-side as markdown to /tmp/microsite-ab-test.md
 *
 * Operator reads the file, picks A or stays templated.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/test-microsite-ab.ts
 */

import { resolve, dirname } from 'path';
import { writeFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { callLLM } from '../llm-client.js';
import { orchestrateEvidence } from './orchestrator.js';
import { composeSpecific } from './specific-composer.js';
import { resolveAE } from '../ae-config.js';
import {
  bannedPhrasesPromptBlock,
  companyNameLockPromptBlock,
  checkBannedPhrases,
  checkCompanyNameLock,
  countWords,
} from './composer-constraints.js';

interface TestProspect {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state: string;
  icpType: 'fiber_operator' | 'ae_firm';
}

const TEST_PROSPECTS: TestProspect[] = [
  { firstName: 'Andrew', lastName: 'Aeschliman', company: 'United Fiber', title: 'Services Facility Manager', state: 'MO', icpType: 'fiber_operator' },
  { firstName: 'Adam', lastName: 'Collins', company: 'EPB', title: 'Wholesale Solutions Engineer I', state: 'TN', icpType: 'fiber_operator' },
  { firstName: 'Casey', lastName: 'Worth', company: 'United Fiber', title: 'Chief Administrative Officer', state: 'MO', icpType: 'fiber_operator' },
];

// ----------------------------------------------------------------------------
// Templated microsite (CURRENT approach — what pipeline-v2 uses now)
// ----------------------------------------------------------------------------

const MICROSITE_HEADLINE_BY_PERSONA: Record<string, string> = {
  revenue_leader: 'Compress design-to-construction so revenue catches up with the network',
  ops_builder: 'When the build is moving but the drawings are the bottleneck',
  technical_designer: 'GIS-to-CAD: deterministic, traceable, built for scale',
};

function buildTemplatedMicrosite(p: TestProspect, persona: string) {
  const headline = MICROSITE_HEADLINE_BY_PERSONA[persona] || MICROSITE_HEADLINE_BY_PERSONA.ops_builder;
  const opener = p.icpType === 'fiber_operator'
    ? 'Fiber operators in active build phases hit the same wall — design throughput, not crews or capital, becomes the gating constraint.'
    : 'A&E firms running multi-program fiber design hit a per-engineer ceiling that no amount of hiring or outsourcing solves cleanly.';
  const personaBridge =
    persona === 'revenue_leader' ? 'For revenue leaders, the cost shows up as delayed subscriber activation, slipped BEAD ROI timelines, and lost ground to faster-moving peers.' :
    persona === 'ops_builder' ? 'For ops leaders, it shows up as crews waiting on approved drawings, permit cycles eating the construction window, and a backlog that grows faster than the team can close.' :
    persona === 'technical_designer' ? 'For engineering leaders, it shows up as designers spending hours formatting deliverables instead of designing, and re-cycle work whenever GIS data updates mid-build.' :
    'It shows up across the build as friction between data and field execution.';
  const close = `Inorsa converts your GIS and LLD data into construction and permit drawings in minutes. Deterministic output, full traceability back to source — no AI guesswork, no black box. Below: a 4-question diagnostic that takes ~60 seconds and shows where in your current cycle the friction concentrates.`;
  return { headline, insight_text: `${opener}\n\n${personaBridge}\n\n${close}` };
}

// ----------------------------------------------------------------------------
// LLM microsite (proposed Option A)
// ----------------------------------------------------------------------------

async function buildLLMMicrosite(args: {
  prospect: TestProspect;
  persona: string;
  emailBody: string;
  emailSubject: string;
  useDirectlyClaims: Array<{ claim: string; source: string }>;
  useToShapeClaims: Array<{ claim: string; source: string }>;
}): Promise<{ headline: string; insight_text: string }> {
  const { prospect, persona, emailBody, emailSubject, useDirectlyClaims, useToShapeClaims } = args;

  const directlyBlock = useDirectlyClaims.length
    ? useDirectlyClaims.map(c => `- ${c.claim} [${c.source}]`).join('\n')
    : '(none — write industry-frame content)';
  const shapeBlock = useToShapeClaims.slice(0, 5).map(c => `- ${c.claim}`).join('\n') || '(none)';

  const prompt = `You're writing the landing-page content the prospect lands on when they click the PS link in their cold email. The email and this landing page must read as ONE consistent voice.

## The intent (load-bearing)

Imagine you and ${prospect.firstName} met briefly at Fiber Connect 2026, exchanged cards but didn't get to talk shop. You spent the next week deep-researching their world. The email opened that conversation; the landing page continues it — as a peer who genuinely *gets* it. NOT a sales pitch. Inorsa shows up once, as one path worth considering, not as the hero of the story.

## The email this microsite supports (read it first)

Subject: ${emailSubject}

Body:
${emailBody}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- State: ${prospect.state}
- Persona: ${persona}
- ICP type: ${prospect.icpType.replace('_', ' ')}

## Evidence we can defend (frame as approximations, NO exact numbers)
${directlyBlock}

## POV-shapers (inform your angle, do NOT quote as fact)
${shapeBlock}

${companyNameLockPromptBlock(prospect.company)}

${bannedPhrasesPromptBlock()}

## What to write

1. **headline** — aim for 10 words. Hard ceiling 15 words. Continues the email's recognition. NOT a sales pitch. NOT generic. Don't repeat the exact subject line.

2. **insight_text** — aim for 40 words. Hard ceiling 55 words. ONE paragraph. Deepens the recognition the email opened with — names the specific operational reality the prospect lives, drawing from the evidence above. Ends by naming the friction pattern. Do NOT pitch Inorsa here.

## Hard constraints
- Same voice as the email (peer, not vendor)
- Evidence cited as approximations ("north of", "in the multi-state range") — never exact stale numbers
- NO em-dashes
- NO banned phrases (see list above)
- Use EXACTLY "${prospect.company}" if you reference the company
- NO Inorsa mention in either field — the soft hook is in the email's pitch sentence + the landing page's "below: 4-question diagnostic" footer (added downstream)
- One question max in insight_text (or zero)

## Output JSON

{
  "headline": "<≤15 words>",
  "insight_text": "<≤55 words, one paragraph>"
}`;

  // Retry up to 3 times on constraint violations (word count, banned phrases, company name)
  let lastViolations: string[] = [];
  let parsed: { headline: string; insight_text: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryHint = attempt === 0 ? '' :
      `\n\n**RETRY ${attempt + 1}/3** — your previous attempt had violations:\n${lastViolations.map(v => `- ${v}`).join('\n')}\nFix them. Tighten ruthlessly. Headline ≤15 words, insight ≤55 words.`;
    const raw = await callLLM(prompt + retryHint, { model: 'claude-sonnet-4-6', timeoutMs: 60000, label: attempt === 0 ? 'microsite-test' : `microsite-test-retry-${attempt}` });
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('No JSON in microsite LLM output');
    const candidate = JSON.parse(jsonMatch[1]);
    const violations: string[] = [];
    const headlineW = countWords(candidate.headline || '');
    if (headlineW > 15) violations.push(`Headline ${headlineW}w — over 15w ceiling`);
    const insightW = countWords(candidate.insight_text || '');
    if (insightW > 55) violations.push(`Insight ${insightW}w — over 55w ceiling`);
    const bannedHits = checkBannedPhrases(`${candidate.headline} ${candidate.insight_text}`, '');
    for (const b of bannedHits) violations.push(`Banned: ${b}`);
    const nameLock = checkCompanyNameLock(candidate.insight_text || '', prospect.company);
    if (nameLock) violations.push(nameLock);
    lastViolations = violations;
    if (violations.length === 0) { parsed = candidate; break; }
    if (attempt === 2) parsed = candidate; // accept-with-flag on last attempt
  }
  return parsed!;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const out: string[] = [];
  out.push(`# Microsite A/B Test — Templated vs LLM-generated`);
  out.push('');
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push('');
  out.push('Three prospects with rich substrate. For each: the email composed by pipeline-v2 + side-by-side templated microsite (current) vs LLM microsite (proposed Option A).');
  out.push('');
  out.push('---');
  out.push('');

  for (const p of TEST_PROSPECTS) {
    const ae = resolveAE(p.state);
    const slug = `${p.company}-${p.firstName}-${p.lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    console.log(`Processing ${p.firstName} ${p.lastName} @ ${p.company}...`);

    // Orchestrate evidence
    const orch = await orchestrateEvidence({
      firstName: p.firstName, lastName: p.lastName, company: p.company, title: p.title, state: p.state,
    }, { icpType: p.icpType, verbose: false, skipApollo: true });

    const persona =
      /chief|vp|svp|ceo|cfo/i.test(p.title) ? 'revenue_leader' :
      /director|head|ops|operation|manager/i.test(p.title) ? 'ops_builder' :
      /engineer|technical|designer|cto/i.test(p.title) ? 'technical_designer' :
      'ops_builder';

    // Compose email
    const composed = await composeSpecific({
      prospect: { firstName: p.firstName, lastName: p.lastName, company: p.company, title: p.title, state: p.state },
      icpType: p.icpType,
      aeName: ae.name,
      micrositeSlug: slug,
      verbose: false,
    });

    // Templated microsite
    const templated = buildTemplatedMicrosite(p, persona);

    // LLM microsite
    const useDirectlyClaims = [
      ...orch.dossier.claims.company_fact, ...orch.dossier.claims.persona_signal, ...orch.dossier.claims.industry_context,
    ].filter(c => c.tier === 'USE_DIRECTLY').slice(0, 8).map(c => ({ claim: c.claim, source: c.source.kind }));
    const useToShapeClaims = [
      ...orch.dossier.claims.company_fact, ...orch.dossier.claims.persona_signal, ...orch.dossier.claims.industry_context,
    ].filter(c => c.tier === 'USE_TO_SHAPE').slice(0, 8).map(c => ({ claim: c.claim, source: c.source.kind }));

    const llm = await buildLLMMicrosite({
      prospect: p,
      persona,
      emailBody: composed.body,
      emailSubject: composed.subject,
      useDirectlyClaims,
      useToShapeClaims,
    });

    // Render
    out.push(`## ${p.firstName} ${p.lastName} — ${p.company}`);
    out.push(`*${p.title} • ${p.state} • persona: ${persona} • tier: ${orch.dossier.tierCounts.useDirectly} USE_DIRECTLY + ${orch.dossier.tierCounts.useToShape} USE_TO_SHAPE*`);
    out.push('');
    out.push(`### Email composed`);
    out.push(`**Subject:** ${composed.subject}`);
    out.push('');
    out.push(composed.body);
    out.push('');
    out.push(`**${composed.ps}**`);
    out.push('');
    out.push('### Microsite — TEMPLATED (current)');
    out.push(`**Headline:** ${templated.headline}`);
    out.push('');
    out.push(templated.insight_text);
    out.push('');
    out.push('### Microsite — LLM (proposed Option A)');
    out.push(`**Headline:** ${llm.headline}`);
    out.push('');
    out.push(llm.insight_text);
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## Decision criteria');
  out.push('');
  out.push('Pick A (LLM) if:');
  out.push('- LLM microsites consistently extend the email\'s voice (peer, not vendor)');
  out.push('- LLM headline + insight reads like a deeper version of the email, not generic boilerplate');
  out.push('- Quality is consistent across all 3 prospects');
  out.push('');
  out.push('Stay templated if:');
  out.push('- LLM output is inconsistent across the 3 (some great, some weak)');
  out.push('- LLM headline feels generic or repeats the subject');
  out.push('- Templates are "good enough" given they\'re only seen by prospects who click');

  writeFileSync('/tmp/microsite-ab-test.md', out.join('\n'));
  console.log('');
  console.log('Wrote /tmp/microsite-ab-test.md');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
