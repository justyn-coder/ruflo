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

export function buildPatternSelectorPrompt(
  dossierSummary: string,
  aeNotes: string,
  contactTitle: string,
  touchNumber: 1 | 2 | 3
): string {
  const patternsDesc = Object.entries(INFLUENCE_TOOLKIT.patterns)
    .map(([key, p]) => `**${key}**: ${p.description} Use when: ${p.whenToUse}`)
    .join('\n\n');

  const signalsDesc = INFLUENCE_TOOLKIT.signalMap
    .map(s => `- Signal: "${s.signal}" → Pattern: ${s.pattern} (${s.reason})`)
    .join('\n');

  const touchGuidance: Record<number, string> = {
    1: 'T1 (first touch, ASAP): Interest-based CTA. No links. Booth callback if notes exist. Goal: get a reply, not a meeting.',
    2: 'T2 (T1 + 5 days): Different angle than T1. Soft time suggestion CTA. Should feel like a reply to T1, not a new email. Goal: advance to meeting discussion.',
    3: 'T3 (T2 + 5 days): Shortest. Binary close CTA. Respectful final touch. Goal: get a yes or a "not now" — both are useful.',
  };

  return `You are an influence strategy selector for a B2B sales email campaign. Your job is to select the BEST psychological influence pattern for this specific prospect and touch.

## Available influence patterns
${patternsDesc}

## Signal-to-pattern mapping (use as guide, not as rigid rule)
${signalsDesc}

## Prospect dossier summary
${dossierSummary}

## AE booth notes
${aeNotes || 'No AE booth notes available.'}

## Contact title
${contactTitle}

## Touch
${touchGuidance[touchNumber]}

## IMPORTANT: Touch sequencing rules
- T1 and T2 should use DIFFERENT patterns (don't repeat the same angle)
- T3 is always a short binary close regardless of pattern
- If T1 uses commitment_consistency (booth callback), T2 should switch to challenger_insight or loss_aversion
- If T1 uses curiosity_gap, T2 should deliver on the curiosity with a specific insight

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
  micrositeSlug?: string
): string {
  const pattern = INFLUENCE_TOOLKIT.patterns[patternSelection.pattern];

  return `You are writing a post-show follow-up email for Fiber Connect 2026 (May 18-19, Gaylord Palms Resort, Kissimmee FL, Booth 1728). The sender is ${aeName}, an AE at Inorsa.

## What Inorsa does (use verbatim when describing the value prop)
We turn design data into permit-ready construction drawings. Quality control is built in, so builds keep moving.

## Influence pattern to use: ${pattern.name}
${pattern.description}
Structure: ${pattern.emailStructure}
Example opener (adapt, don't copy): ${pattern.exampleOpener}

## Emotional frame: ${patternSelection.emotionalFrame}
## Challenger insight to weave in: ${patternSelection.challengerInsight}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
${aeNotes ? `- AE booth notes: "${aeNotes}"` : '- No AE booth notes.'}

## Dossier summary
${dossierSummary}

## Touch ${touchNumber} specifics
${touchNumber === 1 ? `First touch. Interest-based CTA only ("Is this something you're running into?" not "Can we meet?"). No links. Reference booth visit${aeNotes ? ' and conversation' : ' generally'}.` : ''}
${touchNumber === 2 ? `Second touch. Different angle than T1${previousTouchSubject ? ` (T1 subject was: "${previousTouchSubject}")` : ''}. Should feel like a casual follow-up, not a formal new email. Soft time suggestion CTA.` : ''}
${touchNumber === 3 ? 'Final touch. 3-4 sentences MAX. Binary close: "worth a look, or not the right time?" Easy to say yes or no. Respectful.' : ''}

## Anti-AI-tell checklist (ENFORCE ALL)
- NO "I'm curious..." or "Curious whether..." (Claude fingerprint)
- NO "Happy to..." or "I'd love to..." (AI hedge)
- NO "I hope this finds you well" or any pleasantry opener
- NO perfect parallel structure across paragraphs
- NO transition words (Furthermore, Additionally, Moreover)
- NO more than 2 sentences in any paragraph
- VARY sentence length: mix short punchy (3-5 words) with medium (10-15)
- USE at least one sentence fragment or informal construction
- START one sentence with "And" or "But" (humans do this)
- USE a contraction that most AI avoids: "wouldn't" "couldn't" "shouldn't" over "would not"

## P.S. line (REQUIRED for T1 and T2, optional for T3)
Strategy: ${patternSelection.psStrategy}
Template reference: ${pattern.psTemplate}
${micrositeSlug ? `Microsite P.S. template: P.S. Put together an overview of how this applies to ${prospect.company}: https://fiber.inorsa.com/brief/${micrositeSlug}` : ''}
Rules: 1-2 sentences max. Pattern break from body tone. Most-read part of email.

## Preview text awareness
The first ~90 characters of your email body will show in the inbox preview pane BEFORE the recipient opens. Write the opening line knowing it serves double duty as the preview text. It must compel the open -- don't waste it on "Hi [Name]".

## Hard constraints
- Under 80 words (body only, not counting subject/signature/PS)
- One specific question per email (not two, not zero)
- Subject line: under 8 words, specific to their situation, lowercase okay
- Salutation: strictly ${prospect.firstName}, (comma only, NO greeting word)
- First paragraph starts on the NEXT LINE after salutation — NO blank line between. Format: "${prospect.firstName},\\nfirst sentence starts here."
- The salutation IS the start of the sentence. Do NOT capitalize the first word unless it's a proper noun (person, place, company). Examples: "${prospect.firstName}, thanks for..." / "${prospect.firstName}, most fiber builders..." / "${prospect.firstName}, BEAD deadlines..."
- No em-dashes anywhere
- Sign off as: ${aeName} | Inorsa | ${aeEmail} (ONCE only, never duplicate)
- CTA type for this touch: ${patternSelection.ctaType}

## Output format (JSON only)
{
  "subject": "",
  "previewText": "first ~90 chars that will show in inbox",
  "body": "",
  "ps": "",
  "wordCount": 0,
  "influencePattern": "${patternSelection.pattern}",
  "antiTellChecks": {
    "noCurious": true,
    "noHappyTo": true,
    "noPleasantryOpener": true,
    "variedSentenceLength": true,
    "hasFragment": true,
    "hasInformalConnector": true
  }
}`;
}
