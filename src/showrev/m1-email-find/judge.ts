import { Dossier } from './researcher.js';
import { ComposedEmail, EmailTouch } from './composer.js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// --- Mechanical quality checks (post-judge, no LLM needed) ---

export interface MechanicalCheckResult {
  passed: boolean;
  failures: string[];
}

export function runMechanicalChecks(
  body: string,
  subject: string,
  ps: string,
  aeName: string,
  aeEmail: string,
  prospectFirstName: string,
  micrositeSlug: string
): MechanicalCheckResult {
  const failures: string[] = [];

  // Word count (body only)
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 80) failures.push(`Word count ${wordCount} exceeds 80`);

  // Em-dash check
  if (body.includes('—') || body.includes('–')) failures.push('Contains em-dash or en-dash');

  // Subject length
  if (subject.split(/\s+/).length > 8) failures.push(`Subject "${subject}" exceeds 8 words`);

  // Salutation check (first line should be "[FirstName]," only)
  const firstLine = body.split('\n')[0].trim();
  if (firstLine !== `${prospectFirstName},`) {
    failures.push(`Salutation "${firstLine}" should be "${prospectFirstName},"`);
  }

  // P.S. microsite slug check
  if (ps && micrositeSlug && !ps.includes(micrositeSlug)) {
    failures.push(`P.S. missing microsite slug "${micrositeSlug}"`);
  }

  // Anti-AI-tell spot checks
  if (/\bI'm curious\b/i.test(body)) failures.push('AI-tell: "I\'m curious"');
  if (/\bHappy to\b/i.test(body)) failures.push('AI-tell: "Happy to"');
  if (/\bI'd love to\b/i.test(body)) failures.push('AI-tell: "I\'d love to"');
  if (/\bFurthermore\b/i.test(body)) failures.push('AI-tell: "Furthermore"');
  if (/\bAdditionally\b/i.test(body)) failures.push('AI-tell: "Additionally"');
  if (/\bMoreover\b/i.test(body)) failures.push('AI-tell: "Moreover"');

  // Pitch verbatim - should not reference tower-side or wrong products
  if (/structural analysis/i.test(body)) failures.push('References structural analysis (tower-side only)');
  if (/Harmoni/i.test(body)) failures.push('References Harmoni (tower product)');
  if (/\btower\b|\bcellular\b/i.test(body)) failures.push('References tower/cellular (fiber only)');

  return { passed: failures.length === 0, failures };
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

function buildJudgePrompt(dossier: Dossier, touch: EmailTouch): string {
  return `You are a quality judge evaluating a post-show follow-up email before it ships to a real prospect. Your job is to PROTECT the sender's reputation. Be strict.

## The email
Subject: ${touch.subject}
Body:
${touch.body}

## Context
- Touch ${touch.touchNumber} of 3 in a post-show follow-up sequence
- Prospect: ${dossier.prospect.firstName} ${dossier.prospect.lastName}, ${dossier.prospect.title} at ${dossier.company.name || dossier.prospect.company}
- Persona bucket: ${dossier.jtbd.personaBucket}
- JTBD claim: ${dossier.jtbd.primaryJTBD}
- VP connection: ${dossier.jtbd.vpConnection}
- Research confidence: ${dossier.jtbd.confidenceLevel}
- AE booth notes: ${dossier.prospect.aeNotes || 'none'}

## Score on 4 dimensions (1-10 each, ≥7 required to pass)

1. **Research depth**: Is the JTBD claim grounded in evidence? Does the email reference something specific about this company/person that could NOT be said about any random fiber company? Score 1-3 if generic, 4-6 if somewhat specific, 7-10 if clearly researched.

2. **VP connection**: Does the email link an identified need to a SPECIFIC Inorsa capability? Not "we can help" but "your X-situation maps to our Y-capability." Score 1-3 if no connection, 4-6 if vague, 7-10 if specific and defensible.

3. **Tone**: Would an experienced AE (Mike/Nathan/Lucas) send this themselves? Peer-to-peer, not salesy. No flattery, no jargon, no desperation. Score 1-3 if obviously AI/template, 4-6 if acceptable but generic, 7-10 if feels like a real person who did their homework.

4. **Conciseness**: Under 80 words? One question? No filler? Subject line under 8 words and specific? Score 1-3 if bloated, 4-6 if trimming needed, 7-10 if tight.

## Output format (JSON only)
{
  "scores": [
    {"dimension": "research_depth", "score": 0, "reasoning": ""},
    {"dimension": "vp_connection", "score": 0, "reasoning": ""},
    {"dimension": "tone", "score": 0, "reasoning": ""},
    {"dimension": "conciseness", "score": 0, "reasoning": ""}
  ],
  "mustFix": [],
  "strengths": [],
  "recommendation": "send|hold|reject"
}

Rules:
- "send": all 4 dimensions ≥7
- "hold": any dimension 5-6 (fixable)
- "reject": any dimension ≤4 (needs rewrite)
- If research confidence is "low" AND research_depth scores ≥7, double-check — low-confidence research rarely produces high-depth emails`;
}

export async function judgeEmail(
  dossier: Dossier,
  touch: EmailTouch,
  model: string = 'sonnet'
): Promise<JudgeVerdict | null> {
  const prompt = buildJudgePrompt(dossier, touch);

  try {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const result = execSync(
      `claude -p --model ${model} --max-budget-usd 0.05 --output-format json '${escapedPrompt}'`,
      { encoding: 'utf-8', timeout: 60000, maxBuffer: 1024 * 1024 * 5 }
    );

    let parsed: any;
    try {
      const jsonResponse = JSON.parse(result);
      const content = jsonResponse.result || jsonResponse.content || result;
      const jsonMatch = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null;
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : (typeof content === 'object' ? content : JSON.parse(content));
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

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
