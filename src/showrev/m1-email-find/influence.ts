export type InfluencePattern =
  | 'challenger_insight'
  | 'commitment_consistency'
  | 'competitive_displacement'
  | 'curiosity_gap'
  | 'loss_aversion'
  | 'social_proof'
  | 'reframe_anchor'
  | 'reciprocity';

export interface PatternSelection {
  pattern: InfluencePattern;
  rationale: string;
  emotionalFrame: 'loss' | 'gain' | 'curiosity' | 'urgency' | 'authority' | 'belonging';
  challengerInsight: string;
  psStrategy: string;
  ctaType: 'interest_based' | 'soft_time' | 'binary_close';
}

export interface InfluenceToolkit {
  patterns: Record<InfluencePattern, PatternDefinition>;
  signalMap: SignalToPattern[];
}

export interface PatternDefinition {
  name: string;
  description: string;
  whenToUse: string;
  emailStructure: string;
  exampleOpener: string;
  psTemplate: string;
}

export interface SignalToPattern {
  signal: string;
  pattern: InfluencePattern;
  reason: string;
}

export type PersonaBucket = 'revenue_leader' | 'ops_builder' | 'technical_designer';

const PERSONA_TITLE_PATTERNS: Array<{ bucket: PersonaBucket; patterns: RegExp[] }> = [
  {
    bucket: 'revenue_leader',
    patterns: [
      /\b(ceo|president|managing\s+partner|cfo|controller|chief\s+financial|chief\s+executive|chief\s+revenue|cro|vp\s+finance|evp\s+operations|evp|svp|chief\s+operating|coo)\b/i,
      /\b(general\s+manager|owner|founder|principal)\b/i,
    ],
  },
  {
    bucket: 'ops_builder',
    patterns: [
      /\b(vp|vice\s+president|director|manager|head|lead|superintendent)\b.*\b(construction|deployment|outside\s+plant|osp|network\s+deployment|field\s+operations|project\s+management|operations|build|program)\b/i,
      /\b(construction|deployment|outside\s+plant|osp|network\s+deployment|field\s+operations|project\s+management|operations|build|program)\b.*\b(vp|vice\s+president|director|manager|head|lead|superintendent)\b/i,
      /\bproject\s+manager\b/i,
      /\boperations\s+manager\b/i,
    ],
  },
  {
    bucket: 'technical_designer',
    patterns: [
      /\b(vp|vice\s+president|director|manager|head|lead)\b.*\b(engineering|network|it|gis|design|permitting|technical)\b/i,
      /\b(engineering|network|it|gis|design|permitting|technical)\b.*\b(vp|vice\s+president|director|manager|head|lead)\b/i,
      /\b(gis\s+(manager|analyst|specialist)|network\s+engineer|design\s+engineer|osp\s+engineer)\b/i,
      /\b(cto|chief\s+technology|chief\s+technical)\b/i,
    ],
  },
];

export function detectPersona(title: string): PersonaBucket {
  for (const { bucket, patterns } of PERSONA_TITLE_PATTERNS) {
    for (const re of patterns) {
      if (re.test(title)) return bucket;
    }
  }
  return 'ops_builder';
}

interface PersonaFraming {
  bucket: PersonaBucket;
  pitchVariant: string;
  pitchVerbatim: string;
  framingInstructions: string;
  valueLens: string;
}

