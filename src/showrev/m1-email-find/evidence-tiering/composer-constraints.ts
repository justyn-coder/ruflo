/**
 * Composer constraints — shared across generalized + specific composers.
 *
 * Consolidates blacklists + checks from judge.ts so:
 *   - Composer prompts get the FULL banned-phrase list, not a partial copy
 *   - Post-compose checks run BEFORE write, triggering retries
 *   - A single source of truth for changes
 *
 * Per V2-COMPOSER-GAP-FIX-PLAN.md groups A + B.
 */

// ----------------------------------------------------------------------------
// 22 AI-tell phrases (judge.ts:65-89, PNAS 2025 / VERMILLION framework)
// ----------------------------------------------------------------------------

const AI_TELLS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bI'm curious\b/i, label: '"I\'m curious"' },
  { pattern: /\bHappy to\b/i, label: '"Happy to"' },
  { pattern: /\bI'd love to\b/i, label: '"I\'d love to"' },
  { pattern: /\bI'd be happy to\b/i, label: '"I\'d be happy to"' },
  { pattern: /\bFeel free to\b/i, label: '"Feel free to"' },
  { pattern: /\bFurthermore\b/i, label: '"Furthermore"' },
  { pattern: /\bAdditionally\b/i, label: '"Additionally"' },
  { pattern: /\bMoreover\b/i, label: '"Moreover"' },
  { pattern: /\bdelve\b/i, label: '"delve"' },
  { pattern: /\bleverage\b/i, label: '"leverage"' },
  { pattern: /\bit's worth noting\b/i, label: '"it\'s worth noting"' },
  { pattern: /\bit's important to note\b/i, label: '"it\'s important to note"' },
  { pattern: /\bNotably\b/i, label: '"Notably"' },
  { pattern: /\butilize\b/i, label: '"utilize" (say "use")' },
  { pattern: /\bseamlessly\b/i, label: '"seamlessly"' },
  { pattern: /\bstreamline\b/i, label: '"streamline"' },
  { pattern: /\brobust\b/i, label: '"robust"' },
  { pattern: /\bcomprehensive\b/i, label: '"comprehensive"' },
  { pattern: /\bI hope this (?:finds|helps|email)\b/i, label: '"I hope this..." (robot opener)' },
  { pattern: /\bIn today's (?:landscape|competitive|fast)\b/i, label: '"In today\'s..."' },
  { pattern: /\brevolutionize\b/i, label: '"revolutionize"' },
  { pattern: /\btransformative\b/i, label: '"transformative"' },
];

// ----------------------------------------------------------------------------
// Tim kill-list (judge.ts:172-182, TC-1B testing 2026-05-27)
// ----------------------------------------------------------------------------
// These are phrases Tim flagged as "this is obviously AE-LARP, not a real AE."
// Ground-truth signal — more important than the generic AI tells above.
const TIM_KILL_LIST: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bworth a? (?:20|15|30)[- ]minutes?\b/i, label: 'Generic CTA: "Worth X minutes?" (use a diagnostic question instead)' },
  { pattern: /\bworth a look\b/i, label: 'Tim-kill: "worth a look"' },
  { pattern: /\bor not the right time\b/i, label: 'Tim-kill: "or not the right time"' },
  { pattern: /\bsay the word\b/i, label: 'Tim-kill: "say the word"' },
  { pattern: /\bon my end\b/i, label: 'Tim-kill: "on my end"' },
  { pattern: /\bjust let me know\b/i, label: 'Tim-kill: "just let me know"' },
  { pattern: /\bDifferent angle\b/i, label: 'Tim-kill: "Different angle"' },
  { pattern: /\beat construction\b/i, label: 'Tim-kill: "eat construction"' },
  { pattern: /\bbleeding\b/i, label: 'Tim-kill: "bleeding"' },
  { pattern: /\bbinding constraint\b/i, label: 'Tim-kill: "binding constraint"' },
];

// ----------------------------------------------------------------------------
// Product / industry guards (judge.ts:184-192)
// ----------------------------------------------------------------------------
// Inorsa is drawings-only-fiber. Composer must NEVER mention out-of-scope.
const PRODUCT_GUARDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /structural analysis/i, label: 'OUT-OF-SCOPE: structural analysis (tower-side only)' },
  { pattern: /Harmoni/i, label: 'OUT-OF-SCOPE: Harmoni (tower product)' },
  { pattern: /\btower\b|\bcellular\b/i, label: 'OUT-OF-SCOPE: tower/cellular (fiber only)' },
  { pattern: /\bmount analysis\b/i, label: 'OUT-OF-SCOPE: mount analysis (tower)' },
  { pattern: /\bTNX\b/, label: 'OUT-OF-SCOPE: TNX (tower structural)' },
  { pattern: /\bMicroStation\b/i, label: 'OUT-OF-SCOPE: MicroStation (hard disqualifier)' },
  { pattern: /\b(?:drawings?\s+QC|drawings?\s+quality[\s-]+control)\b/i, label: 'OUT-OF-SCOPE: Drawing QC (not a real product)' },
];

