#!/usr/bin/env node
// Cross-family judge panel for ShowRev data-strategy synthesis (2026-06-14).
//
// Scores `data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md`
// against rubric at `data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md`
// using 4 independent non-Anthropic LLMs in parallel: Gemini 2.5 Pro, GPT-5,
// xAI Grok, DeepSeek.
//
// Writes per-round results to `data/showrev/forensic-2026-06-13-claude/
// judge-panel-data-strategy-round-N.md`.
//
// Cross-family is the explicit point — using Claude defeats it. If any of the
// 4 APIs is unreachable, STOP and surface to operator. Do NOT silently
// fall back to a Claude model.
//
// Usage:
//   node scripts/judge-panel-data-strategy-2026-06-14.mjs --round 1
//   node scripts/judge-panel-data-strategy-2026-06-14.mjs --dry-run

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
const synthesisPath = flag('synthesis', 'data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md');
const rubricPath = flag('rubric', 'data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md');
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

const synthesis = readFileSync(resolve(root, synthesisPath), 'utf8');
const rubric = readFileSync(resolve(root, rubricPath), 'utf8');

// ---------- shared judge prompt ----------

const SYSTEM_PROMPT = `You are an independent external judge from a non-Anthropic AI family. You are evaluating a DATA STRATEGY SYNTHESIS — a forensic audit + proposed substrate-tiering strategy for an enterprise cold-outreach pilot. It is NOT a sprint plan, NOT a product spec, NOT an email draft. The operator apex is quality + precision + craft-resonance over speed.

CRITICAL SCORING RULES:
1. Score each of the 10 dimensions D1-D10 on a 0-10 scale per the bands in the rubric.
2. All dimensions are POSITIVE-FRAMED: score upward from the 0-3 floor based on observable indicators in the synthesis.
3. Equal weights: each dimension contributes 10 points to the 0-100 total. weighted_total = sum of dim scores (each 0-10) = 0-100.
4. If the synthesis does NOT address a dimension at all, score 0 (NOT N/A).
5. Weakest-link gate: identify weakest dim. If weakest <6, the strategy does NOT ship even at total ≥80.
6. Pass bar: 70. Ship target: 80.
7. ADVERSARIAL DISSENT IS MANDATORY — surface at least one specific concern, dissent, or non-obvious risk in the \`adversarial_dissent\` field. Sycophancy is a failure mode. Score should NOT determine whether you dissent — the operator wants the dissent even at high scores.

You MUST return a JSON object exactly matching the schema in the rubric. No prose outside the JSON. Be opinionated; cite specific synthesis sections (e.g., "§2.4", "§4.2", "§5.1") in rationales.`;

const USER_PROMPT = `# Data Strategy Rubric (v1)

${rubric}

---

# Data Strategy Synthesis to Evaluate (v1)

${synthesis}

---

# Your task

Score the v1 data strategy synthesis against the v1 rubric. Return ONLY the JSON object described in the rubric. No prose outside the JSON. Round: ${round}.`;

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
  'D1_boundary_fidelity',
  'D2_tier_coherence',
  'D3_jtbd_preservation',
  'D4_persona_pattern_fidelity',
  'D5_talk_track_alignment',
  'D6_bridging_clarity',
  'D7_over_correction_risk',
  'D8_empirical_grounding',
  'D9_implementability',
  'D10_reversibility',
];

const WEIGHTS = Object.fromEntries(DIMS.map((d) => [d, 10]));

