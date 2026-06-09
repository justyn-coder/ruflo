/**
 * tiered-judge — items 7 + 8 from operator-approved rule archeology synthesis 2026-06-09.
 *
 * Three-tier judge system:
 *   Tier 1 — mechanical regex (banned phrases, word count, paragraph count, em-dash,
 *            company-name lock). Instant, $0. Must pass or retry.
 *            Reuses checks from composer-constraints.ts (NO reinvention).
 *   Tier 2 — Tim-style edit-pattern judge. ~3s/email, $0 (small inline pattern check).
 *            Scores 0-5. Threshold: ≥3/5 = pass clean.
 *   Tier 3 — Cross-family Gemini judge. ~10s/email, ~$0.005. Used for borderline
 *            cases (Tier 2 ≤2/5) OR explicit medium+ deliverables.
 *
 * Decision rule (per synthesis):
 *   T1 pass + T2 ≥3       → ship clean
 *   T1 pass + T2 = 2      → require T3 confirmation
 *   T1 pass + T2 0-1      → require T3 confirmation
 *   T1 pass + split       → flag for human review (send_status='flag')
 *   T1 fail               → retry (best-of-N selector upstream)
 *
 * Monitoring (item 8): every 10 prospects, rolling rates are recomputed. If a
 * threshold trips, JUDGE-ALERT.md is rewritten at repo root.
 *
 * NOTE: This module does NOT mutate the composed email. It only emits a
 * verdict (ship / retry / flag). Caller is responsible for retry orchestration
 * and write-side wiring (e.g., setting send_status='flag').
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

import {
  checkBannedPhrases,
  checkCompanyNameLock,
  countParagraphs,
  countWords,
  countWordsTotal,
} from './composer-constraints.js';
import type { ComposedEmail } from './types.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type JudgeAction = 'ship' | 'retry' | 'flag';

export interface Tier1Result {
  pass: boolean;
  /** Specific violations (banned phrases, wrong company name, etc.). */
  violations: string[];
}

export interface Tier2Result {
  /** 0-5 score. Each Tim edit-pattern hit subtracts 1, floor at 0. */
  score: number;
  /** Specific patterns that fired. */
  hits: string[];
}

export interface Tier3Result {
  /** Gemini verdict — 'pass' / 'fail' / 'split' (i.e., model gave a low score). */
  verdict: 'pass' | 'fail' | 'split';
  /** Gemini score 0-10, for transparency. */
  score?: number;
  /** Short reasoning lifted from Gemini. */
  reasoning?: string;
  /** True if the call errored out (treated as a 'split' = inconclusive). */
  errored?: boolean;
}

export interface TieredJudgeResult {
  tier1: Tier1Result;
  tier2: Tier2Result;
  tier3?: Tier3Result;
  /** What to do with the composed email. */
  action: JudgeAction;
  /** Brief why-string for logs. */
  rationale: string;
}

export interface ProspectContext {
  firstName: string;
  lastName: string;
  company: string;
  title?: string;
  state?: string;
}

// ----------------------------------------------------------------------------
// Tier 1 — mechanical regex
// ----------------------------------------------------------------------------
//
// Reuses checks from composer-constraints.ts. The composer already runs these
// pre-write; this is a re-verification gate that runs INDEPENDENTLY so a
// regression in composer post-processing can be caught here.

// Word-count rule unified 2026-06-09 (operator-confirmed): ceiling is on
// body + P.S. combined (URL excluded), NOT body alone. Composers and
// tiered-judge now measure the SAME unit using countWordsTotal.
const WORD_COUNT_CEILING = 100;
const PARAGRAPH_MIN = 3;
const PARAGRAPH_MAX = 4;

export function runTier1(composed: ComposedEmail, prospect: ProspectContext): Tier1Result {
  const violations: string[] = [];

  // Banned phrases (AI tells, Tim kill-list, product guards, offshore guards)
  const banned = checkBannedPhrases(composed.body, composed.subject);
  for (const label of banned) violations.push(`Banned: ${label}`);

  // Em-dash check (Tim flags these as AI tells — em + en dashes)
  if (/[—–]/.test(composed.body)) violations.push('Em/en-dash in body');
  if (/[—–]/.test(composed.subject)) violations.push('Em/en-dash in subject');
  if (composed.ps && /[—–]/.test(composed.ps)) violations.push('Em/en-dash in P.S.');

  // Word count — body + P.S. (URL excluded), matches composer rule
  const totalWords = countWordsTotal(composed.body, composed.ps || '');
  if (totalWords > WORD_COUNT_CEILING) {
    violations.push(`Total body + P.S. (URL excluded) is ${totalWords} words (ceiling ${WORD_COUNT_CEILING})`);
  }

  // Paragraph count
  const paras = countParagraphs(composed.body);
  if (paras < PARAGRAPH_MIN || paras > PARAGRAPH_MAX) {
    violations.push(`Body has ${paras} paragraphs (allowed ${PARAGRAPH_MIN}-${PARAGRAPH_MAX})`);
  }

  // Company-name lock (Andrew/UECI bug class)
  const companyViolation = checkCompanyNameLock(composed.body, prospect.company);
  if (companyViolation) violations.push(companyViolation);

  return { pass: violations.length === 0, violations };
}