function getPersonaFraming(title: string): PersonaFraming {
  const bucket = detectPersona(title);

  const framings: Record<PersonaBucket, Omit<PersonaFraming, 'bucket'>> = {
    revenue_leader: {
      pitchVariant: 'C',
      pitchVerbatim: 'Fiber activations measured in days. Inorsa automates drawing generation from your GIS and LLD inputs so your team scales output at constant headcount.',
      framingInstructions: 'This is an executive. Frame EVERYTHING around capital efficiency, time-to-revenue, and competitive market capture. They care about how fast fiber lights up and what that means for subscriber activation and BEAD ROI. Do NOT talk about drawings, GIS layers, or technical process. Talk about SPEED TO REVENUE and SCALE WITHOUT HEADCOUNT.',
      valueLens: 'revenue timing, BEAD investment yield, subscriber activation speed, competitive market capture, capital efficiency',
    },
    ops_builder: {
      pitchVariant: 'A',
      pitchVerbatim: 'We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving.',
      framingInstructions: 'This is an operations/construction leader. Frame around drawing throughput, design capacity, permitting speed, and crew utilization. They feel the pain of delayed drawings holding up construction crews. Talk about BUILDS MOVING and DOCUMENTATION NOT BEING THE BOTTLENECK.',
      valueLens: 'drawing throughput, design capacity, permitting speed, crew utilization, build schedule adherence',
    },
    technical_designer: {
      pitchVariant: 'B',
      pitchVerbatim: 'Inorsa structures your GIS and LLD inputs into asset-level data, then generates construction and permit drawings with full traceability back to source. No manual extraction, no AI guesswork.',
      framingInstructions: 'This is an engineering/technical leader. Frame around GIS-to-CAD automation, data traceability, design tool integration, and workforce scaling. They care about accuracy, source traceability, and not losing data in translation. Talk about STRUCTURED DATA and TRACEABILITY.',
      valueLens: 'GIS-to-CAD automation, data traceability, design tool integration, workforce scaling without quality loss',
    },
  };

  return { bucket, ...framings[bucket] };
}

