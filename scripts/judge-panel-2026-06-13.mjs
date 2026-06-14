#!/usr/bin/env node
// Cross-family judge panel for ShowRev P2 FIX-Sprint plan.
//
// Scores `data/showrev/fix-plan-sprint-2026-06-13.md` against v2 rubric at
// `data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md` using 4
// independent non-Anthropic LLMs in parallel: Gemini 2.5 Pro, GPT-5,
// xAI Grok, DeepSeek.
//
// Writes per-round results to `data/showrev/forensic-2026-06-13-claude/
// judge-panel-round-N.md`.
//
// Cross-family is the explicit point — using Claude defeats it. If any of the
// 4 APIs is unreachable, STOP and surface to operator. Do NOT silently
// fall back to a Claude model.
//
// Usage:
//   node scripts/judge-panel-2026-06-13.mjs --round 1
//   node scripts/judge-panel-2026-06-13.mjs --round 2 --plan data/showrev/fix-plan-sprint-2026-06-13-v2.md
//   node scripts/judge-panel-2026-06-13.mjs --dry-run     # validate prompts + env + connectivity, no scoring

import { config as loadEnv } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');
loadEnv({ path: resolve(root, '.env') });

// ---------- CLI args ----------

const args = process.argv.slice(2);
function flag(name, dflt) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return dflt;
  return args[i + 1];
}
function bool(name) {
  return args.includes(`--${name}`);
}

const round = parseInt(flag('round', '1'), 10);
const planPath = flag('plan', 'data/showrev/fix-plan-sprint-2026-06-13.md');
const rubricPath = flag('rubric', 'data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md');
const outDir = flag('out-dir', 'data/showrev/forensic-2026-06-13-claude');
const dryRun = bool('dry-run');

// ---------- env preflight ----------

const REQUIRED_KEYS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY'];
const missing = REQUIRED_KEYS.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`FATAL: missing required env keys: ${missing.join(', ')}`);
  console.error('Cross-family panel requires all 4 keys. Do NOT fall back to Claude.');
  process.exit(2);
}

// ---------- inputs ----------

const plan = readFileSync(resolve(root, planPath), 'utf8');
const rubric = readFileSync(resolve(root, rubricPath), 'utf8');

// ---------- shared judge prompt ----------

const SYSTEM_PROMPT = `You are an independent external judge evaluating a sprint plan against a published rubric. Your job is to score the plan rigorously per the rubric, not to be charitable. Operator apex: quality + precision + craft-resonance over speed.

CRITICAL SCORING RULES:
1. Score each of the 10 dimensions D1-D10 on a 0-10 scale per the bands in the rubric.
2. Dimensions D2, D5, D9 are DEDUCTION-SCORED: start at 10, subtract per named failure in the rubric's deduction tables. Show your deductions explicitly in rationale.
3. Dimensions D1, D3, D4, D6, D7, D8, D10 are POSITIVE-FRAMED: score upward from the 0-3 floor based on observable indicators in the plan.
4. If the plan does NOT address a positive-framed dimension at all, score 0 (NOT N/A).
5. Compute weighted_total = sum (dim_score * weight / 10). Result is 0-100.
6. Weakest-link gate: identify weakest dim. If weakest <6, plan does NOT ship even at total ≥80.
7. Pass bar: 70. Ship target: 80.

You MUST return a JSON object exactly matching the requested schema. No prose outside the JSON. Be opinionated; cite specific plan sections (e.g., "F3 step 3", "W1 step 4") in rationales.`;

