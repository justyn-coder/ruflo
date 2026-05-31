/**
 * 3-Judge Quality Gate for ShowRev Email Pipeline
 *
 * Tim Proxy: trained on Tim's actual edits. Catches tone/professionalism issues.
 * Recipient Proxy: simulates the prospect reading the email. Catches generic/irrelevant content.
 * Skeptic: adversarial judge. Catches fabrication, AI tells, template patterns.
 *
 * The valuable output is DISAGREEMENTS between judges, not consensus.
 */

export interface JudgeVerdict {
  judge: 'tim_proxy' | 'recipient_proxy' | 'skeptic';
  pass: boolean;
  score: number; // 1-10
  reasoning: string;
  mustFix: string[];
  strengths: string[];
}

export interface TriJudgeResult {
  prospectId: string;
  touchNumber: number;
  verdicts: JudgeVerdict[];
  consensus: 'send' | 'revise' | 'hold';
  disagreements: string[];
  highestRisk: string;
}

// Tim's edit patterns extracted from this session's feedback
// Trained on 75 reviewed emails across 8 cohorts (2026-05-11 through 2026-05-28)
const TIM_EDIT_PATTERNS = {
  killed: [
    'worth a look, or not the right time',
    'worth a look',
    'or not the right time',
    'just say the word',
    'say the word',
    'on my end',
    'just let me know',
    'still want that demo',
    'still exploring',
    'quick question',
    'I wanted to',
    'I want to make sure',
    'happy to',
    'I\'m curious',
    'curious whether',
    'Following up on the',        // P6: "Do not assume the reader saw the previous emails"
    'Quick follow-up read',       // P6: "unclear what you are trying to elicit"
    'eat construction time',      // P-eat: "no one talks like that" (6 fires)
    'eat the calendar',           // P-eat variant
    'tends to eat',               // P-eat variant
    'bleeding',                   // P-bleeding: "not common words in a business context"
    'binding constraint',         // P-binding: same feedback
    'Reply \'remove\'',           // P-opt-out: HubSpot handles unsubscribe
    'take you off the list',      // P-opt-out variant
    'Different angle.',           // Tim killed for register reasons
    'A different angle on the same load:', // Sample 70: "NO. NO NO on this sentence structure"
    'Different angle.',                   // P-different-angle: "feels too salesey, just remove it" (8 fires across 2 days, Samples 109-118)
    'Different angle',                    // variant without period
  ],
  nonBusinessWords: [
    'eat',        // P-eat: 6 fires, "no one talks like that"
    'bleeding',   // P-bleeding: "not common words in a business context"
    'binding',    // P-binding: same feedback
    'loads the pipeline', // Sample 59: replace with "impacts the project pipeline"
    'scanned at', // Sample 67: "odd sentence structure with scanned, change to came by the booth"
  ],
  praised: [
    'personalization', // Sample 103: "like the personalization"
    'good mix of similar content', // Sample 105: for same-company multi-contact emails
    'well written',   // Sample 66 v2: Tim highest compliment
  ],
  factChecking: [
    'Tim flags unverified BEAD claims (Sample 108)',
    'Tim flags wrong company-product fit (Sample 92)',
    'Tim flags AI-generated feel: "Seems to have a sense of AI generated" (Sample 106)',
    'Tim flags audience-relevance: "Construction crews dont care who designed it. They care that the drawings are accurate and ready to build from." (Sample 106)',
    'Tim caught a persona hallucination passing through unchecked (Sample 75)',
  ],
  aiTells: [
    '—',                          // em-dash: "remove dash, make proper sentence structure"
    '–',                          // en-dash used as em-dash
    ', not ',                     // P8: Variant C ", not X" ending: "reads like AI"
    ':',                          // P3: colon-bridging: "no colon, looks like AI" (use sparingly, not as sentence bridge)
    'leverage',
    'streamline',
    'innovative',
    'cutting-edge',
  ],
  structuralIssues: [
    'self-intro as first sentence (e.g. "Nathan Dunn with Inorsa")',
    'product description before prospect context',
    'same CTA phrased twice in one email',
    '"Following up." as opening line',
    'bare question without substance in T3',
    'T2/T3 assumes reader saw previous emails (P6: each touch must stand alone)',
    'final 2 sentences not combined when possible (P1/P7: Tim flags this universally)',
    'title used as noun in opener ("COO-level", "CEO-level", "Strategic Initiatives") — P-title-as-noun',
    'number written as word ("fifteen" not "15") — P-15-vs-fifteen',
    '"open office hour" instead of "Teams/Zoom call" with specific date/time/link — P5',
    'Variant pitch sentence not on its own paragraph — P2',
    '"Fiber activations measured in days" missing "are" — Tim wants "Fiber activations are measured in days" — P-Fiber-activations',
  ],
  approved: [
    'Worth a 20-minute conversation?',
    'Worth 15 minutes?',
    'permitting-first angles',
    'research depth showing as insight about prospect\'s world',
    'P.S. lines with proof points or multi-thread seeds',
    'one mention of Inorsa per email, described by outcome',
    'professional subject lines',
    'Variant pitch on its own paragraph',
    'Each touch stands alone (no cross-touch assumptions)',
    'Combine final 2 sentences into 1 where possible',
    'Office Hours with specific date/time + Teams link',
    'Add paragraph CTA: "We will be at [Event], Booth [X]. Worth 15 minutes if drawings are on your radar."',
  ],
  // Patterns Tim approved 39/75 times without any edits — these are safe
  highConfidenceApproved: {
    verdictRate: '52% approved no edits, 16% approved with style note, 31% edited, 1% rejected',
    strongestSignal: 'Research-led openers about prospect operational reality approved at near-100% rate',
    weakestSignal: 'Template-shaped emails with identical structure across prospects triggered most edits',
  },
};