export const INFLUENCE_TOOLKIT: InfluenceToolkit = {
  patterns: {
    challenger_insight: {
      name: 'Challenger Insight',
      description: 'Teach the prospect something they didn\'t know about their own situation. Reframe their understanding before presenting the solution.',
      whenToUse: 'C-suite executives, sophisticated buyers, situations where the prospect thinks they understand their problem but may not see the full picture.',
      emailStructure: 'Lead with the insight (not the product). Let the prospect connect the dots to their own situation. Ask a question that tests whether the insight resonates.',
      exampleOpener: 'Most multi-state fiber builders don\'t realize their per-drawing cost varies 3x between states because of permit inconsistency.',
      psTemplate: 'P.S. I pulled [specific data point about their company/market]. Happy to share the full picture if useful.',
    },
    commitment_consistency: {
      name: 'Commitment / Consistency',
      description: 'Reference something the prospect already said or did (booth visit, demo request, stated interest) and hold them to that micro-commitment.',
      whenToUse: 'When AE notes capture a specific request, statement, or expressed interest from the booth conversation.',
      emailStructure: 'Open with what THEY said/did. Restate their own words. Make it easy to follow through on what they already committed to.',
      exampleOpener: 'You asked about the fiber drawing demo at the booth. I have it ready.',
      psTemplate: 'P.S. You also mentioned [second thing from booth notes]. Want me to cover that in the demo too?',
    },
    competitive_displacement: {
      name: 'Competitive Displacement',
      description: 'The prospect mentioned or is known to use a competing tool. Frame the conversation around the gap between what they have and what they need.',
      whenToUse: 'When research or AE notes reveal a competitor (Nvidia tool, Hexagon, manual process, outsourced design firm).',
      emailStructure: 'Acknowledge what they\'re using without trashing it. Name the specific gap. Position Inorsa as addressing that gap, not replacing everything.',
      exampleOpener: 'You mentioned an Nvidia-based tool that looked similar to what we do. It\'s actually solving a different problem.',
      psTemplate: 'P.S. If you\'re comparing tools, I can send a one-page breakdown of where we differ from [competitor]. No spin, just capabilities.',
    },
    curiosity_gap: {
      name: 'Curiosity Gap',
      description: 'Lead with incomplete information that compels the prospect to respond to learn more. Use when you have thin booth notes but strong research.',
      whenToUse: 'No AE booth notes. Prospect is a "silent visitor" — they showed up but we don\'t know what they\'re thinking.',
      emailStructure: 'Lead with a provocative finding from research. Don\'t fully explain it. Ask a question that requires them to engage to get the answer.',
      exampleOpener: 'I was looking at [Company]\'s BEAD application. One thing jumped out that your engineering team might want to know about.',
      psTemplate: 'P.S. Not trying to be mysterious — just easier to show than explain in an email.',
    },
    loss_aversion: {
      name: 'Loss Aversion',
      description: 'Frame the cost of inaction, not the benefit of action. People are 2x more motivated to avoid losses than achieve gains.',
      whenToUse: 'When there\'s a real external deadline (BEAD construction milestones, funding tranches, competitive market moves) and delay has consequences.',
      emailStructure: 'Name the deadline. Name what happens if they miss it. Position the solution as risk mitigation, not improvement.',
      exampleOpener: 'BEAD construction deadlines start Q4. Every week of manual drafting while your competitors automate is a week you fall behind.',
      psTemplate: 'P.S. [Competitor or peer company] just automated their design pipeline. Not saying that should drive your decision — just context.',
    },
    social_proof: {
      name: 'Social Proof',
      description: 'Reference similar companies, peer firms, or industry trends to normalize the buying decision.',
      whenToUse: 'When the prospect is in a peer-dense industry (fiber ISPs, A&E firms, contractors) and would respond to "others like you are doing this."',
      emailStructure: 'Name the peer group (not specific competitors unless public). Describe the pattern. Ask if they\'re seeing the same dynamic.',
      exampleOpener: 'Three fiber contractors your size in the Southeast automated their construction drawings this quarter.',
      psTemplate: 'P.S. I can share a 2-minute case study from a firm doing similar volume to yours. No names, just numbers.',
    },
    reframe_anchor: {
      name: 'Reframe the Anchor',
      description: 'The prospect has a prior objection or outdated mental model. Change the frame — their old decision was rational THEN, but circumstances have changed.',
      whenToUse: 'Prior relationship where price, timing, or fit was the objection. Company has since grown, acquired, or received new funding.',
      emailStructure: 'Acknowledge the history. Name what changed. Rerun the math with new variables. Ask if a re-evaluation makes sense.',
      exampleOpener: 'I know pricing was the sticking point last time. But your volume has changed since the merger.',
      psTemplate: 'P.S. We\'ve also adjusted our pricing model since we last talked. Might be worth a fresh look for that reason alone.',
    },
    reciprocity: {
      name: 'Reciprocity',
      description: 'Give something valuable before asking for anything. A useful insight, a data point, a connection. The prospect feels compelled to reciprocate.',
      whenToUse: 'When research uncovered something genuinely useful to the prospect regardless of whether they buy. Works especially well with technical buyers.',
      emailStructure: 'Lead with the gift (insight, data, connection). No strings attached. The ask comes naturally — "happy to share more."',
      exampleOpener: 'I was researching your market and found something your engineering team might find useful — [specific data point].',
      psTemplate: 'P.S. This is from public data — happy to share my full notes if your team would find them useful.',
    },
  },

  signalMap: [
    { signal: 'AE notes mention competitor or existing tool', pattern: 'competitive_displacement', reason: 'They\'re already comparing — accelerate the frame' },
    { signal: 'AE notes say "asked for demo" or "wants to see"', pattern: 'commitment_consistency', reason: 'They made a micro-commitment at the booth' },
    { signal: 'No AE booth notes, thin research', pattern: 'curiosity_gap', reason: 'Nothing personal to reference — lead with a provocative insight' },
    { signal: 'C-suite executive (CEO, CTO, VP)', pattern: 'challenger_insight', reason: 'Execs respond to insights, not features' },
    { signal: 'Prior relationship, old objection', pattern: 'reframe_anchor', reason: 'Changed circumstances invalidate old decisions' },
    { signal: 'BEAD funding recipient with construction deadlines', pattern: 'loss_aversion', reason: 'External deadline creates natural urgency' },
    { signal: 'Multiple contacts from same company on list', pattern: 'social_proof', reason: 'Multiple attendees = organizational interest, not just individual' },
    { signal: 'Research uncovered data prospect probably doesn\'t know', pattern: 'reciprocity', reason: 'Give before you ask — builds trust with technical buyers' },
    { signal: 'Company recently acquired or merged', pattern: 'reframe_anchor', reason: 'Scale changed, economics changed, old decisions may not hold' },
    { signal: 'Small company, cautious buyer, "exploring"', pattern: 'curiosity_gap', reason: 'Low-pressure approach for education-stage buyers' },
  ],
};

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
    'What does your drawing throughput look like per engineer per week, and where does it stall?',
    'How much of your project margin gets consumed by CD revision cycles?',
  ],
};