const SCHEMA_DESCRIPTION = `Required JSON shape:
{
  "judge_id": "<your model id>",
  "round": <int>,
  "scores": {
    "D1_sequencing": {"score": <0-10>, "weight": 13, "rationale": "<≤300 chars, cite plan sections>"},
    "D2_risk_discipline": {"score": <0-10>, "weight": 13, "rationale": "<show deductions: started at 10, -X for...>"},
    "D3_capability_coverage": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D4_defensibility": {"score": <0-10>, "weight": 11, "rationale": "<...>"},
    "D5_scope_discipline": {"score": <0-10>, "weight": 7, "rationale": "<show deductions>"},
    "D6_substrate_trust": {"score": <0-10>, "weight": 14, "rationale": "<...>"},
    "D7_observability": {"score": <0-10>, "weight": 8, "rationale": "<...>"},
    "D8_human_in_loop": {"score": <0-10>, "weight": 4, "rationale": "<...>"},
    "D9_concrete_spec_depth": {"score": <0-10>, "weight": 10, "rationale": "<show deductions>"},
    "D10_elegance_insight": {"score": <0-10>, "weight": 10, "rationale": "<...>"}
  },
  "weighted_total": <0-100>,
  "weakest_dim": "<e.g., D7_observability>",
  "weakest_dim_score": <0-10>,
  "top_concerns": ["<concern 1, ≤200 chars>", "<concern 2>", "<concern 3>"],
  "ship_recommendation": "<SHIP | HOLD | REVISE>",
  "ship_rationale": "<≤300 chars: cite weighted_total vs 80 bar AND weakest_dim vs 6 gate>"
}`;

const USER_PROMPT = `# Sprint Plan Evaluation Rubric (v2 — APPROVED)

${rubric}

---

# Sprint Plan to Evaluate (v1)

${plan}

---

# Your task

Score the v1 sprint plan against the v2 rubric. Return ONLY the JSON object described in your system prompt. No prose outside the JSON. Round: ${round}.

${SCHEMA_DESCRIPTION}`;

// ---------- judge call functions ----------

const TIMEOUT_MS = 240_000; // 4 min

function timeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

async function callGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: USER_PROMPT }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };
  const res = await timeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS,
    'gemini',
  );
  if (!res.ok) throw new Error(`gemini http ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`gemini empty response: ${JSON.stringify(data).slice(0, 400)}`);
  return { raw: text, model_id: 'gemini-2.5-pro' };
}

async function callOpenAI() {
  // Using chat/completions (stable + JSON mode). GPT-5 family resolves to gpt-5.
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: 'gpt-5',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
    response_format: { type: 'json_object' },
  };
  const res = await timeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS,
    'openai',
  );
  if (!res.ok) throw new Error(`openai http ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`openai empty response: ${JSON.stringify(data).slice(0, 400)}`);
  return { raw: text, model_id: data?.model || 'gpt-5' };
}

async function callGrok() {
  const url = 'https://api.x.ai/v1/chat/completions';
  const body = {
    model: 'grok-4-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };
  const res = await timeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS,
    'grok',
  );
  if (!res.ok) throw new Error(`grok http ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`grok empty response: ${JSON.stringify(data).slice(0, 400)}`);
  return { raw: text, model_id: data?.model || 'grok-4-latest' };
}

async function callDeepSeek() {
  const url = 'https://api.deepseek.com/v1/chat/completions';
  const body = {
    model: 'deepseek-reasoner',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
    response_format: { type: 'json_object' },
  };
  const res = await timeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    }),
    TIMEOUT_MS,
    'deepseek',
  );
  if (!res.ok) throw new Error(`deepseek http ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`deepseek empty response: ${JSON.stringify(data).slice(0, 400)}`);
  return { raw: text, model_id: data?.model || 'deepseek-reasoner' };
}

// ---------- parse + aggregate ----------

function parseJudgeOutput(raw, label) {
  // Strip ```json fences if present, then JSON.parse
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`${label} failed to parse JSON: ${err.message}\n--- raw output (first 800 chars) ---\n${cleaned.slice(0, 800)}`);
  }
}

