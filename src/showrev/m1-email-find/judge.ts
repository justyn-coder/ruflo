// 4-dimension LLM judge + mechanical checks.
// For the 3-judge adversarial panel (Tim Proxy / Recipient Proxy / Skeptic), see judges.ts.
// For cross-model judging (Claude/Gemini/GPT-5/Grok/DeepSeek), see cross-model-judge.ts.

import { Dossier } from './researcher.js';
import { ComposedEmail, EmailTouch } from './composer.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// --- Mechanical quality checks (post-judge, no LLM needed) ---

export interface MechanicalCheckResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export function runMechanicalChecks(
  body: string,
  subject: string,
  ps: string,
  aeName: string,
  aeEmail: string,
  prospectFirstName: string,
  micrositeSlug: string,
  icpType?: string,
  touchNumber?: number,
): MechanicalCheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const wcCeiling = (touchNumber ?? 1) === 3 ? 80 : 100;
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > wcCeiling) failures.push(`Word count ${wordCount} exceeds ${wcCeiling}-word ceiling`);

  // HubSpot Sequence paragraph requirement (2026-06-08): T1 body MUST be EXACTLY 3 paragraphs.
  // The P.S. is a separate field and becomes the 4th paragraph at send time.
  // T2 enforces 3 paragraphs too for sequence symmetry; T3 is open (different structure).
  if ((touchNumber ?? 1) === 1 || (touchNumber ?? 1) === 2) {
    const bodyParagraphs = body.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);
    if (bodyParagraphs.length !== 3) {
      failures.push(`HubSpot sequence requires T${touchNumber ?? 1} body to be exactly 3 paragraphs (you wrote ${bodyParagraphs.length}); paragraphs are separated by a single blank line`);
    }
  }

  // Em-dash check
  if (body.includes('—') || body.includes('–')) failures.push('Contains em-dash or en-dash');

  // Subject length
  if (subject.split(/\s+/).length > 8) failures.push(`Subject "${subject}" exceeds 8 words`);

  // Salutation check — post-processing joins "Name,\nbody" into "Name, body",
  // so check that first line STARTS WITH the salutation, not equals it exactly
  const lines = body.split('\n');
  const firstLine = lines[0].trim();
  if (!firstLine.startsWith(`${prospectFirstName},`)) {
    failures.push(`Salutation "${firstLine.slice(0, 40)}" should start with "${prospectFirstName},"`);
  }

  // P.S. microsite slug check (warn, not fail — composer may choose a better custom P.S.)
  if (ps && micrositeSlug && !ps.includes(micrositeSlug)) {
    warnings.push(`P.S. uses custom content instead of microsite slug "${micrositeSlug}"`);
  }

  // Anti-AI-tell checks — expanded from 6 to 22 patterns (2026 research)
  const aiTells: Array<[RegExp, string]> = [
    [/\bI'm curious\b/i, '"I\'m curious"'],
    [/\bHappy to\b/i, '"Happy to"'],
    [/\bI'd love to\b/i, '"I\'d love to"'],
    [/\bI'd be happy to\b/i, '"I\'d be happy to"'],
    [/\bFeel free to\b/i, '"Feel free to"'],
    [/\bFurthermore\b/i, '"Furthermore"'],
    [/\bAdditionally\b/i, '"Additionally"'],
    [/\bMoreover\b/i, '"Moreover"'],
    [/\bdelve\b/i, '"delve" (35x normal human rate)'],
    [/\bleverage\b/i, '"leverage" (corporate AI buzzword)'],
    [/\bit's worth noting\b/i, '"it\'s worth noting" (Claude fingerprint)'],
    [/\bit's important to note\b/i, '"it\'s important to note"'],
    [/\bNotably\b/i, '"Notably" (Claude fingerprint)'],
    [/\butilize\b/i, '"utilize" (say "use")'],
    [/\bseamlessly\b/i, '"seamlessly"'],
    [/\bstreamline\b/i, '"streamline"'],
    [/\brobust\b/i, '"robust"'],
    [/\bcomprehensive\b/i, '"comprehensive"'],
    [/\bI hope this (?:finds|helps|email)\b/i, '"I hope this..." (robot opener)'],
    [/\bIn today's (?:landscape|competitive|fast)\b/i, '"In today\'s..." (essay opener)'],
    [/\brevolutionize\b/i, '"revolutionize"'],
    [/\btransformative\b/i, '"transformative"'],
  ];
  for (const [pattern, label] of aiTells) {
    if (pattern.test(body)) failures.push(`AI-tell: ${label}`);
  }

  // Structural AI-tell checks (PNAS 2025, VERMILLION Framework, DL-199)
  const sentences = body.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (sentences.length >= 3) {
    // Participial clause density: present-participle openers at 2-5x human rate
    const participialOpeners = sentences.filter(s => /^[A-Z][a-z]+ing\b/.test(s));
    if (participialOpeners.length > 1) {
      warnings.push(`[AI-TELL] ${participialOpeners.length} participial openers (>1 flags as AI pattern, PNAS 2025)`);
    }
    // Sentence-length variance: low std-dev = AI tell (humans vary more)
    const lengths = sentences.map(s => s.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    if (cv < 0.15 && sentences.length >= 4) {
      warnings.push(`[AI-TELL] Low sentence-length variance (σ=${stdDev.toFixed(1)}, CV=${cv.toFixed(2)}, <0.15 flags as AI pattern)`);
    }
    // Echoed sentence structures: adjacent sentences with mirrored opening patterns (VERMILLION marker 2)
    for (let i = 0; i < sentences.length - 1; i++) {
      const wordsA = sentences[i].split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      const wordsB = sentences[i + 1].split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      if (wordsA === wordsB && wordsA.length > 3) {
        warnings.push(`[AI-TELL] Adjacent sentences echo structure: "${wordsA}" (VERMILLION marker 2)`);
        break;
      }
    }
  }

  // Redundancy checks (DL-Q4 Fix B, 2026-06-08)
  // 1) Repeated specific numeric anchor (e.g. "~3,900 locations" then "Based on the ~3,900-location scope")
  // 2) Repeated bigrams used as structural anchors
  // Recomposition often grows the email back over the ceiling by restating a number it already named.
  // Detect numbers followed by EITHER space-then-noun OR hyphen-then-noun.
  // Captures: "3,900 locations", "~3,900-location", "2-3 days", "5 miles", "40%".
  const numericPattern = /\b~?\d{1,3}(?:[,.]?\d{3})*(?:[-.]\d+)?[\s-]*(locations?|miles?|drawings?|cycles?|days?|weeks?|months?|years?|hours?|packages?|%|percent)\b/gi;
  // Group by NUMBER alone — same number used twice with the same kind of unit signals reuse,
  // even if one mention says "3,900 locations" and the other says "3,900-location scope".
  const numericMatches = [...body.matchAll(numericPattern)];
  const numberFingerprints = numericMatches.map(m => {
    const numPart = m[0].match(/~?\d[\d,.]*/)?.[0]?.replace(/[,.]/g, '') || '';
    const unit = (m[1] || '').toLowerCase().replace(/s$/, '');
    return `${numPart}:${unit}`;
  });
  const seenFingerprints = new Set<string>();
  for (const fp of numberFingerprints) {
    if (!fp || fp === ':') continue;
    if (seenFingerprints.has(fp)) {
      const [num, unit] = fp.split(':');
      failures.push(`Redundant numeric anchor: ${num} ${unit} appears twice (recomposition restated the same number)`);
      break;
    }
    seenFingerprints.add(fp);
  }

  // 3-word noun phrase repetition within the same body — captures patterns like
  // "drawing cycle" appearing in three sentences, or "design throughput" anchoring two clauses
  const sentencesForDup = body.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 12);
  if (sentencesForDup.length >= 3) {
    const ngramCounts = new Map<string, number>();
    for (const s of sentencesForDup) {
      const words = s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
      const seenInSentence = new Set<string>();
      for (let i = 0; i + 1 < words.length; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        if (seenInSentence.has(bigram)) continue;
        seenInSentence.add(bigram);
        ngramCounts.set(bigram, (ngramCounts.get(bigram) || 0) + 1);
      }
    }
    const STOPWORD_BIGRAMS = /^(?:that |this |with |from |into |their |there |would |could |should |which |where |when |what |only |just |very |they |when |then |also |here |much |many |some |most |such |make |made |been |were |have |will |your |our |you )/;
    for (const [bigram, count] of ngramCounts.entries()) {
      if (count >= 3 && !STOPWORD_BIGRAMS.test(bigram)) {
        warnings.push(`Repeated phrase "${bigram}" appears in ${count} sentences (structural redundancy)`);
        break;
      }
    }
  }

  // Tim kill-list (phrases Tim kills on sight — from TIM_EDIT_PATTERNS in judges.ts)
  if (/\bworth a? (?:20|15|30)[- ]minutes?\b/i.test(body)) failures.push('Generic CTA: "Worth X minutes?" — use a diagnostic question instead');
  if (/\bworth a look\b/i.test(body)) failures.push('Tim-kill: "worth a look"');
  if (/\bor not the right time\b/i.test(body)) failures.push('Tim-kill: "or not the right time"');
  if (/\bsay the word\b/i.test(body)) failures.push('Tim-kill: "say the word"');
  if (/\bon my end\b/i.test(body)) failures.push('Tim-kill: "on my end"');
  if (/\bjust let me know\b/i.test(body)) failures.push('Tim-kill: "just let me know"');
  if (/\bDifferent angle\b/i.test(body)) failures.push('Tim-kill: "Different angle"');
  if (/\beat construction\b/i.test(body)) failures.push('Tim-kill: "eat construction"');
  if (/\bbleeding\b/i.test(body)) failures.push('Tim-kill: "bleeding"');
  if (/\bbinding constraint\b/i.test(body)) failures.push('Tim-kill: "binding constraint"');

  // Product/industry guards — scan subject + body (tower language can leak into either)
  const prospectCopy = `${subject} ${body}`;
  if (/structural analysis/i.test(prospectCopy)) failures.push('References structural analysis (tower-side only)');
  if (/Harmoni/i.test(prospectCopy)) failures.push('References Harmoni (tower product)');
  if (/\btower\b|\bcellular\b/i.test(prospectCopy)) failures.push('References tower/cellular (fiber only)');
  if (/\bmount analysis\b/i.test(prospectCopy)) failures.push('References mount analysis (tower product)');
  if (/\bTNX\b/.test(prospectCopy)) failures.push('References TNX (tower structural analysis tool)');
  if (/\bMicroStation\b/i.test(prospectCopy)) failures.push('References MicroStation (hard disqualifier)');
  if (/\b(?:drawings?\s+QC|drawings?\s+quality[\s-]+control)\b/i.test(prospectCopy)) failures.push('References Drawing QC (not a real product)');

  // Sensitivity checks
  if (/\bIndia\b|\boffshore\b|\boutsourc/i.test(prospectCopy)) {
    failures.push('References offshore/India (sensitive in prospect-facing copy)');
  }

  // Competitor naming — warn, not fail (sometimes legitimate per competitive_displacement pattern)
  if (/\bdoesn't close\b|\bdoesn't solve\b|\bdoesn't cover\b|\bcan't handle\b|\bfalls short\b/i.test(body)) {
    warnings.push('Competitor-negative framing detected — verify tone is "acknowledge, not trash"');
  }

  // Duplicate signature detection
  const sigPattern = /\w+ \w+ \| Inorsa \| \w+@inorsa\.com/g;
  const sigMatches = body.match(sigPattern);
  if (sigMatches && sigMatches.length > 1) {
    failures.push('Duplicate AE signature detected');
  }

  return { passed: failures.length === 0, failures, warnings };
}

export interface JudgeScore {
  dimension: string;
  score: number;
  reasoning: string;
}

export interface JudgeVerdict {
  prospectId: string;
  touchNumber: number;
  scores: JudgeScore[];
  overallPass: boolean;
  overallScore: number;
  mustFix: string[];
  strengths: string[];
  recommendation: 'send' | 'hold' | 'reject';
}

export interface JudgeReport {
  prospectId: string;
  prospectName: string;
  company: string;
  verdicts: JudgeVerdict[];
  allPassed: boolean;
  judgedAt: string;
}

function buildJudgePrompt(dossier: Dossier, touch: EmailTouch, researchContext?: string, icpType?: string): string {
  const hasAeNotes = dossier.prospect.aeNotes && dossier.prospect.aeNotes.trim().length > 0;
  const emailType = hasAeNotes ? 'post-show follow-up email' : 'cold outreach email';
  const sequenceType = hasAeNotes ? 'post-show follow-up sequence' : 'cold outreach sequence';

  return `You are a quality judge evaluating a ${emailType} before it ships to a real prospect. Your job is to PROTECT the sender's reputation. Be strict.

## The email
Subject: ${touch.subject}
Body:
${touch.body}

## Context
- Touch ${touch.touchNumber} of 3 in a ${sequenceType}
- Prospect: ${dossier.prospect.firstName} ${dossier.prospect.lastName}, ${dossier.prospect.title} at ${dossier.company.name || dossier.prospect.company}
- Persona bucket: ${dossier.jtbd.personaBucket}
- JTBD claim: ${dossier.jtbd.primaryJTBD}
- VP connection: ${dossier.jtbd.vpConnection}
- Research confidence: ${dossier.jtbd.confidenceLevel}
- AE booth notes: ${dossier.prospect.aeNotes || 'none'}
${researchContext ? `\n## Research context (use to evaluate whether email claims are supported)\n${researchContext.slice(0, 2000)}` : ''}

## Score on 5 dimensions (1-10 each, ≥7 required to pass)

1. **Research depth**: Does the opening 1-2 sentences contain a SPECIFIC, VERIFIABLE fact? Score 1-3 if the opener is generic industry framing (could apply to any fiber company). Score 4-5 if it asserts a company-BEAD relationship the research context doesn't support (e.g., "[Company]'s BEAD work" when research shows no direct BEAD involvement). Score 6-7 if it uses verified state-level data honestly framed around the company (e.g., "State's $XB BEAD creates demand for firms like [Company]" — the state fact is verifiable, the company framing is honest). Score 7-8 if it cites one company-specific verified fact (e.g., BEAD award amount, project geography, company milestone, hiring signal). Score 9-10 if it cites multiple specific facts. Key distinction: state-level facts honestly anchored to the company ARE research — don't penalize. Fabricated or asserted-as-company-fact claims ARE hallucination — penalize.

2. **VP connection**: Does the email link an identified need to a SPECIFIC Inorsa capability? Not "we can help" but "your X-situation maps to our Y-capability." Score 1-3 if no connection, 4-6 if vague, 7-10 if specific and defensible.

3. **Tone**: Would an experienced AE (Mike/Nathan/Lucas) send this themselves? Peer-to-peer, not salesy. No flattery, no jargon, no desperation. Score 1-3 if obviously AI/template, 4-6 if acceptable but generic, 7-10 if feels like a real person who did their homework.

4. **Conciseness**: Body between 78-99 words? One question? No filler? Subject line under 8 words and specific? Score 1-3 if bloated (>110w) or too thin (<60w), 4-6 if slightly outside band, 7-10 if in 78-99w band and tight.

5. **JTBD alignment**: Does this email address a job THIS prospect is actually trying to do based on their role and company type? Is the CTA a diagnostic question about THEIR situation, or a generic meeting request? Score 1-3 if the email could be sent to anyone in fiber, 4-6 if it is segment-relevant (correct ICP: A&E vs operator), 7-10 if it addresses a specific job this role at this company type would recognize as their problem.

## Output format (JSON only)
{
  "scores": [
    {"dimension": "research_depth", "score": 0, "reasoning": ""},
    {"dimension": "vp_connection", "score": 0, "reasoning": ""},
    {"dimension": "tone", "score": 0, "reasoning": ""},
    {"dimension": "conciseness", "score": 0, "reasoning": ""},
    {"dimension": "jtbd_alignment", "score": 0, "reasoning": ""}
  ],
  "mustFix": [],
  "strengths": [],
  "recommendation": "send|hold|reject"
}

Rules:
- "send": all 5 dimensions ≥7
- "hold": any dimension 5-6 (fixable)
- "reject": any dimension ≤4 (needs rewrite)
- If research confidence is "low" AND research_depth scores ≥7, double-check — low-confidence research rarely produces high-depth emails
- If jtbd_alignment is ≤4, the email is talking about the wrong problem — reject regardless of other scores
${icpType === 'fiber_operator' || icpType === 'ae_firm' ? `
## ICP segment context (BONUS scoring guidance)
${icpType === 'fiber_operator' ? `This is a fiber operator. BONUS (+1-2 on jtbd_alignment) if the email:
- Frames pain around GIS-to-CAD conversion, build schedule pressure, or BEAD construction deadlines
- Uses a CTA question about drawing throughput, permit cycles, or field crew utilization
- Bridges from a company fact to drawing/documentation friction
Do NOT penalize if the email uses generic fiber framing instead of segment-specific framing. This is a bonus, not a requirement.` : `This is an A&E firm. BONUS (+1-2 on jtbd_alignment) if the email:
- Frames pain around project throughput per engineer, CD revision cycles, or margin-per-project
- Uses a CTA question about cross-checking time, redraw cycles, or capacity scaling
- Bridges from a company fact to engineering workflow friction
Do NOT penalize if the email uses generic fiber framing instead of segment-specific framing. This is a bonus, not a requirement.
CRITICAL: If the email claims Inorsa "validates inputs" or "catches errors," that is a MECHANICAL FAILURE, not a JTBD bonus question. The anti-validation rule is absolute regardless of ICP type.`}` : ''}`;
}

export async function judgeEmail(
  dossier: Dossier,
  touch: EmailTouch,
  model: string = 'sonnet',
  researchContext?: string,
  icpType?: string,
): Promise<JudgeVerdict | null> {
  const prompt = buildJudgePrompt(dossier, touch, researchContext, icpType);
  const modelId = model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';

  try {
    const { callLLM } = await import('./llm-client.js');
    const result = await callLLM(prompt, {
      model: modelId,
      maxTokens: 2048,
      timeoutMs: 60000,
      label: `judge-T${touch.touchNumber}`,
    });

    let parsed: any;
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed?.scores) return null;

    const scores: JudgeScore[] = parsed.scores;
    const overallScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const allAbove7 = scores.every(s => s.score >= 7);
    const anyBelow5 = scores.some(s => s.score <= 4);

    return {
      prospectId: dossier.prospectId,
      touchNumber: touch.touchNumber,
      scores,
      overallPass: allAbove7,
      overallScore: Math.round(overallScore * 10) / 10,
      mustFix: parsed.mustFix || [],
      strengths: parsed.strengths || [],
      recommendation: anyBelow5 ? 'reject' : allAbove7 ? 'send' : 'hold',
    };
  } catch (error: any) {
    console.error(`  [ERROR] Judge failed for T${touch.touchNumber}: ${error.message}`);
    return null;
  }
}

export async function judgeBatch(
  dossiers: Dossier[],
  emails: ComposedEmail[],
  options: { model?: string; outputDir?: string } = {}
): Promise<JudgeReport[]> {
  const model = options.model || 'sonnet';
  const outputDir = options.outputDir || resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev/judge-reports');
  const reports: JudgeReport[] = [];

  console.log(`\n=== Quality Judge ===`);
  console.log(`Emails to judge: ${emails.length}`);
  console.log(`Model: ${model}\n`);

  for (const email of emails) {
    const dossier = dossiers.find(d => d.prospectId === email.prospectId);
    if (!dossier) {
      console.log(`  [SKIP] No dossier for ${email.prospectId}`);
      continue;
    }

    console.log(`Judging ${email.prospectName} @ ${email.company}...`);
    const verdicts: JudgeVerdict[] = [];

    for (const touch of email.touches) {
      const verdict = await judgeEmail(dossier, touch, model);
      if (verdict) {
        verdicts.push(verdict);
        const passIcon = verdict.recommendation === 'send' ? '✓' : verdict.recommendation === 'hold' ? '⚠' : '✗';
        const dimScores = verdict.scores.map(s => `${s.dimension}:${s.score}`).join(' ');
        console.log(`  ${passIcon} T${touch.touchNumber}: ${verdict.recommendation.toUpperCase()} (${verdict.overallScore}/10) [${dimScores}]`);
        if (verdict.mustFix.length > 0) {
          console.log(`    Must fix: ${verdict.mustFix.join('; ')}`);
        }
      }
    }

    const report: JudgeReport = {
      prospectId: email.prospectId,
      prospectName: email.prospectName,
      company: email.company,
      verdicts,
      allPassed: verdicts.every(v => v.recommendation === 'send'),
      judgedAt: new Date().toISOString(),
    };

    reports.push(report);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      resolve(outputDir, `${email.prospectId}-judge.json`),
      JSON.stringify(report, null, 2)
    );
  }

  console.log(`\n=== Judge Summary ===`);
  const passed = reports.filter(r => r.allPassed).length;
  const held = reports.filter(r => !r.allPassed && r.verdicts.some(v => v.recommendation === 'hold')).length;
  const rejected = reports.filter(r => r.verdicts.some(v => v.recommendation === 'reject')).length;
  console.log(`Pass (all touches send-ready): ${passed}`);
  console.log(`Hold (needs fixes): ${held}`);
  console.log(`Reject (needs rewrite): ${rejected}`);

  return reports;
}