const GENERIC_CTA = 'Are your construction drawings keeping pace with your build schedule, or is documentation the bottleneck?';

// Note: .find() returns first match only. Multi-competitor handling deferred.
const COMPETITOR_CATEGORIES: Record<string, { category: string; gap: string }> = {
  'iqgeo': { category: 'GIS platform', gap: 'manages network data but doesn\'t generate construction drawings from it' },
  '3gis': { category: 'GIS platform', gap: 'strong on fiber network modeling, gap on automated drawing output' },
  'sitetracker': { category: 'project management', gap: 'tracks projects but doesn\'t automate the drawing production that feeds them' },
  'katapult': { category: 'pole data collection', gap: 'captures field data but doesn\'t convert it to permit-ready construction drawings' },
  'vetro': { category: 'network planning', gap: 'plans routes but doesn\'t generate the construction documents for those routes' },
  'biarri': { category: 'network planning', gap: 'optimizes network design but doesn\'t produce construction-ready deliverables' },
  'hexagon': { category: 'engineering software', gap: 'broad engineering suite, but fiber drawing automation isn\'t the core workflow' },
  'render networks': { category: 'GIS platform', gap: 'network design platform, gap on automated construction drawing output' },
  'comsof': { category: 'network planning', gap: 'fiber planning optimization, doesn\'t extend to construction drawing generation' },
};