export function buildTimProxyPrompt(
  emailSubject: string,
  emailBody: string,
  emailPs: string,
  prospectContext: string,
  touchNumber: number
): string {
  return `You are Tim FitzGerald, Head of Sales at Inorsa. You are reviewing a post-show follow-up email before it goes out under one of your AE's names.

## Your standards (from your actual edit history):

You KILL these patterns:
${TIM_EDIT_PATTERNS.killed.map(p => `- "${p}"`).join('\n')}

You flag these as AI tells:
${TIM_EDIT_PATTERNS.aiTells.map(p => `- "${p}"`).join('\n')}

You reject these structural issues:
${TIM_EDIT_PATTERNS.structuralIssues.map(p => `- ${p}`).join('\n')}

You approve these patterns:
${TIM_EDIT_PATTERNS.approved.map(p => `- ${p}`).join('\n')}

Your general direction: "Claude has to stop the cheeky, slang, non-executive level conversational dialog. We are selling to higher level individuals so emails should sound professional and competent."

You prefer: complete sentences, professional tone, substance in every touch, "Worth a 20-minute conversation?" as CTA. You want the AE to look competent and credible, not casual or desperate.

## Email to review:
Subject: ${emailSubject}
Body: ${emailBody}
${emailPs ? `P.S.: ${emailPs}` : 'No P.S.'}
Touch: ${touchNumber}

## Prospect context:
${prospectContext}

## Output (JSON only):
{
  "pass": true/false,
  "score": 1-10,
  "reasoning": "one paragraph on why this does or doesn't meet your standards",
  "mustFix": ["specific things to change"],
  "strengths": ["what works well"],
  "wouldYouSendThis": "yes/no and why in one sentence"
}`;
}

export function buildRecipientProxyPrompt(
  emailSubject: string,
  emailBody: string,
  emailPs: string,
  dossierSummary: string,
  prospectTitle: string,
  prospectCompany: string,
  touchNumber: number
): string {
  return `You are ${prospectTitle} at ${prospectCompany}. You receive approximately 100 emails per day. You are a senior professional in the fiber/telecom industry. You just attended Fiber Connect 2026 (May 18-19, Gaylord Palms Resort, Kissimmee FL) and visited the Inorsa booth (Booth 1728).

## Your inbox reality:
- You delete most vendor emails without reading past the subject line
- You respond to emails that demonstrate the sender understands YOUR specific situation
- You ignore emails that could have been sent to any company in your industry
- You are suspicious of emails that feel mass-produced or AI-generated
- You respect directness and competence. You do not respect flattery or desperation.

## What you know about your own company:
${dossierSummary}

## The email you just received:
Subject: ${emailSubject}
Body: ${emailBody}
${emailPs ? `P.S.: ${emailPs}` : ''}

## Answer these questions honestly (JSON):
{
  "pass": true/false,
  "score": 1-10,
  "reasoning": "your honest reaction in one paragraph",
  "mustFix": ["things that would make you delete this or think less of the sender"],
  "strengths": ["things that made you pause and actually read"],
  "wouldYouRead": "would you read past the first two lines? why or why not",
  "wouldYouRespond": "would you respond? what would it take to get a response",
  "specificitTest": "does this email say something specific enough about your company that it could NOT have been sent to any other company? name what"
}`;
}

