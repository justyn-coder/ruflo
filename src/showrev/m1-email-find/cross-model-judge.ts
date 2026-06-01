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

async function callExternalModel(name: string, prompt: string): Promise<string> {
  if (name === 'claude-sonnet') {
    const { callLLM } = await import('./llm-client.js');
    return callLLM(prompt, { model: 'claude-sonnet-4-6', timeoutMs: 60000, label: 'judge-claude' });
  }

  if (name === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (name === 'gpt-5') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (name === 'grok') {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new Error('XAI_API_KEY not set');
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'grok-3', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (name === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY not set');
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Unknown model: ${name}`);
}

const JUDGE_MODEL_NAMES = ['claude-sonnet', 'gemini', 'gpt-5', 'grok', 'deepseek'];

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

  const activeModelNames = models || JUDGE_MODEL_NAMES;

  const verdicts: CrossModelVerdict[] = [];

  for (const modelName of activeModelNames) {
    console.log(`  │  ⏳ Cross-model judge: ${modelName}...`);
    try {
      const raw = await callExternalModel(modelName, prompt);

      const parsed = parseJudgeResponse(raw);
      verdicts.push({
        model: modelName,
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
        model: modelName,
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