// ----------------------------------------------------------------------------
// Offshore / India ban (judge.ts:194-197)
// ----------------------------------------------------------------------------
const OFFSHORE_GUARDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bIndia\b/i, label: 'BANNED: "India" framing' },
  { pattern: /\boffshore\b/i, label: 'BANNED: "offshore" framing' },
  { pattern: /\boutsourc/i, label: 'BANNED: "outsource" framing' },
];

// ----------------------------------------------------------------------------
// Combined blacklist
// ----------------------------------------------------------------------------

export const ALL_BANNED: Array<{ pattern: RegExp; label: string; category: string }> = [
  ...AI_TELLS.map(p => ({ ...p, category: 'ai_tell' })),
  ...TIM_KILL_LIST.map(p => ({ ...p, category: 'tim_kill' })),
  ...PRODUCT_GUARDS.map(p => ({ ...p, category: 'product_guard' })),
  ...OFFSHORE_GUARDS.map(p => ({ ...p, category: 'offshore' })),
];

/**
 * Check body + subject for banned phrases. Returns labels of any matches.
 * Empty array = clean.
 */
export function checkBannedPhrases(body: string, subject: string): string[] {
  const corpus = `${subject} ${body}`;
  return ALL_BANNED.filter(b => b.pattern.test(corpus)).map(b => b.label);
}

/**
 * Render the banned list as a prompt block for the composer.
 * Composers inject this so the LLM sees the constraints up front.
 */
export function bannedPhrasesPromptBlock(): string {
  return `## BANNED PHRASES — composer will be rejected if any of these appear in subject or body

**AI-tell phrases (any single instance = reject):**
${AI_TELLS.map(p => `- ${p.label}`).join('\n')}

**Tim kill-list (peer-AE testing 2026-05; any single instance = reject):**
${TIM_KILL_LIST.map(p => `- ${p.label}`).join('\n')}

**Product/industry guards (Inorsa is drawings-only-fiber; mentioning these = false promise):**
${PRODUCT_GUARDS.map(p => `- ${p.label}`).join('\n')}

**Offshore/India/outsource framing (devalues positioning):**
${OFFSHORE_GUARDS.map(p => `- ${p.label}`).join('\n')}

**Workaround for "additionally":** start a new sentence. Workaround for "leverage": "use". Workaround for "streamline": "compress" or "shorten". Workaround for "transformative": "structural". Workaround for "robust": "tight" or "solid".`;
}

// ----------------------------------------------------------------------------
// ICP CTA library (influence.ts:358-371)
// ----------------------------------------------------------------------------
// 4 operator/Tim-tested diagnostic questions per ICP type. Composer MUST pick
// one and slightly adapt (not invent a new one).
export const ICP_CTA_OPTIONS: Record<string, string[]> = {
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

export function ctaLibraryPromptBlock(icpType: 'fiber_operator' | 'ae_firm'): string {
  const lib = ICP_CTA_OPTIONS[icpType] || ICP_CTA_OPTIONS.fiber_operator;
  return `## CTA QUESTION BANK (pick ONE, slightly adapt to flow — do NOT invent)

For ${icpType} prospects, the diagnostic question must be one of:
${lib.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Slight adaptation allowed (replace generic "your team" with role-specific terms, swap "build schedule" for "construction window" if it flows better). NOT allowed: inventing a brand-new question, generic "what's slowing you down?", or asking two questions.`;
}

// ----------------------------------------------------------------------------
// Structural checks (paragraph count, word count, company-name lock)
// ----------------------------------------------------------------------------

export function countParagraphs(body: string): number {
  return body
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean).length;
}