function aggregate(judgeResults) {
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
  const weightedTotal = DIMS.reduce((acc, dim) => acc + perDim[dim].mean, 0);
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
  console.log(`\n=== Judge panel (data strategy) round ${round} ===`);
  console.log(`Synthesis: ${synthesisPath} (${synthesis.length.toLocaleString()} chars)`);
  console.log(`Rubric:    ${rubricPath} (${rubric.length.toLocaleString()} chars)`);
  console.log(`Prompt total: ${(SYSTEM_PROMPT.length + USER_PROMPT.length).toLocaleString()} chars`);
  console.log(`Env keys: ${REQUIRED_KEYS.map((k) => `${k}=${process.env[k] ? '✓' : '✗'}`).join(' ')}`);

  if (dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log('System prompt preview:');
    console.log(SYSTEM_PROMPT.slice(0, 500) + '...');
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
    writeFileSync(
      resolve(root, outDir, `judge-panel-data-strategy-round-${round}-FAILED.json`),
      JSON.stringify({ round, synthesisPath, rubricPath, judgeResults, succeeded: succeeded.length }, null, 2),
    );
    process.exit(3);
  }

  const agg = aggregate(succeeded);

  const ts = new Date().toISOString();
  if (!existsSync(resolve(root, outDir))) mkdirSync(resolve(root, outDir), { recursive: true });

  writeFileSync(
    resolve(root, outDir, `judge-panel-data-strategy-round-${round}-raw.json`),
    JSON.stringify({ round, ts, synthesisPath, rubricPath, judgeResults, agg }, null, 2),
  );

  const md = renderMarkdown({ round, ts, synthesisPath, rubricPath, judgeResults, agg, failed });
  const mdPath = resolve(root, outDir, `judge-panel-data-strategy-round-${round}.md`);
  writeFileSync(mdPath, md);

  console.log(`\nResults written:`);
  console.log(`  ${mdPath}`);
  console.log(`  ${resolve(root, outDir, `judge-panel-data-strategy-round-${round}-raw.json`)}`);
  console.log(`\nAggregate:`);
  console.log(`  Weighted total (mean of 4):  ${agg.weightedTotal.toFixed(1)} / 100  (pass=70, ship=80)`);
  console.log(`  Weakest dim:                 ${agg.weakestDim} @ ${agg.weakestDimScore} (gate=6)`);
  console.log(`  Dims with disagreement >2:   ${agg.dimsWithDisagreement.length ? agg.dimsWithDisagreement.join(', ') : 'none'}`);
}

function renderMarkdown({ round, ts, synthesisPath, rubricPath, judgeResults, agg, failed }) {
  const passBar = 70;
  const shipBar = 80;
  const weakestGate = 6;
  const wt = agg.weightedTotal;
  const shipRec = wt >= shipBar && agg.weakestDimScore >= weakestGate ? 'SHIP' : wt >= passBar ? 'REVISE-OR-HOLD' : 'HOLD';
  return `---
title: Judge Panel — Data Strategy Synthesis — Round ${round}
status: COMPLETE
last_updated: ${ts}
round: ${round}
synthesis_path: ${synthesisPath}
rubric_path: ${rubricPath}
judges:
  - gemini-2.5-pro (Google)
  - gpt-5 (OpenAI)
  - grok-4 (xAI)
  - deepseek-reasoner (DeepSeek)
authored_by: scripts/judge-panel-data-strategy-2026-06-14.mjs (inline REST in ruflo, NOT showrev/engine)
---

# Cross-Family Judge Panel — Data Strategy — Round ${round}

## Headline

- **Weighted total (mean of ${agg.individualTotals.filter((t) => t.weighted_total != null).length} judges):** **${wt.toFixed(1)} / 100** (pass=${passBar}, ship=${shipBar})
- **Weakest dim:** ${agg.weakestDim} @ **${agg.weakestDimScore}** / 10 (weakest-link gate ≥${weakestGate})
- **Panel recommendation:** **${shipRec}**

${failed.length > 0 ? `\n⚠ ${failed.length} judge(s) failed: ${failed.map((f) => `${f.label} (${f.error?.slice(0, 100)})`).join('; ')}\n` : ''}

## Per-dim heatmap

| Dim | Mean | StdDev | Min | Max | Scores |
|---|---|---|---|---|---|
${DIMS.map((d) => {
  const p = agg.perDim[d];
  const flag = p.stddev > 2 ? ' ⚠' : '';
  return `| ${d} | **${p.mean}**${flag} | ${p.stddev} | ${p.min} | ${p.max} | ${p.scores.join(', ')} |`;
}).join('\n')}

${agg.dimsWithDisagreement.length > 0 ? `\n⚠ Dimensions with stddev >2 (judge disagreement): ${agg.dimsWithDisagreement.join(', ')}\n` : ''}

## Per-judge weighted totals + ship rec

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

## Adversarial dissent (mandatory per judge — sycophancy is a failure mode)

${judgeResults
  .filter((j) => j.parsed?.adversarial_dissent)
  .map((j) => `**${j.label} (${j.model_id}):**\n> ${j.parsed.adversarial_dissent}`)
  .join('\n\n')}

## Per-judge ship rationale

${judgeResults
  .filter((j) => j.parsed?.ship_rationale)
  .map((j) => `**${j.label} (${j.model_id}):**\n> ${j.parsed.ship_rationale}`)
  .join('\n\n')}
`;
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