// ----------------------------------------------------------------------------
// Tier 2 — Tim-style edit-pattern judge
// ----------------------------------------------------------------------------
//
// Score 0-5. Start at 5. Subtract 1 per Tim edit-pattern fire. Floor at 0.
// Patterns ported from `src/showrev/m1-email-find/judges.ts` (TIM_EDIT_PATTERNS).
// Lightweight regex layer — no LLM call. Runs in microseconds.
//
// NOTE: composer-constraints.ts already covers TIM_KILL_LIST exact-matches.
// Tier 2 catches the SHAPE/REGISTER patterns Tim flags: title-as-noun openers,
// number-words instead of digits, cross-touch assumptions, etc.

interface TimPattern {
  pattern: RegExp;
  label: string;
  /** How much to subtract from the score per match. */
  weight: number;
}

const TIM_TIER2_PATTERNS: TimPattern[] = [
  // Register / professionalism (Tim's universal direction)
  { pattern: /\bcurious whether\b/i, label: 'curious-whether opener', weight: 1 },
  { pattern: /\bquick question\b/i, label: 'quick-question opener', weight: 1 },
  { pattern: /\bjust wanted to\b/i, label: 'just-wanted-to', weight: 1 },
  { pattern: /\bI wanted to make sure\b/i, label: 'I-wanted-to-make-sure', weight: 1 },
  { pattern: /\bstill exploring\b/i, label: 'still-exploring (Tim killed)', weight: 1 },
  { pattern: /\bstill want that demo\b/i, label: 'still-want-that-demo', weight: 1 },

  // Cross-touch assumptions (P6 — each touch must stand alone)
  { pattern: /\bFollowing up on (?:the|my|our)\b/i, label: 'cross-touch reference (P6)', weight: 1 },
  { pattern: /\bQuick follow-up\b/i, label: 'quick follow-up opener (P6)', weight: 1 },

  // Non-business words (P-eat / P-bleeding / P-binding — Sample 67+)
  { pattern: /\beat (?:construction|the calendar)\b/i, label: 'non-business "eat"', weight: 1 },
  { pattern: /\bloads the pipeline\b/i, label: 'loads-the-pipeline (Sample 59)', weight: 1 },
  { pattern: /\bscanned at\b/i, label: 'scanned-at (Sample 67)', weight: 1 },
  { pattern: /\bReply ['"]?remove['"]?\b/i, label: 'manual opt-out (HubSpot handles)', weight: 1 },
  { pattern: /\btake you off the list\b/i, label: 'manual opt-out variant', weight: 1 },

  // Sentence-structure / register (Sample 70 + 109-118)
  { pattern: /\bDifferent angle\b/i, label: 'Different-angle opener (8 fires)', weight: 1 },
  { pattern: /\bA different angle on the same\b/i, label: 'different-angle structure (Sample 70)', weight: 1 },

  // Title-as-noun in opener (P-title-as-noun — Sample 95)
  { pattern: /^(?:Hi|Hello|Hey)?\s*\w+,?\s*(?:COO|CEO|CFO|CTO|VP)-level\b/im, label: 'title-as-noun opener', weight: 1 },
  { pattern: /\bStrategic Initiatives\b/i, label: 'Strategic-Initiatives jargon', weight: 1 },

  // Number-as-word (P-15-vs-fifteen)
  { pattern: /\b(?:fifteen|twenty|thirty|forty|sixty|ninety)\s+minute\b/i, label: 'number-as-word (use digits)', weight: 1 },

  // "Open office hour" instead of concrete meeting (P5)
  { pattern: /\bopen office hour\b/i, label: 'open-office-hour (P5 — use specific meeting)', weight: 1 },
  { pattern: /\boffice hours\b/i, label: 'office-hours framing (P5)', weight: 1 },

  // "Fiber activations measured in days" missing "are" (P-Fiber-activations)
  { pattern: /\bfiber activations measured in days\b/i, label: 'fiber-activations missing "are"', weight: 1 },

  // Cheeky / casual tone (Tim's general direction)
  { pattern: /\bhonestly[,.]/i, label: 'casual "honestly"', weight: 1 },
  { pattern: /\b(?:gonna|wanna|kinda|sorta)\b/i, label: 'casual contraction', weight: 1 },
];

export function runTier2(composed: ComposedEmail): Tier2Result {
  const corpus = `${composed.subject}\n${composed.body}\n${composed.ps}`;
  const hits: string[] = [];
  let score = 5;
  for (const p of TIM_TIER2_PATTERNS) {
    if (p.pattern.test(corpus)) {
      hits.push(p.label);
      score -= p.weight;
    }
  }
  return { score: Math.max(0, score), hits };
}

// ----------------------------------------------------------------------------
// Tier 3 — Cross-family Gemini judge
// ----------------------------------------------------------------------------
//
// Calls Gemini 2.5 Pro via GEMINI_API_KEY (env). ~10s, ~$0.005.
// Returns 'pass' / 'fail' / 'split' (inconclusive or low-confidence).
//
// Reuses the API pattern from `cross-model-judge.ts` (same module already
// running in production).

function buildTier3Prompt(composed: ComposedEmail, prospect: ProspectContext): string {
  return `You are an adversarial reviewer for a B2B cold outbound email. Your job is to spot AI-generated tells, fabrication, generic template smell, and tone inconsistency a senior buyer would reject.

PROSPECT
- Name: ${prospect.firstName} ${prospect.lastName}
- Company: ${prospect.company}
- Title: ${prospect.title || 'unknown'}
- State: ${prospect.state || 'unknown'}

EMAIL TO REVIEW
Subject: ${composed.subject}
Body:
${composed.body}
${composed.ps ? `P.S.: ${composed.ps}` : ''}

REVIEW CRITERIA
1. AI tells (em-dashes, "I'm curious", "leverage", overly parallel structure, transition-word stacking)
2. Fabrication (specific numbers, project names, dollar amounts that could be wrong)
3. Generic template smell (could be sent to anyone in the industry)
4. Tone (does it sound like a competent AE wrote it, or a chatbot?)
5. Company-name accuracy (must reference "${prospect.company}" exactly if at all)

OUTPUT (JSON ONLY, no markdown):
{
  "score": <0-10 integer>,
  "verdict": "pass" | "fail",
  "reasoning": "<one sentence why>"
}

Score interpretation:
- 8-10 = ship-quality, indistinguishable from a hand-written AE email
- 5-7 = borderline, has issues but recoverable
- 0-4 = should not ship

Verdict: "pass" if score >= 7, otherwise "fail".`;
}

export async function runTier3(
  composed: ComposedEmail,
  prospect: ProspectContext,
  options: { timeoutMs?: number } = {},
): Promise<Tier3Result> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { verdict: 'split', errored: true, reasoning: 'GEMINI_API_KEY not set' };
  }
  const prompt = buildTier3Prompt(composed, prospect);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      return { verdict: 'split', errored: true, reasoning: `Gemini HTTP ${res.status}` };
    }
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseTier3Response(text);
  } catch (err) {
    return { verdict: 'split', errored: true, reasoning: `Gemini call failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

function parseTier3Response(text: string): Tier3Result {
  // Strip code fences if Gemini ignored "JSON ONLY"
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Find first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    return { verdict: 'split', errored: true, reasoning: 'Could not parse JSON from Gemini' };
  }
  try {
    const parsed = JSON.parse(match[0]);
    const score = typeof parsed.score === 'number' ? parsed.score : undefined;
    const rawVerdict = (parsed.verdict || '').toLowerCase();
    const reasoning = parsed.reasoning || '';
    let verdict: 'pass' | 'fail' | 'split' = 'split';
    if (rawVerdict === 'pass') verdict = 'pass';
    else if (rawVerdict === 'fail') verdict = 'fail';
    else if (typeof score === 'number') verdict = score >= 7 ? 'pass' : 'fail';
    return { verdict, score, reasoning };
  } catch {
    return { verdict: 'split', errored: true, reasoning: 'JSON parse error' };
  }
}

// ----------------------------------------------------------------------------
// Decision rule
// ----------------------------------------------------------------------------

const TIER2_SHIP_THRESHOLD = 3;     // >=3/5 = ship clean
// 2/5 and 0-1/5 both require Tier 3 (per the decision-rule table).

export interface RunTieredJudgeOptions {
  /** Force Tier 3 even if Tier 2 >= threshold (e.g., for medium+ deliverables). */
  forceTier3?: boolean;
  /** Override Gemini timeout. */
  tier3TimeoutMs?: number;
}

export async function runTieredJudgeOnProspect(
  composed: ComposedEmail,
  prospect: ProspectContext,
  options: RunTieredJudgeOptions = {},
): Promise<TieredJudgeResult> {
  const tier1 = runTier1(composed, prospect);

  // T1 fail -> retry, no need to run downstream judges
  if (!tier1.pass) {
    return {
      tier1,
      tier2: { score: 0, hits: [] },
      action: 'retry',
      rationale: `T1 fail (${tier1.violations.length} violations)`,
    };
  }

  const tier2 = runTier2(composed);

  // T1 pass + T2 >= threshold and no force flag -> ship
  if (tier2.score >= TIER2_SHIP_THRESHOLD && !options.forceTier3) {
    return {
      tier1,
      tier2,
      action: 'ship',
      rationale: `T1 pass + T2 ${tier2.score}/5`,
    };
  }

  // Otherwise run T3
  const tier3 = await runTier3(composed, prospect, { timeoutMs: options.tier3TimeoutMs });

  // Decision rule with T3
  let action: JudgeAction;
  let rationale: string;
  if (tier3.verdict === 'pass') {
    action = 'ship';
    rationale = `T1 pass + T2 ${tier2.score}/5 + T3 pass (${tier3.score ?? '?'}/10)`;
  } else if (tier3.verdict === 'fail') {
    // T2 borderline (<=2/5) + T3 says fail -> flag (don't auto-retry,
    // human review needed because composer can't easily fix register issues).
    action = 'flag';
    rationale = `T1 pass + T2 ${tier2.score}/5 + T3 fail (${tier3.score ?? '?'}/10): ${tier3.reasoning || 'no reason'}`;
  } else {
    // T3 split / errored -> treat as flag for safety
    action = 'flag';
    rationale = `T1 pass + T2 ${tier2.score}/5 + T3 inconclusive: ${tier3.reasoning || 'errored'}`;
  }

  return { tier1, tier2, tier3, action, rationale };
}

// ----------------------------------------------------------------------------
// Item 8 — judge monitor (rolling rates + JUDGE-ALERT.md)
// ----------------------------------------------------------------------------
//
// Tracks per-tier outcomes across a pipeline run. Every BATCH_SIZE prospects,
// recomputes rolling rates. If any threshold trips, writes JUDGE-ALERT.md at
// repo root so operator + me both see it in git status.

const BATCH_SIZE = 10;
const ALERT_PATH = resolve(
  // Walk up from this file: m1-email-find/evidence-tiering -> ... -> ruflo root
  new URL(import.meta.url).pathname,
  '../../../../..',
  'JUDGE-ALERT.md',
);

// Thresholds (per the synthesis)
const TIER1_FAIL_THRESHOLD = 0.5;   // >50%
const TIER2_FAIL_THRESHOLD = 0.5;   // >50% (fail = score < 3)
const TIER3_DISSENT_THRESHOLD = 0.3; // >30% (dissent = T2 said borderline/fail AND T3 verdict differed)

interface MonitorState {
  total: number;
  tier1Fails: number;
  tier2Fails: number;          // tier2 score < TIER2_SHIP_THRESHOLD
  tier3Calls: number;          // how many times Tier 3 ran
  tier3Dissents: number;       // T3 disagreed with what T2 indicated
  lastAlertWrittenAt?: string;
}

const _state: MonitorState = {
  total: 0,
  tier1Fails: 0,
  tier2Fails: 0,
  tier3Calls: 0,
  tier3Dissents: 0,
};

/**
 * Reset monitor state (useful for tests / new pipeline runs).
 */
export function resetJudgeMonitor(): void {
  _state.total = 0;
  _state.tier1Fails = 0;
  _state.tier2Fails = 0;
  _state.tier3Calls = 0;
  _state.tier3Dissents = 0;
  _state.lastAlertWrittenAt = undefined;
}

/**
 * Record a tiered-judge result and, every BATCH_SIZE prospects, check rolling
 * rates. If any threshold tripped, write JUDGE-ALERT.md.
 *
 * @param prospectIdx 0-indexed prospect number within the run
 * @param tierResult result from runTieredJudgeOnProspect
 */
export function judgeMonitor(prospectIdx: number, tierResult: TieredJudgeResult): void {
  _state.total += 1;
  if (!tierResult.tier1.pass) _state.tier1Fails += 1;
  if (tierResult.tier2.score < TIER2_SHIP_THRESHOLD) _state.tier2Fails += 1;
  if (tierResult.tier3) {
    _state.tier3Calls += 1;
    // Dissent definition: T2 said borderline (<=2 = fail-ish) AND T3 said pass,
    // OR T2 said ship (>=3) but T3 forced-call returned fail.
    const t2Says: 'ship' | 'borderline' = tierResult.tier2.score >= TIER2_SHIP_THRESHOLD ? 'ship' : 'borderline';
    const t3Says = tierResult.tier3.verdict;
    if (
      (t2Says === 'borderline' && t3Says === 'pass') ||
      (t2Says === 'ship' && t3Says === 'fail')
    ) {
      _state.tier3Dissents += 1;
    }
  }

  // Check rolling rates every BATCH_SIZE prospects
  const shouldCheck = (prospectIdx + 1) % BATCH_SIZE === 0;
  if (!shouldCheck) return;

  const tier1Rate = _state.total > 0 ? _state.tier1Fails / _state.total : 0;
  const tier2Rate = _state.total > 0 ? _state.tier2Fails / _state.total : 0;
  const tier3DissentRate = _state.tier3Calls > 0 ? _state.tier3Dissents / _state.tier3Calls : 0;

  const alerts: string[] = [];
  if (tier1Rate > TIER1_FAIL_THRESHOLD) {
    alerts.push(`**Tier 1 fail rate ${(tier1Rate * 100).toFixed(0)}% (>50%)**: Composer is producing too many mechanical violations. Check composer-constraints.ts banned phrases, em-dash post-processing, or prompt drift.`);
  }
  if (tier2Rate > TIER2_FAIL_THRESHOLD) {
    alerts.push(`**Tier 2 fail rate ${(tier2Rate * 100).toFixed(0)}% (>50%)**: Style judge is failing too much — composer drift OR threshold too aggressive. Audit composer output samples vs. Tim's edit-pattern list.`);
  }
  if (tier3DissentRate > TIER3_DISSENT_THRESHOLD) {
    alerts.push(`**Tier 3 dissent rate ${(tier3DissentRate * 100).toFixed(0)}% (>30%)**: Cross-family judge frequently disagrees with Tier 2 — calibration drift. Audit T2/T3 sample pairs and recalibrate one side.`);
  }

  if (alerts.length === 0) return;

  writeJudgeAlert(alerts, {
    prospectsSeen: _state.total,
    tier1FailRate: tier1Rate,
    tier2FailRate: tier2Rate,
    tier3DissentRate,
    tier3Calls: _state.tier3Calls,
  });
  _state.lastAlertWrittenAt = new Date().toISOString();
}