const DIMS = [
  'D1_sequencing',
  'D2_risk_discipline',
  'D3_capability_coverage',
  'D4_defensibility',
  'D5_scope_discipline',
  'D6_substrate_trust',
  'D7_observability',
  'D8_human_in_loop',
  'D9_concrete_spec_depth',
  'D10_elegance_insight',
];

const WEIGHTS = {
  D1_sequencing: 13,
  D2_risk_discipline: 13,
  D3_capability_coverage: 10,
  D4_defensibility: 11,
  D5_scope_discipline: 7,
  D6_substrate_trust: 14,
  D7_observability: 8,
  D8_human_in_loop: 4,
  D9_concrete_spec_depth: 10,
  D10_elegance_insight: 10,
};

function aggregate(judgeResults) {
  // mean per dim + std-dev + min + max
  const perDim = {};
  for (const dim of DIMS) {
    const scores = judgeResults
      .filter((j) => j.parsed && j.parsed.scores && j.parsed.scores[dim])
      .map((j) => Number(j.parsed.scores[dim].score));
    if (scores.length === 0) {
      perDim[dim] = { mean: 0, stddev: 0, min: 0, max: 0, n: 0, weight: WEIGHTS[dim] };
      continue;
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    perDim[dim] = {
      mean: Math.round(mean * 10) / 10,
      stddev: Math.round(stddev * 100) / 100,
      min: Math.min(...scores),
      max: Math.max(...scores),
      n: scores.length,
      weight: WEIGHTS[dim],
      scores,
    };
  }
  const weightedTotal = DIMS.reduce((acc, dim) => acc + (perDim[dim].mean * perDim[dim].weight) / 10, 0);
  const weakestDim = DIMS.reduce((acc, dim) => (perDim[dim].mean < perDim[acc].mean ? dim : acc), DIMS[0]);
  const dimsWithDisagreement = DIMS.filter((d) => perDim[d].stddev > 2);
  return {
    perDim,
    weightedTotal: Math.round(weightedTotal * 10) / 10,
    weakestDim,
    weakestDimScore: perDim[weakestDim].mean,
    dimsWithDisagreement,
    individualTotals: judgeResults.map((j) => ({
      label: j.label,
      model_id: j.model_id,
      weighted_total: j.parsed?.weighted_total ?? null,
      ship_recommendation: j.parsed?.ship_recommendation ?? null,
      error: j.error ?? null,
    })),
  };
}

// ---------- main ----------

async function main() {
  console.log(`\n=== Judge panel round ${round} ===`);
  console.log(`Plan:   ${planPath} (${plan.length.toLocaleString()} chars)`);
  console.log(`Rubric: ${rubricPath} (${rubric.length.toLocaleString()} chars)`);
  console.log(`Prompt total: ${(SYSTEM_PROMPT.length + USER_PROMPT.length).toLocaleString()} chars`);
  console.log(`Env keys: ${REQUIRED_KEYS.map((k) => `${k}=${process.env[k] ? '✓' : '✗'}`).join(' ')}`);

  if (dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log('System prompt preview:');
    console.log(SYSTEM_PROMPT.slice(0, 400) + '...');
    console.log('\nWeights sum:', Object.values(WEIGHTS).reduce((a, b) => a + b, 0));
    process.exit(0);
  }

  console.log('\nFiring 4 judges in parallel...\n');
  const calls = [
    { label: 'gemini', fn: callGemini },
    { label: 'gpt5', fn: callOpenAI },
    { label: 'grok', fn: callGrok },
    { label: 'deepseek', fn: callDeepSeek },
  ];

  const judgeResults = await Promise.all(
    calls.map(async (c) => {
      const started = Date.now();
      try {
        const { raw, model_id } = await c.fn();
        const elapsed = Date.now() - started;
        let parsed;
        try {
          parsed = parseJudgeOutput(raw, c.label);
        } catch (err) {
          console.error(`  [${c.label}] parse failed: ${err.message.slice(0, 200)}`);
          return { label: c.label, model_id, raw, parsed: null, error: err.message, elapsed_ms: elapsed };
        }
        console.log(
          `  [${c.label}] ✓ ${model_id} in ${elapsed}ms — total=${parsed?.weighted_total} weakest=${parsed?.weakest_dim}@${parsed?.weakest_dim_score} ship=${parsed?.ship_recommendation}`,
        );
        return { label: c.label, model_id, raw, parsed, error: null, elapsed_ms: elapsed };
      } catch (err) {
        console.error(`  [${c.label}] ✗ FAILED: ${err.message.slice(0, 300)}`);
        return { label: c.label, model_id: null, raw: null, parsed: null, error: err.message, elapsed_ms: Date.now() - started };
      }
    }),
  );

  const succeeded = judgeResults.filter((j) => j.parsed && !j.error);
  const failed = judgeResults.filter((j) => j.error);

  console.log(`\n${succeeded.length}/4 judges returned valid scores. ${failed.length} failed.`);

  if (succeeded.length < 3) {
    console.error('\nFATAL: <3 judges succeeded. Cross-family panel cannot converge with <3 voices.');
    console.error('Surface to operator. Do NOT silently fall back to Claude.');
    writeFileSync(
      resolve(root, outDir, `judge-panel-round-${round}-FAILED.json`),
      JSON.stringify({ round, planPath, rubricPath, judgeResults, succeeded: succeeded.length }, null, 2),
    );
    process.exit(3);
  }

  const agg = aggregate(succeeded);

  // ---------- write outputs ----------

  const ts = new Date().toISOString();
  if (!existsSync(resolve(root, outDir))) mkdirSync(resolve(root, outDir), { recursive: true });

  // Raw JSON for next-round + diffing
  writeFileSync(
    resolve(root, outDir, `judge-panel-round-${round}-raw.json`),
    JSON.stringify({ round, ts, planPath, rubricPath, judgeResults, agg }, null, 2),
  );

  // Markdown report
  const md = renderMarkdown({ round, ts, planPath, rubricPath, judgeResults, agg, failed });
  const mdPath = resolve(root, outDir, `judge-panel-round-${round}.md`);
  writeFileSync(mdPath, md);

  console.log(`\nResults written:`);
  console.log(`  ${mdPath}`);
  console.log(`  ${resolve(root, outDir, `judge-panel-round-${round}-raw.json`)}`);
  console.log(`\nAggregate:`);
  console.log(`  Weighted total (mean of 4):  ${agg.weightedTotal.toFixed(1)} / 100  (pass=70, ship=80)`);
  console.log(`  Weakest dim:                 ${agg.weakestDim} @ ${agg.weakestDimScore} (gate=6)`);
  console.log(`  Dims with disagreement >2:   ${agg.dimsWithDisagreement.length ? agg.dimsWithDisagreement.join(', ') : 'none'}`);
}

function renderMarkdown({ round, ts, planPath, rubricPath, judgeResults, agg, failed }) {
  const passBar = 70;
  const shipBar = 80;
  const weakestGate = 6;
  const wt = agg.weightedTotal;
  const shipRec = wt >= shipBar && agg.weakestDimScore >= weakestGate ? 'SHIP' : wt >= passBar ? 'REVISE-OR-HOLD' : 'HOLD';
  return `---
title: Judge Panel — Round ${round} — sprint plan v1 vs rubric v2
status: COMPLETE
last_updated: ${ts}
round: ${round}
plan_path: ${planPath}
rubric_path: ${rubricPath}
judges:
  - gemini-2.5-pro (Google)
  - gpt-5 (OpenAI)
  - grok-4 (xAI)
  - deepseek-reasoner (DeepSeek)
authored_by: scripts/judge-panel-2026-06-13.mjs (inline REST in ruflo, NOT showrev/engine)
---

# Cross-Family Judge Panel — Round ${round}

## Headline

- **Weighted total (mean of ${agg.individualTotals.filter((t) => t.weighted_total != null).length} judges):** **${wt.toFixed(1)} / 100** (pass=${passBar}, ship=${shipBar})
- **Weakest dim:** ${agg.weakestDim} @ **${agg.weakestDimScore}** / 10 (weakest-link gate ≥${weakestGate})
- **Panel recommendation:** **${shipRec}**

${failed.length > 0 ? `\n⚠ ${failed.length} judge(s) failed: ${failed.map((f) => `${f.label} (${f.error?.slice(0, 100)})`).join('; ')}\n` : ''}

## Per-dim heatmap

| Dim | Weight | Mean | StdDev | Min | Max | Scores |
|---|---|---|---|---|---|---|
${DIMS.map((d) => {
  const p = agg.perDim[d];
  const flag = p.stddev > 2 ? ' ⚠' : '';
  return `| ${d} | ${p.weight} | **${p.mean}**${flag} | ${p.stddev} | ${p.min} | ${p.max} | ${p.scores.join(', ')} |`;
}).join('\n')}

${agg.dimsWithDisagreement.length > 0 ? `\n⚠ Dimensions with stddev >2 (judge disagreement): ${agg.dimsWithDisagreement.join(', ')}\n` : ''}

## Per-judge weighted totals

| Judge | Model | Weighted Total | Ship Rec | Elapsed |
|---|---|---|---|---|
${judgeResults
  .map((j) => `| ${j.label} | ${j.model_id || 'N/A'} | ${j.parsed?.weighted_total ?? '⚠ FAILED'} | ${j.parsed?.ship_recommendation ?? '—'} | ${j.elapsed_ms}ms |`)
  .join('\n')}

## Top concerns surfaced by judges

${judgeResults
  .filter((j) => j.parsed?.top_concerns)
  .map((j) => `**${j.label} (${j.model_id}):**\n${j.parsed.top_concerns.map((c) => `- ${c}`).join('\n')}`)
  .join('\n\n')}

## Per-judge per-dim rationales

${DIMS.map((dim) => {
  const rationales = judgeResults
    .filter((j) => j.parsed?.scores?.[dim])
    .map((j) => `- **${j.label}** (score ${j.parsed.scores[dim].score}): ${j.parsed.scores[dim].rationale}`);
  return `### ${dim} (weight ${WEIGHTS[dim]})\n\n${rationales.join('\n')}`;
}).join('\n\n')}