export function countWords(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count words across body + P.S. while excluding URLs.
 *
 * Operator-confirmed 2026-06-09: the 100w ceiling applies to body + P.S.
 * combined, NOT body alone. URLs are stripped because they visually count
 * as one heavy "word" but carry no narrative weight — the URL is what the
 * reader CLICKS, not what they READ.
 *
 * Body target ~50-60w, P.S. ~20-25w (excluding URL), total ~75-85w —
 * landing comfortably under the 100w ceiling.
 */
const URL_PATTERN = /https?:\/\/\S+/g;
export function countWordsTotal(body: string, ps: string): number {
  const combined = `${body} ${ps}`.replace(URL_PATTERN, '').trim();
  return combined.split(/\s+/).filter(Boolean).length;
}

/**
 * Check that the composed body references the prospect's company by the
 * EXACT input name — not a parent-co / alias / abbreviation pulled from
 * substrate metadata.
 *
 * Returns null if clean, otherwise a description of the violation for retry.
 *
 * The Andrew/UECI bug class: CSV says "United Fiber", substrate knows
 * parent is "UECI", LLM "helpfully" writes "Andrew at UECI". Prospect
 * reads wrong company → immediate credibility loss.
 *
 * Strategy:
 *   - If the company name is mentioned in the body at all, ensure the
 *     EXACT input string appears
 *   - Detect known alias patterns (substrings of company words appearing
 *     in different capitalization, or known parent-co names)
 *
 * Conservative: allows body to NOT mention company at all (industry-frame
 * openers are OK). Only fires if a mention appears AND it's wrong.
 */
export function checkCompanyNameLock(body: string, expectedCompany: string): string | null {
  const expected = expectedCompany.trim();
  if (!expected) return null;

  // If body contains expected verbatim (case-insensitive) we're good
  const normalizedBody = body.toLowerCase();
  const normalizedExpected = expected.toLowerCase();

  if (normalizedBody.includes(normalizedExpected)) return null;

  // Body doesn't mention the expected company. Check if it mentions ANY
  // capitalized multi-word noun phrase that looks like a company name in
  // contexts that suggest a company reference.
  const companyContextPattern = /\b(?:at|from|of|with)\s+([A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+){0,3})\b/g;
  const matches = [...body.matchAll(companyContextPattern)];

  // Filter out matches that ARE the expected company (case-insensitive partial)
  const expectedTokens = expected.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const suspect = matches.find(m => {
    const candidate = m[1].toLowerCase();
    // If candidate shares no tokens with expected, it's suspect
    return !expectedTokens.some(tok => candidate.includes(tok));
  });
  if (suspect) {
    return `Body references "${suspect[1]}" but prospect company is "${expectedCompany}". Use the exact name from CSV, do NOT substitute parent-co / aliases.`;
  }

  return null;
}

// ----------------------------------------------------------------------------
// Recompose-regression guards (item 4 — numeric-anchor + bigram fingerprinter)
// ----------------------------------------------------------------------------
//
// Recomposition can REINTRODUCE patterns that the previous attempt didn't have:
//   - Same numeric value cited twice ("~3,900 locations" + "3,900-location scope")
//   - Same multi-word phrase used 3+ times across sentences as a structural crutch
//
// Both are recompose-regression signals — the LLM clung to one anchor too hard
// while trying to fix something else. Caught these in the old build's judge.ts.
// Ported here as constraint-check helpers so the composer can detect + retry.

/**
 * Check for repeated numeric anchors. Returns the offending number if found,
 * or null if clean.
 *
 * Fingerprint: number + singular unit. So "1,700 miles" and "~1,700-mile scope"
 * both fingerprint as "1700:mile" and trigger the check.
 */
export function checkNumericAnchorRepeat(body: string): string | null {
  const numericPattern = /\b~?\d{1,3}(?:[,.]?\d{3})*(?:[-.]\d+)?[\s-]*(locations?|miles?|drawings?|cycles?|days?|weeks?|months?|years?|hours?|packages?|customers?|subscribers?|counties?|states?|%|percent)\b/gi;
  const matches = [...body.matchAll(numericPattern)];
  const seen = new Set<string>();
  for (const m of matches) {
    const numPart = m[0].match(/~?\d[\d,.]*/)?.[0]?.replace(/[,.]/g, '') || '';
    const unit = (m[1] || '').toLowerCase().replace(/s$/, '');
    const fp = `${numPart}:${unit}`;
    if (!fp || fp === ':') continue;
    if (seen.has(fp)) {
      return `${numPart} ${unit} appears twice in body`;
    }
    seen.add(fp);
  }
  return null;
}

/**
 * Check for 3-word noun-phrase repetition (structural redundancy crutch).
 * Returns the offending phrase if found in 3+ sentences, or null if clean.
 *
 * Filters out stopword bigrams ("that the", "with their", etc.) so common
 * connective phrases don't trigger.
 */
const STOPWORD_BIGRAMS = /^(?:that |this |with |from |into |their |there |would |could |should |which |where |when |what |only |just |very |they |then |also |here |much |many |some |most |such |make |made |been |were |have |will |your |our |you )/;

export function checkBigramRepeat(body: string): string | null {
  const sentences = body
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 12);
  if (sentences.length < 3) return null;
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const words = s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    const seenInSentence = new Set<string>();
    for (let i = 0; i + 1 < words.length; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (seenInSentence.has(bigram)) continue;
      seenInSentence.add(bigram);
      counts.set(bigram, (counts.get(bigram) || 0) + 1);
    }
  }
  for (const [bigram, count] of counts.entries()) {
    if (count >= 3 && !STOPWORD_BIGRAMS.test(bigram)) {
      return `phrase "${bigram}" repeats in ${count} sentences`;
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Best-of-N retry selector
// ----------------------------------------------------------------------------
//
// LLM retries are non-monotonic — a retry can produce a WORSE result than
// the previous attempt (e.g., 97w pass → 105w fail → 99w with banned phrase).
// The naive "ship the latest" approach loses the best attempt. Best-of-N
// tracks every attempt + picks the one that best satisfies constraints.
//
// Operator approved 2026-06-09 (#5 of rule archeology synthesis). The
// canonical case was Adam Willoughby in the old build — only caught by
// manual comparison of attempts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ComposeAttempt {
  // any so downstream composer post-processing (em-dash strip, JSON parse) can
  // access body/subject/ps/bodySentences/claim_ids without re-casting
  candidate: any;
  violations: string[];
  attemptNumber: number;
}

/**
 * Score a compose attempt. Higher = better. Used to pick winner across N
 * attempts when none are clean (violations.length === 0).
 *
 * Heuristic weights tuned to:
 *   - Critical: company-name mismatch (Andrew/UECI bug class). -40
 *   - High: word count / paragraph count (structural). -30 each
 *   - Medium: banned phrases (style). -20 each
 *   - Low: anything else. -10
 *
 * A clean attempt scores 100. An attempt with one banned phrase scores 80.
 * An attempt with wrong company name + over word count scores 30.
 */
export function scoreAttempt(violations: string[]): number {
  let score = 100;
  for (const v of violations) {
    if (/company is/.test(v) || /references "/.test(v)) score -= 40;
    else if (/Body is \d+ words/.test(v) || /Body has \d+ paragraphs/.test(v)) score -= 30;
    else if (/^Banned:/.test(v)) score -= 20;
    else score -= 10;
  }
  return Math.max(0, score);
}

/**
 * Pick the best attempt from a list. Returns the highest-scoring attempt,
 * with the earliest attempt as tiebreaker (LLM sometimes produces clean
 * output on attempt 1 and degrades on retries).
 */
export function selectBestAttempt(attempts: ComposeAttempt[]): ComposeAttempt | null {
  if (attempts.length === 0) return null;
  let best: ComposeAttempt = attempts[0];
  let bestScore = scoreAttempt(best.violations);
  for (let i = 1; i < attempts.length; i++) {
    const score = scoreAttempt(attempts[i].violations);
    if (score > bestScore) {
      best = attempts[i];
      bestScore = score;
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// A/B subject line picker (operator-approved 2026-06-09)
// ----------------------------------------------------------------------------
//
// Composers now emit TWO subject candidates per prospect. The judge picks the
// higher-scoring one as the shipped subject; the loser is preserved as
// `subject_alt` for portal display and future A/B testing.
//
// Score model — subject-only, deterministic, no LLM call:
//   - Start at 5 (same scale as Tier 2)
//   - Subtract 1 per banned-phrase hit (AI tells / Tim kill / product / offshore)
//   - Subtract 2 if subject contains em-dash or en-dash (Tim universal flag)
//   - Subtract 1 if subject exceeds 6 words (composer rule violation)
//   - Subtract 1 if subject is empty / < 2 words
// Floor at 0.
//
// Tiebreak: prefer the FIRST candidate (LLM tends to put its preferred subject
// first when asked for two — empirical from prior best-of-N work).

export interface SubjectScore {
  score: number;
  hits: string[];
}

export function scoreSubject(subject: string): SubjectScore {
  const s = (subject || '').trim();
  const hits: string[] = [];
  let score = 5;

  if (!s) {
    return { score: 0, hits: ['empty subject'] };
  }
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) {
    hits.push(`only ${wordCount} word(s)`);
    score -= 1;
  }
  if (wordCount > 6) {
    hits.push(`${wordCount} words (max 6)`);
    score -= 1;
  }
  if (/[—–]/.test(s)) {
    hits.push('em/en-dash');
    score -= 2;
  }
  for (const b of ALL_BANNED) {
    if (b.pattern.test(s)) {
      hits.push(`banned: ${b.label}`);
      score -= 1;
    }
  }
  return { score: Math.max(0, score), hits };
}

/**
 * Pick the higher-scoring subject from two candidates. Ties go to subjectA
 * (the first candidate). Returns { winner, loser, winnerScore, loserScore }.
 *
 * If subjectB is empty/missing, returns subjectA as winner with no loser.
 */
export function pickSubjectWinner(
  subjectA: string,
  subjectB: string | undefined,
): {
  winner: string;
  loser: string | undefined;
  winnerScore: number;
  loserScore: number | undefined;
} {
  const a = (subjectA || '').trim();
  const b = (subjectB || '').trim();
  if (!b) {
    const sa = scoreSubject(a);
    return { winner: a, loser: undefined, winnerScore: sa.score, loserScore: undefined };
  }
  const sa = scoreSubject(a);
  const sb = scoreSubject(b);
  if (sb.score > sa.score) {
    return { winner: b, loser: a, winnerScore: sb.score, loserScore: sa.score };
  }
  return { winner: a, loser: b, winnerScore: sa.score, loserScore: sb.score };
}

/**
 * Render a company-name-lock instruction for the composer prompt.
 */
export function companyNameLockPromptBlock(company: string): string {
  return `## COMPANY NAME LOCK (CRITICAL)

The prospect's company is **${company}**. Use EXACTLY that string if you reference the company. The substrate may know:
- Parent companies (subsidiaries roll up to a holding co)
- Legal entity names ("Inc.", "LLC", "Cooperative")
- Brand aliases (formerly-known-as names)

**You MUST NOT substitute any of these for "${company}".** A cold prospect reading the wrong company name immediately loses trust. The Andrew/UECI case (CSV said "United Fiber", substrate knew parent was "UECI", composer wrote "Andrew at UECI") almost shipped — closes credibility before sentence 2.

If you can frame the opener industry-wide WITHOUT naming the company, that's also fine — just don't introduce a wrong name.`;
}