interface AlertMeta {
  prospectsSeen: number;
  tier1FailRate: number;
  tier2FailRate: number;
  tier3DissentRate: number;
  tier3Calls: number;
}

function writeJudgeAlert(alerts: string[], meta: AlertMeta): void {
  const ts = new Date().toISOString();
  const body = `---
title: JUDGE-ALERT — tiered-judge thresholds tripped
status: ACTIVE
last_updated: ${ts}
version: v1
---

# JUDGE-ALERT

One or more rolling-rate thresholds tripped during the current pipeline run.

**Generated:** ${ts}
**Prospects observed:** ${meta.prospectsSeen}
**Tier 1 fail rate:** ${(meta.tier1FailRate * 100).toFixed(1)}%
**Tier 2 fail rate:** ${(meta.tier2FailRate * 100).toFixed(1)}%
**Tier 3 dissent rate:** ${(meta.tier3DissentRate * 100).toFixed(1)}% (across ${meta.tier3Calls} T3 calls)

## Alerts

${alerts.map(a => `- ${a}`).join('\n')}

## Action

Operator + me: review composer-constraints.ts, composer prompts, and recent compose outputs in \`sr_engine_output\`. Same pattern as WAKE-OPERATOR-NOW.md from overnight work — surfaced via \`git status\` so neither party misses it.

Written by \`src/showrev/m1-email-find/evidence-tiering/tiered-judge.ts\` (judgeMonitor).
`;
  try {
    writeFileSync(ALERT_PATH, body, 'utf-8');
  } catch (err) {
    // Non-fatal — don't crash the pipeline if we can't write the alert.
    // Log to stderr so it's still visible.
    console.error(`[tiered-judge] could not write JUDGE-ALERT.md: ${(err as Error).message}`);
  }
}

/**
 * Read-only snapshot of monitor state (for tests / debugging).
 */
export function getJudgeMonitorState(): Readonly<MonitorState> {
  return { ..._state };
}
