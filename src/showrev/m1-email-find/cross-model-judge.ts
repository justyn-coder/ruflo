import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface CrossModelVerdict {
  model: string;
  scores: {
    research_depth: number;
    vp_connection: number;
    tone: number;
    conciseness: number;
  };
  recommendation: 'send' | 'hold' | 'reject';
  mustFix: string[];
  strengths: string[];
  raw: string;
}

export interface CrossModelReport {
  prospectId: string;
  prospectName: string;
  company: string;
  touchNumber: number;
  verdicts: CrossModelVerdict[];
  consensus: 'send' | 'hold' | 'reject';
  divergence: string[];
  judgedAt: string;
}

const JUDGE_MODELS: Array<{ name: string; command: (prompt: string) => string }> = [
  {
    name: 'claude-sonnet',
    command: (prompt: string) => `claude -p --model sonnet '${prompt.replace(/'/g, "'\\''")}'`,
  },
  {
    name: 'gemini-2.5-pro',
    command: (prompt: string) => {
      const escaped = prompt.replace(/'/g, "'\\''");
      return `python3 engine/scripts/cross-model-judge-gemini.py '${escaped}'`;
    },
  },
  {
    name: 'gpt-5',
    command: (prompt: string) => {
      const escaped = prompt.replace(/'/g, "'\\''");
      return `python3 engine/scripts/cross-model-judge-gpt.py '${escaped}'`;
    },
  },
  {
    name: 'grok',
    command: (prompt: string) => {
      const escaped = prompt.replace(/'/g, "'\\''");
      return `python3 engine/scripts/cross-model-judge-grok.py '${escaped}'`;
    },
  },
  {
    name: 'deepseek',
    command: (prompt: string) => {
      const escaped = prompt.replace(/'/g, "'\\''");
      return `python3 engine/scripts/cross-model-judge-deepseek.py '${escaped}'`;
    },
  },
];

function buildCrossModelJudgePrompt(
  subject: string,
  body: string,
  ps: string,
  prospectName: string,
  company: string,
  title: string,
  touchNumber: number,
  researchSummary: string
): string {
  return `You are judging a B2B sales email for quality. Score strictly — protect the sender's reputation.

## Email
Subject: ${subject}
Body:
${body}
${ps ? `P.S. ${ps}` : ''}

## Context
- Touch ${touchNumber}/3 post-show follow-up
- Prospect: ${prospectName}, ${title} at ${company}
- Research summary: ${researchSummary.slice(0, 1000)}

## Score 1-10 on each (>=7 to pass):
1. research_depth: Grounded in evidence? Specific to THIS company?
2. vp_connection: Links need to specific Inorsa capability?
3. tone: Would an experienced AE send this? Peer-to-peer?
4. conciseness: Under 80 words? One question? No filler?

## Also check:
- No "I'm curious", "Happy to", "I'd love to" (AI tells)
- No em-dashes
- Salutation is just "[FirstName]," (no greeting word)
- Subject under 8 words

Output JSON only:
{
  "scores": {"research_depth": 0, "vp_connection": 0, "tone": 0, "conciseness": 0},
  "recommendation": "send|hold|reject",
  "mustFix": [],
  "strengths": []
}`;
}

function parseJudgeResponse(raw: string): Partial<CrossModelVerdict> {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      scores: parsed.scores,
      recommendation: parsed.recommendation,
      mustFix: parsed.mustFix || [],
      strengths: parsed.strengths || [],
    };
  } catch {
    return {};
  }
}

export async function crossModelJudge(
  subject: string,
  body: string,
  ps: string,
  prospectId: string,
  prospectName: string,
  company: string,
  title: string,
  touchNumber: number,
  researchSummary: string,
  outputDir: string,
  models?: string[]
): Promise<CrossModelReport> {
  const prompt = buildCrossModelJudgePrompt(
    subject, body, ps, prospectName, company, title, touchNumber, researchSummary
  );

  const activeModels = models
    ? JUDGE_MODELS.filter(m => models.includes(m.name))
    : JUDGE_MODELS;

  const verdicts: CrossModelVerdict[] = [];

  for (const model of activeModels) {
    console.log(`  │  ⏳ Cross-model judge: ${model.name}...`);
    try {
      const raw = execSync(model.command(prompt), {
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 5,
      }).trim();

      const parsed = parseJudgeResponse(raw);
      verdicts.push({
        model: model.name,
        scores: parsed.scores || { research_depth: 0, vp_connection: 0, tone: 0, conciseness: 0 },
        recommendation: parsed.recommendation || 'hold',
        mustFix: parsed.mustFix || [],
        strengths: parsed.strengths || [],
        raw,
      });
      console.log(`  │  ✓ ${model.name}: ${parsed.recommendation || 'parse-error'}`);
    } catch (err: any) {
      console.log(`  │  ⚠ ${model.name} failed: ${err.message?.slice(0, 80)}`);
      verdicts.push({
        model: model.name,
        scores: { research_depth: 0, vp_connection: 0, tone: 0, conciseness: 0 },
        recommendation: 'hold',
        mustFix: [`Judge unavailable: ${err.message?.slice(0, 80)}`],
        strengths: [],
        raw: '',
      });
    }
  }

  // Consensus: majority vote, tie goes to hold
  const votes = verdicts.map(v => v.recommendation);
  const sendCount = votes.filter(v => v === 'send').length;
  const rejectCount = votes.filter(v => v === 'reject').length;
  const consensus: 'send' | 'hold' | 'reject' =
    rejectCount > votes.length / 2 ? 'reject' :
    sendCount > votes.length / 2 ? 'send' : 'hold';

  // Divergence detection
  const divergence: string[] = [];
  const uniqueRecs = new Set(votes);
  if (uniqueRecs.size > 1) {
    divergence.push(`Split verdict: ${votes.map((v, i) => `${verdicts[i].model}=${v}`).join(', ')}`);
  }

  for (const dim of ['research_depth', 'vp_connection', 'tone', 'conciseness'] as const) {
    const scores = verdicts.map(v => v.scores[dim]).filter(s => s > 0);
    if (scores.length >= 2) {
      const spread = Math.max(...scores) - Math.min(...scores);
      if (spread > 2) {
        divergence.push(`${dim}: spread of ${spread} (${verdicts.map(v => `${v.model}=${v.scores[dim]}`).join(', ')})`);
      }
    }
  }

  const report: CrossModelReport = {
    prospectId,
    prospectName,
    company,
    touchNumber,
    verdicts,
    consensus,
    divergence,
    judgedAt: new Date().toISOString(),
  };

  // Write report
  const reportPath = resolve(outputDir, 'judge-reports', `${prospectId}-T${touchNumber}-cross-model.json`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return report;
}

export function printCrossModelSummary(reports: CrossModelReport[]): void {
  console.log('\n=== Cross-Model Judge Summary ===\n');

  for (const r of reports) {
    const icon = r.consensus === 'send' ? '✓' : r.consensus === 'hold' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.prospectName} T${r.touchNumber}: ${r.consensus.toUpperCase()}`);
    for (const v of r.verdicts) {
      const s = v.scores;
      console.log(`    ${v.model}: ${v.recommendation} [R:${s.research_depth} V:${s.vp_connection} T:${s.tone} C:${s.conciseness}]`);
    }
    if (r.divergence.length > 0) {
      for (const d of r.divergence) console.log(`    DIVERGENCE: ${d}`);
    }
  }

  const sendCount = reports.filter(r => r.consensus === 'send').length;
  const holdCount = reports.filter(r => r.consensus === 'hold').length;
  const rejectCount = reports.filter(r => r.consensus === 'reject').length;
  console.log(`\n  Send: ${sendCount} | Hold: ${holdCount} | Reject: ${rejectCount}`);
}
