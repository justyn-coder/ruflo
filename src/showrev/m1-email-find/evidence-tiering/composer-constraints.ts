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