## Ship/Hold logic

- Pass bar: ${passBar} (panel ${wt >= passBar ? '✓ above' : '✗ below'})
- Ship target: ${shipBar} (panel ${wt >= shipBar ? '✓ above' : '✗ below'})
- Weakest-link gate: weakest dim ≥${weakestGate} (panel ${agg.weakestDimScore >= weakestGate ? '✓ above' : '✗ below'})
- **Result:** ${shipRec}

## Convergence tracking (vs prior rounds)

This is round ${round}.${round === 1 ? ' No prior round to compare.' : ' See judge-panel-round-' + (round - 1) + '.md for prior values.'}

Convergence rule: <3 pt weighted-total move AND no dim Δ>2 across two rounds = declare convergence.

## Next step

${
  shipRec === 'SHIP'
    ? `Surface to operator for final red-team. Plan is ship-ready per panel — pass bar, ship target, AND weakest-link gate all cleared.`
    : agg.weakestDimScore < weakestGate
    ? `Revise plan to address weakest dim (${agg.weakestDim}). Re-run panel. Cap remaining: ${3 - round} rounds.`
    : `Plan passes pass bar but not ship target. Revise weakest-tier dims. Re-run panel. Cap remaining: ${3 - round} rounds.`
}

${round >= 3 ? `\n**CAP HIT.** No more rounds allowed per operator decision. Escalate to operator with weighted-score history + weakest-dim summary.` : ''}
`;
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