export function buildSkepticPrompt(
  emailSubject: string,
  emailBody: string,
  emailPs: string,
  allOtherEmailBodies: string[],
  touchNumber: number
): string {
  return `You are an adversarial quality reviewer. Your job is to find problems the other reviewers miss. You are looking for:

1. FABRICATION: Does the email state facts about the prospect's company? Are any of those facts potentially wrong, unverified, or misleadingly precise?
2. AI TELLS: Em-dashes, "curious," "happy to," perfectly parallel structure, uniform paragraph lengths, transition words (Furthermore, Additionally), overly balanced sentence construction.
3. TEMPLATE SMELL: Compare this email against the other emails in the batch. Do they share structural patterns, phrases, or rhythms that reveal they came from the same template?
4. CLAIM VERIFICATION: If the email mentions a dollar amount, a project name, a number of locations, or a BEAD award, flag whether this was verified from a primary source or could be wrong.
5. TONE INCONSISTENCY: Does the email sound like it was written by the AE whose name is on it, or does it sound like it was written by an AI pretending to be that AE?

## Email to review:
Subject: ${emailSubject}
Body: ${emailBody}
${emailPs ? `P.S.: ${emailPs}` : ''}
Touch: ${touchNumber}

## Other emails in this batch (for template detection):
${allOtherEmailBodies.map((b, i) => `Email ${i + 1}: ${b}`).join('\n\n')}

## Output (JSON):
{
  "pass": true/false,
  "score": 1-10,
  "reasoning": "what you found",
  "mustFix": ["specific problems"],
  "strengths": ["things that passed scrutiny"],
  "fabricationRisk": ["any facts that could be wrong, with what would need to be verified"],
  "aiTellsFound": ["specific AI tells identified with the exact text"],
  "templatePatterns": ["phrases or structures shared with other emails in the batch"],
  "verificationNeeded": ["claims that need source verification before sending"]
}`;
}

export function analyzeDisagreements(verdicts: JudgeVerdict[]): {
  consensus: 'send' | 'revise' | 'hold';
  disagreements: string[];
  highestRisk: string;
} {
  const allPass = verdicts.every(v => v.pass);
  const allFail = verdicts.every(v => !v.pass);
  const avgScore = verdicts.reduce((s, v) => s + v.score, 0) / verdicts.length;

  const disagreements: string[] = [];

  // Find where judges disagree
  const passJudges = verdicts.filter(v => v.pass).map(v => v.judge);
  const failJudges = verdicts.filter(v => !v.pass).map(v => v.judge);

  if (passJudges.length > 0 && failJudges.length > 0) {
    disagreements.push(
      `${passJudges.join(', ')} say send; ${failJudges.join(', ')} say revise`
    );
  }

  // Find contradicting assessments
  const allMustFix = new Map<string, string[]>();
  const allStrengths = new Map<string, string[]>();
  for (const v of verdicts) {
    for (const fix of v.mustFix) {
      const judges = allMustFix.get(fix) || [];
      judges.push(v.judge);
      allMustFix.set(fix, judges);
    }
    for (const str of v.strengths) {
      const judges = allStrengths.get(str) || [];
      judges.push(v.judge);
      allStrengths.set(str, judges);
    }
  }

  // Something flagged as both a strength and a problem = interesting disagreement
  for (const [fix] of allMustFix) {
    for (const [strength] of allStrengths) {
      if (fix.toLowerCase().includes(strength.toLowerCase().slice(0, 20)) ||
          strength.toLowerCase().includes(fix.toLowerCase().slice(0, 20))) {
        disagreements.push(`Conflicting: "${fix}" flagged as both problem and strength`);
      }
    }
  }

  const lowestScore = Math.min(...verdicts.map(v => v.score));
  const lowestJudge = verdicts.find(v => v.score === lowestScore);
  const highestRisk = lowestJudge
    ? `${lowestJudge.judge} scored ${lowestScore}/10: ${lowestJudge.reasoning.slice(0, 100)}`
    : 'No significant risk identified';

  let consensus: 'send' | 'revise' | 'hold';
  if (allPass && avgScore >= 7) {
    consensus = 'send';
  } else if (allFail || avgScore < 5) {
    consensus = 'hold';
  } else {
    consensus = 'revise';
  }

  return { consensus, disagreements, highestRisk };
}

export { TIM_EDIT_PATTERNS };