export function buildPatternSelectorPrompt(
  dossierSummary: string,
  aeNotes: string,
  contactTitle: string,
  touchNumber: 1 | 2 | 3,
  previousPatterns: InfluencePattern[] = [],
  icpType?: string,
): string {
  const hasAeNotes = aeNotes && aeNotes.trim().length > 0;

  const filteredPatterns = hasAeNotes
    ? Object.entries(INFLUENCE_TOOLKIT.patterns)
    : Object.entries(INFLUENCE_TOOLKIT.patterns).filter(([key]) => key !== 'commitment_consistency');

  const patternsDesc = filteredPatterns
    .map(([key, p]) => `**${key}**: ${p.description} Use when: ${p.whenToUse}`)
    .join('\n\n');

  const signalsDesc = INFLUENCE_TOOLKIT.signalMap
    .map(s => `- Signal: "${s.signal}" → Pattern: ${s.pattern} (${s.reason})`)
    .join('\n');

  const touchGuidance: Record<number, string> = {
    1: `T1 (first touch): Interest-based CTA. No links.${hasAeNotes ? ' Booth callback if notes exist.' : ''} Goal: get a reply, not a meeting.`,
    2: 'T2 (T1 + 5 days): Different angle than T1. Ask a specific diagnostic question about their operations. Should feel like a casual follow-up, not a formal new email. Goal: advance to meeting discussion.',
    3: 'T3 (T2 + 5 days): Shortest. Direct binary question about a specific decision they face. Respectful final touch. Goal: get a yes or a "not now" — both are useful.',
  };

  return `You are an influence strategy selector for a B2B sales email campaign. Your job is to select the BEST psychological influence pattern for this specific prospect and touch.

## Available influence patterns
${patternsDesc}

## Signal-to-pattern mapping (use as guide, not as rigid rule)
${signalsDesc}

## Prospect dossier summary
${dossierSummary}

## AE booth notes
${hasAeNotes ? aeNotes : 'No AE booth notes available.'}

## Contact title
${contactTitle}

## Prospect persona: ${detectPersona(contactTitle)}
${detectPersona(contactTitle) === 'revenue_leader' ? 'Executive / revenue leader. Responds to insights about capital efficiency, time-to-revenue, market capture. Challenger insight and loss aversion patterns tend to work well.' : detectPersona(contactTitle) === 'ops_builder' ? 'Operations / construction leader. Responds to operational bottleneck framing, crew utilization, build schedule pressure. Loss aversion and commitment consistency patterns tend to work well.' : 'Technical / engineering leader. Responds to data accuracy, tool integration, traceability. Reciprocity and curiosity gap patterns tend to work well with technical buyers.'}
${!hasAeNotes ? `
## COLD PROSPECT
This prospect did NOT visit the booth. There are NO AE notes and NO prior interaction. Do NOT reference a booth visit, a conversation, or anything implying prior contact. Lead with research-based insight only.` : ''}
${icpType === 'fiber_operator' || icpType === 'ae_firm' ? `
## ICP segment: ${icpType}
${icpType === 'fiber_operator' ? `This is a fiber operator (ISP, telco, electric coop, municipal broadband). Their pain points center on:
- GIS-to-CAD conversion bottleneck (manual redrawing from GIS exports)
- Build schedule pressure (BEAD construction deadlines, subscriber activation)
- Drawing throughput limiting crew deployment
- Permit cycle time eating into construction windows
Frame pattern selection around these operational bottlenecks.` : `This is an A&E (Architecture & Engineering) firm doing fiber design work. Their pain points center on:
- Project throughput (drawings per engineer per week)
- CD revision cycles consuming project margin
- Cross-checking time before engineering review
- Scaling headcount to match project pipeline without proportional hiring
Frame pattern selection around margin-per-project and throughput bottlenecks.`}` : ''}

## Touch
${touchGuidance[touchNumber]}

## IMPORTANT: Touch sequencing rules
- T1 and T2 MUST use DIFFERENT patterns (don't repeat the same angle)
- T3 is always a short binary close regardless of pattern
- If T1 uses commitment_consistency (booth callback), T2 should switch to challenger_insight or loss_aversion
- If T1 uses curiosity_gap, T2 should deliver on the curiosity with a specific insight
${previousPatterns.length > 0 ? `\n## MANDATORY: Do NOT repeat these patterns already used for earlier touches: ${previousPatterns.join(', ')}. You MUST select a DIFFERENT pattern.` : ''}

## Output format (JSON only)
{
  "pattern": "pattern_key",
  "rationale": "Why this pattern fits this prospect + touch combination",
  "emotionalFrame": "loss|gain|curiosity|urgency|authority|belonging",
  "challengerInsight": "The one thing this prospect probably doesn't know about their own situation (even if not using Challenger pattern, always generate this)",
  "psStrategy": "What the P.S. line should accomplish for this prospect",
  "ctaType": "interest_based|soft_time|binary_close"
}`;
}

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
  const pattern = INFLUENCE_TOOLKIT.patterns[patternSelection.pattern];
  const persona = getPersonaFraming(prospect.title);
  const hasAeNotes = aeNotes && aeNotes.trim().length > 0;

  const framingLine = hasAeNotes
    ? `You are writing a post-show follow-up email for Fiber Connect 2026 (May 18-19, Gaylord Palms Resort, Kissimmee FL, Booth 1728). The sender is ${aeName}, an AE at Inorsa.`
    : `You are writing a cold outreach email to a fiber industry professional. No prior interaction. The sender is ${aeName}, an AE at Inorsa.`;

  const ctaOptions = (icpType === 'fiber_operator' || icpType === 'ae_firm')
    ? ICP_CTA_OPTIONS[icpType]
    : [GENERIC_CTA];
  const ctaList = ctaOptions.map((q, i) => `  ${i + 1}. "${q}"`).join('\n');

  const competitiveBridge = (() => {
    if (!keyFacts) return '';
    const kfLower = keyFacts.toLowerCase();
    const matchedCompetitor = Object.entries(COMPETITOR_CATEGORIES).find(
      ([name]) => kfLower.includes(name)
    );
    if (!matchedCompetitor) return '';
    const [name, info] = matchedCompetitor;
    return `\n   COMPETITIVE CONTEXT: Key facts mention ${name} (${info.category}). If you reference the incumbent, acknowledge what it does well, then name the gap: "${info.gap}." Frame as complementary ("works alongside") not replacement ("replace your"). Tone: "acknowledge, not trash."`;
  })();

  const bridgeExamples = icpType === 'ae_firm'
    ? `   GOOD bridges:
   - "At that project volume, every CD revision cycle that takes a week instead of a day is margin you don't recover."
   - "When the source GIS changes mid-project, the redraw hours hit your fixed-fee bottom line."

   BAD bridges (do NOT do this):
   - "Inorsa can help with that." (names the fix too early)
   - "Inorsa handles that cross-checking automatically." (names fix AND implies validation)
   - "Many companies face similar challenges." (generic, no friction named)`
    : icpType === 'fiber_operator'
    ? `   GOOD bridges:
   - "At that build pace, a week of delayed construction drawings means crews sitting idle."
   - "When your GIS data updates and the drawings don't follow, the field runs on stale specs."

   BAD bridges (do NOT do this):
   - "Inorsa can help with that." (names the fix too early)
   - "Many companies face similar challenges." (generic, no friction named)
   - "That's where automation comes in." (solution before problem is felt)`
    : `   GOOD bridges:
   - "At that build pace, a week of delayed construction drawings means crews sitting idle."
   - "When your GIS data updates and the drawings don't follow, the field runs on stale specs."

   BAD bridges (do NOT do this):
   - "Inorsa can help with that." (names the fix too early)
   - "Many companies face similar challenges." (generic, no friction named)`;

  return `${framingLine}

## THE SINGLE MOST IMPORTANT RULE
Your email MUST open (first 1-2 sentences after salutation) with a SPECIFIC, VERIFIABLE fact. The company name MUST appear in the first sentence. Use dollar amounts, project names, geography, funding programs, hiring signals, milestones.

**THREE tiers of opener quality (use the best tier available from the key facts/dossier):**

**TIER 1 (score 8-10) — Company-specific verified fact:**
- "Altamaha EMC's USDA ReConnect Phase I award totals $21M, with the Altamaha Fiber subsidiary deploying FTTP across six Georgia counties."
- "DCN's $43.8 million statewide middle mile backbone upgrade reaches 251-plus North Dakota communities."
- "Talman's hiring push for a dedicated permit coordinator caught my attention."

**TIER 2 (score 6-7) — State-level fact + honest company framing:**
Use ONLY when key facts have NO company-specific data. Frame the state data as context FOR the company, not as the company's own achievement.
- DO: "Washington's $1.24B BEAD deployment is entering construction contracts, and firms like Booker Engineering handling OSP design in the state face a drawing throughput wall."
- DO: "Georgia's BEAD program went operational April 30, which means A&E firms like IMMCO serving Georgia ISPs are heading into a design surge."
- DON'T: "Booker Engineering's position in Washington's BEAD allocation" (asserts unverified direct BEAD relationship)
- DON'T: "IMMCO's BEAD work" (fabricates a relationship research doesn't support)

**TIER 3 (score 2-4) — NEVER DO THIS:**
- Generic industry framing with no company name: "firms absorbing the BEAD surge this cycle"
- Fabricated competitive dynamics: "firms two and three times your size are staffing up to outbid you"
- State data asserted as company achievement: "[Company]'s position in [State]'s BEAD"

## Key facts about this company (USE THESE — prioritize company-specific facts over state-level data)
${keyFacts || '[No structured intel available — extract from dossier summary below]'}

## Email structure (FOLLOW THIS ORDER)
1. Salutation: "${prospect.firstName},"
2. OPENER (1-2 sentences): Name ${prospect.company} in the first sentence. Use the best tier from above: Tier 1 if key facts have company-specific data, Tier 2 if only state-level data. For Tier 2, frame as "State's BEAD creates demand for firms like ${prospect.company}" — NOT "${prospect.company}'s BEAD work."
3. BRIDGE (1 sentence): Name the specific friction the opener fact implies for this prospect's workflow. Use the failure-friction micro-template:
   - Name what's failing or slowing down (the friction)
   - Make it specific to this persona's daily work
   - Do NOT name Inorsa or any fix yet — let the CTA invite the conversation

${bridgeExamples}${competitiveBridge}

4. CTA QUESTION (1 sentence): ${touchNumber === 1 ? `Choose ONE diagnostic question from this list (matched to this prospect's segment):
${ctaList}

HYPOTHESIS FORMAT (use when key facts have 3+ company-specific lines): Instead of a list question, frame as: "Based on [specific fact from key facts], I suspect [hypothesis about their situation]. Is that directionally right?" The [specific fact] MUST be verbatim from key facts, not paraphrased or extended. The hypothesis must be about the company specifically, not a restatement of state-level trends. If the only facts available are state-level, use the diagnostic question format instead. The hypothesis must be something the prospect would find surprising or insightful, not a restatement of their job description.` : touchNumber === 2 ? `Different diagnostic question than T1. Select a DIFFERENT angle from the ICP CTA list:
${ctaList}
Or derive a diagnostic question from the dossier. Must reference a different angle from T1.` : 'Short binary close about a specific decision they face.'}
5. PITCH VARIANT (1 sentence, verbatim): "${persona.pitchVerbatim}"
6. No signature in body (added separately)

## What Inorsa does (LOCKED pitch variant ${persona.pitchVariant} — use verbatim, char-for-char)
"${persona.pitchVerbatim}"
NEVER paraphrase. NEVER mix with other variants. NEVER claim Inorsa "validates inputs" or "catches errors."

## Prospect persona: ${persona.bucket}
${persona.framingInstructions}
Value lens: ${persona.valueLens}
${icpType === 'fiber_operator' || icpType === 'ae_firm' ? `
## ICP segment: ${icpType}
${icpType === 'fiber_operator' ? `This prospect is a fiber operator. Frame the bridge around:
- GIS-to-CAD conversion pain (manual redrawing from GIS exports into construction drawings)
- Build schedule adherence (drawings as the bottleneck, not engineering talent)
- BEAD/grant construction deadlines creating time pressure
Do NOT reference "validation" or "cross-checking" as a primary pain — those are A&E firm pains.` : `This prospect is an A&E firm. Frame the bridge around:
- Drawing throughput per engineer (how many permit-ready packages per week)
- CD revision cycles consuming margin on fixed-fee projects
- Scaling project capacity without proportional headcount growth
- Cross-referencing time between GIS source data and deliverable drawings
Do NOT frame around "build schedule" or "crew utilization" as primary pains — those are operator pains.
CRITICAL: Do NOT claim Inorsa "validates inputs" or "catches errors." The prospect's cross-checking pain is real, but the email must frame Inorsa's value as automated drawing generation, not as a validation tool.`}` : ''}

## Influence pattern: ${pattern.name}
${pattern.description}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
${hasAeNotes ? `- AE booth notes: "${aeNotes}"` : '- No AE booth notes.'}

## Dossier summary (full research — mine for facts if key facts above are thin)
${dossierSummary}

## Touch ${touchNumber} specifics
${touchNumber === 1 ? `First touch. Interest-based CTA. No links in body.${hasAeNotes ? ' Reference booth conversation.' : ''}` : ''}
${touchNumber === 2 ? `Second touch. Different angle than T1${previousTouchSubject ? ` (T1 subject: "${previousTouchSubject}")` : ''}. Casual follow-up tone. Include Office Hours secondary CTA: "Or see it live, Inorsa runs weekly Office Hours where the team demos fiber drawing generation and takes questions. 30 minutes, no commitment." Link: https://events.teams.microsoft.com/event/d351d0fb-4db5-4b4e-b627-ace41b7a75c2@1ffe754f-042e-41a2-857b-2ff7c6da0c27` : ''}
${touchNumber === 3 ? 'Final touch. 3-4 sentences MAX. Binary close. Reference Office Hours as fallback if no engagement on T1/T2.' : ''}

## ANTI-HALLUCINATION (CRITICAL)
- NEVER invent facts not present in the key facts or dossier above. No fabricated competitors, market dynamics, team sizes, or project details.
- NEVER use "confirmed" or "confirms" for inferred capabilities. If research found a company uses AutoCAD or GIS, say "your GIS-to-CAD workflow" — not "[Company]'s confirmed workflow." Same for LinkedIn claims: don't cite "LinkedIn confirms X" unless you're quoting exact language from the dossier that explicitly says LinkedIn was the source.
- PREFER verified facts (BEAD allocations, award amounts, project geography from government sources) over inferred facts (LinkedIn summaries, capability guesses). Verified > inferred, always.
- If research is thin (few key facts, short dossier), use whatever IS verified — even state-level BEAD data anchored to the company name. A factual state-level opener scoring research_depth 6 is ALWAYS better than a fabricated company-specific opener scoring 2.
- If you cannot find ANY verifiable fact, say so in your output rather than making something up.

## Anti-AI-tell rules (ENFORCE ALL)
- NO "I'm curious", "Happy to", "I'd love to", "I hope this finds you well"
- NO em-dashes anywhere
- NO transition words (Furthermore, Additionally, Moreover)
- NO more than 2 sentences per paragraph
- NEVER reference "India", "offshore", "outsourced" or any workforce geography
- NEVER use: "worth a look", "or not the right time", "just say the word", "on my end", "just let me know", "Different angle", "eat construction time", "bleeding", "binding constraint"
- VARY sentence length. USE contractions. START one sentence with "And" or "But".

## P.S. line (REQUIRED for T1 and T2)
${micrositeSlug ? `P.S. Put together a brief on ${prospect.company}'s [relevant topic]. https://fiber.inorsa.com/brief/${micrositeSlug}` : ''}
Rules: 1-2 sentences. Pattern break from body tone.

## Hard constraints
- WORD COUNT: 78-99 words target (body only, excluding subject/PS/signature). Under 78 is too thin. Over 99 triggers recomposition. Hard ceiling 110. Company-specific data points are worth the words, so do not cut them to hit a lower target.
- Subject line: under 8 words, specific to their situation. First letter capitalized. No all-lowercase.
- Salutation: strictly "${prospect.firstName}," (comma only, NO greeting word)
- The salutation IS the sentence start. Do NOT capitalize the first word after the comma unless it's a proper noun (state names like Mississippi/Washington/Georgia, country names, company names, person names, and acronyms like BEAD/NTIA are ALL proper nouns — keep them capitalized).
- Sign off as: ${aeName} | Inorsa | ${aeEmail} (ONCE only)

## Output format (JSON only)
{
  "subject": "",
  "body": "",
  "ps": "",
  "wordCount": 0,
  "influencePattern": "${patternSelection.pattern}"
}`;
}
