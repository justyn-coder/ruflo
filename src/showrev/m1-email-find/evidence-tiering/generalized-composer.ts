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
 *   - Body 60-80 words target, 100w ceiling
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
 * Detect persona bucket from a title — same heuristic as influence.ts.
 */
export function detectPersona(title: string): PersonaBucket {
  const t = title.toLowerCase();
  // Revenue / executive titles
  if (/\b(ceo|chief executive|cro|chief revenue|coo|chief operating|cfo|president|vp[\s-]+sales|vp[\s-]+revenue|vp[\s-]+growth|vp[\s-]+strategy|head\s+of\s+strategy)\b/.test(t)) {
    return 'revenue_leader';
  }
  // Technical / engineering titles — note: \bengineer\b does NOT match "engineering"
  // (no word boundary after "engineer" + "ing" suffix), so we use a wildcard.
  if (/\b(engineer\w*|architect|design|cad|gis|technical|technology|systems|developer|head\s+of\s+(?:engineering|technology|systems))\b/.test(t)) {
    return 'technical_designer';
  }
  // Default: ops builder
  return 'ops_builder';
}

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

  const psIndustryDataHook = `P.S. FBA data shows 40-50% of utility permits get rejected first pass. If that matches your reality, the 4-question diagnostic shows where it's most fixable: https://fiber.inorsa.com/assess/${micrositeSlug}`;

  return `You are a senior fiber industry Account Executive at Inorsa writing a cold outreach email. The recipient is someone you have NOT met. Your goal is to sound like a peer who knows the industry cold — informed, grounded, conversational. Not like a vendor pitching a product. Not like an AI.

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

${industryFraming || '[No substrate context returned — use generic industry framing from your own knowledge of fiber/A&E/BEAD dynamics]'}

## Email structure (HARD — HubSpot Sequence requires exactly 3 body paragraphs)

PARAGRAPH 1 (opener, 1-2 sentences, salutation inline):
Frame an industry-wide pattern that this persona's day-to-day would recognize. NOT company-specific. Example: "Operators running multi-state fiber programs in BEAD-active regions usually hit a permit-throughput wall around month 6 of construction." DO start with "${prospect.firstName},".

(blank line)

PARAGRAPH 2 (bridge, 1 sentence):
Name the friction that pattern implies for this persona's role. Use the failure-friction template — what's failing or slowing down, specific to their daily work, NO Inorsa mention yet.

(blank line)

PARAGRAPH 3 (CTA + pitch, 2 sentences, same paragraph):
First sentence: a diagnostic question they'd actually want to answer (yes/no/maybe). Second sentence: the verbatim pitch — "${pitchVerbatim}"

NO 4th body paragraph. The P.S. is the 4th paragraph when HubSpot assembles.

## Hard constraints
- WORD COUNT: 60-80 words target. Hard ceiling 100 words. Body only.
- NO em-dashes. Use commas or periods.
- NO AI tells: "I hope this finds you well", "I wanted to reach out", "Happy to", "Feel free to", "leverage", "synergy", "utilize", "in today's", participial-clause openers ("Looking at...", "Building on..."), "delve", "Notably", "Furthermore", "Additionally", "Moreover", "seamlessly", "robust", "comprehensive", "transformative", "revolutionize".
- NO forced personalization: do NOT name the company in the opener if the framing is industry-level. The company can appear in the question or pitch.
- One question, one question mark. No compound asks joined by "and"/"or".
- Vary sentence length. Use contractions. Start one sentence with "And" or "But" if it flows.
- Inorsa is mentioned EXACTLY ONCE — in the verbatim pitch sentence.
- Subject: 6 words or fewer, specific to the industry pattern (not the company), capitalized first letter.

## P.S. line (REQUIRED — verbatim, this is the industry_data_hook variant)
${psIndustryDataHook}

## Output format (JSON only)
{
  "subject": "",
  "body": "",
  "ps": "${psIndustryDataHook.replace(/"/g, '\\"')}",
  "bodySentences": [
    {"text": "<sentence 1 of body>", "claim_ids": []},
    {"text": "<sentence 2 of body>", "claim_ids": []},
    "..."
  ]
}

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
}): Promise<ComposedEmail> {
  const { prospect, icpType, aeName, micrositeSlug, model = 'claude-sonnet-4-6', verbose = false } = args;
  const persona = args.persona || detectPersona(prospect.title);
  const aeDetails = getAEDetails(aeName);
  const aeFirstName = aeName.split(/\s+/)[0] || aeName;

  if (verbose) console.log(`  Generalized composer: ${prospect.firstName} ${prospect.lastName} (persona=${persona}, icp=${icpType})`);

  // Phase 1: pull industry context from canonical substrate
  const industryContext = await pullIndustryContext(prospect.state, icpType, persona, 5);
  if (verbose) console.log(`  Substrate: ${industryContext.length} chunks pulled`);

  // Phase 2: compose
  const prompt = buildGeneralizedPrompt({
    prospect,
    icpType,
    persona,
    industryContext,
    aeName,
    aeFirstName,
    micrositeSlug,
  });

  const raw = await callLLM(prompt, {
    model,
    timeoutMs: 60000,
    label: 'generalized-composer',
  });

  const jsonMatch =
    raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error('Generalized composer: no JSON in LLM output');
  }

  const parsed = JSON.parse(jsonMatch[1]);

  // Post-process: em-dash cleanup, salutation inline join, paragraph normalize
  let cleanBody = (parsed.body || '')
    .replace(/(\d)[–—](\d)/g, '$1-$2')
    .replace(/[—–]/g, ',')
    .replace(/\s+,/g, ',')
    .trim();
  cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
  cleanBody = cleanBody.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');

  const cleanSubject = (parsed.subject || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');
  const cleanPs = (parsed.ps || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');

  // bodySentences post-process
  const bodySentences: AttributedSentence[] = Array.isArray(parsed.bodySentences)
    ? parsed.bodySentences.map((s: any) => ({
        text: (s.text || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').trim(),
        claim_ids: Array.isArray(s.claim_ids) ? s.claim_ids : [],
      }))
    : [];

  return {
    subject: cleanSubject,
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
