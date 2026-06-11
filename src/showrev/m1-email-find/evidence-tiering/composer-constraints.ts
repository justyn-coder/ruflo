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
// Ungrounded geographic / industry-wide claims (Fix 2 — composer-prompt-rule 2026-06-10)
// ----------------------------------------------------------------------------
// Composer reaches for these forms when company-specific substrate is thin.
// The Tier-3 hallucination judge catches them, but soft instructions in the
// prompt don't reliably block them (operator directive: "expunge > instruction").
// These are the SPECIFIC failure-mode patterns observed in v2-mq7nti2t flagged
// prospects (Anthem "Idaho's terrain", Azimuth "NJ firms hitting same wall",
// BAM Broadband "Colorado operators pushing BEAD").
// Composer is still free to write COMPANY-SPECIFIC claims with geography
// (e.g., "Anthem Broadband's Idaho deployment" — that's grounded). What's banned
// is GENERIC industry-wide patterns asserted as fact.
const GEOGRAPHIC_GUARDS: Array<{ pattern: RegExp; label: string }> = [
  // "Idaho's terrain", "California's market", "Texas's landscape"
  { pattern: /\b[A-Z][a-z]+'s\s+(?:terrain|landscape|markets?|operators?|firms?|providers?|broadband|infrastructure|regulators?|builds?|deployments?|networks?|programs?|projects?)\b/, label: 'UNGROUNDED GEOGRAPHIC: "{State}\'s {noun}" — only valid if USE_DIRECTLY substrate has this geographic detail. Use COMPANY-specific framing instead.' },
  // "fiber engineering firms in NJ", "operators in Colorado", "broadband providers in CA"
  { pattern: /\b(?:fiber\s+)?(?:engineering\s+|broadband\s+|telecom\s+)?(?:firms?|operators?|providers?|carriers?|telecoms?|builds?|deployments?|networks?|programs?|projects?)\s+in\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[A-Z]{2})\b/i, label: 'UNGROUNDED GEOGRAPHIC: "{firms/operators/providers/builds/deployments} in {state/region}" — only valid if USE_DIRECTLY substrate has this geographic detail.' },
  // "Colorado operators", "Texas firms", "Idaho providers", "California broadband", "Colorado builds", "Idaho deployments"
  { pattern: /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\s+(?:operators?|firms?|providers?|carriers?|broadband(?:\s+providers?)?|fiber(?:\s+operators?)?|telecoms?|engineering\s+firms?|builds?|deployments?|networks?|programs?|projects?|BEAD(?:\s+awards?)?)\b/i, label: 'UNGROUNDED GEOGRAPHIC: "{State} {operators/firms/providers/builds/deployments/networks}" — only valid if USE_DIRECTLY substrate has this geographic detail.' },
  // "rural builds at this scale", "urban deployments", "regional FTTH programs" — adjective + plural noun with no state name (still likely ungrounded)
  { pattern: /\b(?:rural|urban|regional|nationwide|countrywide|multi[\s-]?state|cross[\s-]?state)\s+(?:builds?|deployments?|operators?|firms?|providers?|networks?|FTTH|fiber\s+(?:operators?|firms?|deployments?)|programs?|projects?|BEAD\s+(?:awards?|builds?))\s+(?:at\s+(?:this\s+|that\s+)?scale|in\s+(?:[A-Z][a-z]+|[A-Z]{2})|hit(?:ting)?|fac(?:ing|e)|push(?:ing|ed)|build(?:ing)?\s+toward)/i, label: 'UNGROUNDED CATEGORICAL: "{adjective} {builds/operators/etc.} at scale/facing/pushing" — broad-category claim without substrate. Use company-specific framing instead.' },
];

// ----------------------------------------------------------------------------
// Cold-cohort guards (Phase A — composer fix 2026-06-10)
// ----------------------------------------------------------------------------
// Patterns the composer reaches for when prompted with post-show / follow-up
// framing. For cold prospects (P2 attendee list, NOT booth visitors), every
// one of these is a fabrication: no meeting happened, no conversation
// happened, the prospect was never at our booth. The hallucination judge does
// NOT catch these (it looks for unsupported factual claims, not relationship
// claims), so the safety net lives here.
//
// SCOPE: only fires when leadType === 'cold' (passed by caller). Warm prospects
// (booth visitors) can legitimately use this language and pass leadType='warm'
// to skip these guards.
//
// Triggering examples observed in v2-mq8p* run (7 prospects):
//   - Aimee Linn (Bonfire Fiber): "good meeting you at Fiber Connect"
//   - Chip Proctor (Altamaha EMC): "good meeting you at Fiber Connect. After that..."
//   - Bryan Moriarty (Blue Streak): "good to meet you at Fiber Connect, after we parted ways"
//   - Anthony Brandt (PC Telcom): "good to meet you briefly at Fiber Connect"
//   - Denys Pihur (Axon Fiber): "good briefly meeting at Fiber Connect"
//   - Jason Miller (Glass Lab): "good connecting at Fiber Connect"
//   - Linda Richardson (Blue Stream): "great meeting you at Fiber Connect"
const COLD_COHORT_GUARDS: Array<{ pattern: RegExp; label: string }> = [
  // "good meeting you" / "good to meet you" / "good connecting" / "good catching up" / "good to see you"
  { pattern: /\bgood\s+(?:meeting|to\s+meet|to\s+see|connecting|catching\s+up|briefly\s+meeting)\s+(?:you|with\s+you|again|briefly)/i, label: 'COLD-COHORT: warm meeting opener ("good meeting/to meet/connecting you") — no prior meeting occurred' },
  // "great meeting you" / "great to meet you" / etc.
  { pattern: /\bgreat\s+(?:meeting|to\s+meet|to\s+see|connecting|catching\s+up)\s+(?:you|with\s+you|again)/i, label: 'COLD-COHORT: warm meeting opener ("great meeting/to meet/connecting you") — no prior meeting occurred' },
  // "nice meeting you" / "nice to meet you" / "nice chatting"
  { pattern: /\bnice\s+(?:meeting|to\s+meet|chatting|to\s+see)\s+(?:you|with\s+you)/i, label: 'COLD-COHORT: warm meeting opener ("nice meeting/to meet you") — no prior meeting occurred' },
  // "at Fiber Connect" (show-referent — only valid for booth visitors)
  { pattern: /\bat\s+Fiber\s+Connect\b/i, label: 'COLD-COHORT: show-referent ("at Fiber Connect") — cold prospects did not attend the booth' },
  // "at the booth" / "at our booth"
  { pattern: /\bat\s+(?:the\s+|our\s+)?booth\b/i, label: 'COLD-COHORT: booth-referent ("at the/our booth") — cold prospects did not visit the booth' },
  // "at the show"
  { pattern: /\bat\s+the\s+show\b/i, label: 'COLD-COHORT: show-referent ("at the show") — cold prospects did not attend' },
  // "after we (parted ways|crossed paths|spoke|talked|met|chatted)"
  { pattern: /\bafter\s+we\s+(?:parted\s+ways|crossed\s+paths|spoke|talked|met|chatted|connected)\b/i, label: 'COLD-COHORT: prior-conversation referent ("after we parted/crossed paths/spoke") — no prior conversation occurred' },
  // "since we (spoke|met|talked)"
  { pattern: /\bsince\s+(?:we\s+)?(?:spoke|met|talked|chatted)\b/i, label: 'COLD-COHORT: prior-conversation referent ("since we spoke/met") — no prior conversation occurred' },
  // "thanks for stopping by" / "thanks for visiting" / "thanks for the chat"
  { pattern: /\bthanks?\s+for\s+(?:stopping\s+by|visiting|the\s+chat|catching|coming\s+by)\b/i, label: 'COLD-COHORT: thanks-for-visit ("thanks for stopping by/visiting") — no visit occurred' },
  // "stopped by (the/our) booth"
  { pattern: /\bstopped?\s+by\s+(?:the\s+|our\s+)?booth\b/i, label: 'COLD-COHORT: booth-visit referent ("stopped by the booth") — no visit occurred' },
  // "following up on/after our conversation/meeting/chat/Fiber Connect/show"
  { pattern: /\bfollowing\s+up\s+(?:on|after)\s+(?:our|the|Fiber\s+Connect|the\s+show)\s*(?:conversation|meeting|chat|call|exchange|discussion|note)?/i, label: 'COLD-COHORT: post-conversation framing ("following up on our conversation/meeting") — no prior conversation occurred' },
  // "exchanged (business cards|cards|contact info)"
  { pattern: /\bexchanged\s+(?:business\s+)?(?:cards?|contact\s+info|info|details)\b/i, label: 'COLD-COHORT: card-exchange referent ("exchanged cards") — no exchange occurred' },
  // "post-show"
  { pattern: /\bpost[-\s]?show\b/i, label: 'COLD-COHORT: post-show referent — cold prospects did not attend' },
  // "show floor"
  { pattern: /\bshow\s+floor\b/i, label: 'COLD-COHORT: show-floor referent — cold prospects were not on the show floor' },
  // "at Gaylord Palms" / "Music City Center" / specific venue
  { pattern: /\bat\s+(?:the\s+)?(?:Gaylord\s+Palms|Music\s+City\s+Center)\b/i, label: 'COLD-COHORT: venue-specific referent — cold prospects did not attend the venue' },
];

// ----------------------------------------------------------------------------
// Combined blacklist (universal — applies to ALL prospects)
// ----------------------------------------------------------------------------

export const ALL_BANNED: Array<{ pattern: RegExp; label: string; category: string }> = [
  ...AI_TELLS.map(p => ({ ...p, category: 'ai_tell' })),
  ...TIM_KILL_LIST.map(p => ({ ...p, category: 'tim_kill' })),
  ...PRODUCT_GUARDS.map(p => ({ ...p, category: 'product_guard' })),
  ...OFFSHORE_GUARDS.map(p => ({ ...p, category: 'offshore' })),
  ...GEOGRAPHIC_GUARDS.map(p => ({ ...p, category: 'geographic_guard' })),
];

/**
 * Check body + subject for banned phrases. Returns labels of any matches.
 * Empty array = clean.
 *
 * @param leadType - 'cold' (default, safe) applies cold-cohort guards too.
 *                   'warm' skips cold-cohort guards (booth visitors can use warm
 *                   meeting language legitimately).
 */
export function checkBannedPhrases(body: string, subject: string, leadType: 'cold' | 'warm' = 'cold'): string[] {
  const corpus = `${subject} ${body}`;
  const universal = ALL_BANNED.filter(b => b.pattern.test(corpus)).map(b => b.label);
  if (leadType === 'cold') {
    const coldHits = COLD_COHORT_GUARDS.filter(b => b.pattern.test(corpus)).map(b => b.label);
    return [...universal, ...coldHits];
  }
  return universal;
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

**Ungrounded geographic / industry-wide claims (Tier-1 violation — composer is rejected if any of these appear unless USE_DIRECTLY substrate has matching geographic detail):**
${GEOGRAPHIC_GUARDS.map(p => `- ${p.label}`).join('\n')}

**RULE (ungrounded geographic):** You may write COMPANY-specific claims with geography ("Anthem Broadband's Idaho deployment" — grounded by USE_DIRECTLY about Anthem). You may NOT write industry-wide / state-wide / regional patterns as fact unless your substrate explicitly supports that geographic granularity. If substrate is thin on the company's region, use persona-frame ("for operators at this scale") instead of fake-specific geography.

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

/**
 * Deterministic CTA selector — hash prospect identity → pick 1-of-4 from bank.
 *
 * Replaces "LLM picks CTA freely" which anchor-biased to option #1 every time
 * (caught by operator E2E test 2026-06-09 — every email had identical Para 3).
 *
 * Same pattern as P.S. variant rotation in influence.ts. Deterministic =
 * same prospect always gets the same CTA across re-runs.
 */
export function selectCTAForProspect(
  icpType: 'fiber_operator' | 'ae_firm',
  firstName: string,
  lastName: string,
  company: string,
): string {
  const lib = ICP_CTA_OPTIONS[icpType] || ICP_CTA_OPTIONS.fiber_operator;
  if (lib.length === 0) return '';
  const key = `${firstName}-${lastName}-${company}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % lib.length;
  return lib[idx];
}

export function ctaLibraryPromptBlock(
  icpType: 'fiber_operator' | 'ae_firm',
  prospectFirstName?: string,
  prospectLastName?: string,
  prospectCompany?: string,
): string {
  const lib = ICP_CTA_OPTIONS[icpType] || ICP_CTA_OPTIONS.fiber_operator;
  // If prospect identity supplied, pin to deterministic selection. Else
  // fall back to free pick (used by tests).
  if (prospectFirstName && prospectLastName && prospectCompany) {
    const chosen = selectCTAForProspect(icpType, prospectFirstName, prospectLastName, prospectCompany);
    return `## CTA QUESTION — assigned to this prospect (use VERBATIM or with minor adaptation)

The diagnostic question for this email is:
"${chosen}"

Slight adaptation allowed (replace generic "your team" with role-specific terms, swap "build schedule" for "construction window" if it flows better). NOT allowed: picking a different question, inventing a new one, or asking two questions.`;
  }
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
// AI-detection signal checks (DL-199, research-validated)
// ----------------------------------------------------------------------------
//
// Three additional Tier-1 mechanical violations added per DL-199 open loop
// (2026-06-09). Each check targets a research-validated AI-writing fingerprint
// that classifiers like GPTZero / Originality.ai weight heavily.
//
// Goal: trip these as Tier 1 mechanical violations in the same compose retry
// loop as banned phrases + numeric anchors so they cost retries (cheap) rather
// than ship and burn judge cycles later.

/**
 * Check 1 — Participial-clause density.
 *
 * Research basis (DL-199): Present-participial sentence openers ("Building
 * fiber networks...", "Growing through M&A...", "Operating at scale...")
 * occur at 2-5x human baseline rate in LLM-generated business prose per
 * PNAS 2025 ("Stylometric Fingerprints of LLM Output"). Human writers use
 * them sparingly; LLMs lean on them as a rhythm crutch.
 *
 * Rule: flag if MORE than 1 sentence in the body opens with a present
 * participle (-ing word starting a sentence, not embedded mid-clause).
 *
 * Returns violation string if >1 such opener, else null.
 */
export function checkParticipialDensity(body: string): string | null {
  const sentences = body
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Skip nouns that happen to end in -ing (false positives like "Nothing
  // changes...", "Morning standups...", "King's Crossing...").
  const STOPWORD_ING = new Set([
    'nothing', 'something', 'anything', 'everything', 'morning', 'evening',
    'king', 'thing', 'spring', 'string', 'ring', 'wing', 'sing',
  ]);

  let participialOpeners = 0;
  const examples: string[] = [];
  for (const s of sentences) {
    const cleaned = s.replace(/^[\s"'“‘\(\[\-—–]+/, '');
    const firstWord = cleaned.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
    if (firstWord.length >= 5 && firstWord.endsWith('ing') && !STOPWORD_ING.has(firstWord)) {
      participialOpeners++;
      examples.push(firstWord);
    }
  }

  if (participialOpeners > 1) {
    return `Participial-opener density: ${participialOpeners} sentences open with -ing (${examples.join(', ')}) — PNAS 2025 AI-tell, max 1 per body`;
  }
  return null;
}

/**
 * Check 2 — Sentence-length variance (low variance = AI tell).
 *
 * Research basis (DL-199): Human writing shows ~38% coefficient-of-variation
 * in sentence length; LLM output averages ~12% (Stanford 2023, "Detecting
 * Machine-Generated Text"). LLMs produce sentences clustered around a target
 * length; humans mix short punches with longer clauses.
 *
 * Rule: flag if standard deviation of sentence word counts is < 5 words
 * across the body. (5w std-dev is a conservative threshold — too-uniform
 * pacing is the signature, regardless of absolute mean length.)
 *
 * Only applies when there are at least 3 sentences (variance is unstable
 * below that).
 *
 * Returns violation string if std-dev < 5w, else null.
 */
export function checkSentenceLengthVariance(body: string): string | null {
  const sentences = body
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length < 3) return null;

  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev < 5) {
    return `Sentence-length variance: std-dev ${stdDev.toFixed(1)}w across ${sentences.length} sentences (mean ${mean.toFixed(1)}w) — too uniform, Stanford 2023 AI signature, need ≥5w std-dev`;
  }
  return null;
}

/**
 * Check 3 — Echoed sentence structures.
 *
 * Research basis (DL-199): The VERMILLION Framework marker 2 catches adjacent
 * sentences with mirrored grammatical openings — the same first 2-word pattern
 * repeated back-to-back (e.g., "At that scale, ..." followed by "At that
 * pace, ..."). Humans vary syntactic shape between adjacent sentences; LLMs
 * mirror, often unconsciously, when listing parallel ideas.
 *
 * Rule: flag if ANY pair of adjacent sentences in the body shares the same
 * first 2 words (case-insensitive, punctuation-stripped). Both must be ≥4
 * words long to count (otherwise short interjections like "Yes, and..." +
 * "Yes, but..." trigger false positives).
 *
 * Returns violation string with the offending pattern, else null.
 */
export function checkEchoedStructures(body: string): string | null {
  const sentences = body
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length < 2) return null;

  const firstTwoWords = (s: string): string => {
    const cleaned = s.replace(/^[\s"'“‘\(\[\-—–]+/, '').toLowerCase();
    const tokens = cleaned.split(/\s+/).map(t => t.replace(/[^a-z]/g, '')).filter(Boolean);
    if (tokens.length < 2) return '';
    return `${tokens[0]} ${tokens[1]}`;
  };

  for (let i = 1; i < sentences.length; i++) {
    const prevLen = sentences[i - 1].split(/\s+/).filter(Boolean).length;
    const curLen = sentences[i].split(/\s+/).filter(Boolean).length;
    if (prevLen < 4 || curLen < 4) continue;
    const prevOpen = firstTwoWords(sentences[i - 1]);
    const curOpen = firstTwoWords(sentences[i]);
    if (prevOpen && prevOpen === curOpen) {
      return `Echoed structure: adjacent sentences both open with "${prevOpen}..." — VERMILLION marker 2, vary syntactic shape`;
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Flesch-Kincaid reading-age check (peer-level fiber copy reads ~8-10th grade)
// ----------------------------------------------------------------------------
//
// Above grade 12 = "AI cosplaying as expert" tell. Real fiber AEs write at
// 8-10 because that's how peers talk to peers — short sentences, plain words,
// concrete nouns. Multi-clause sentences with latinate verbs ("utilize",
// "leverage", "facilitate") shoot the grade above 12 fast.
//
// Formula (Flesch-Kincaid Grade Level):
//   0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
//
// Pure math, no API. Syllable count is approximated via vowel-group heuristic
// — good enough for English prose; exact dictionary lookup not needed because
// we only care about gross grade-level (8 vs 14, not 8.2 vs 8.7).

const READING_AGE_CEILING = 12;

/**
 * Approximate syllable count for an English word via vowel-group heuristic.
 *
 * Rules:
 *   - Strip non-letters
 *   - Count groups of consecutive vowels (a/e/i/o/u/y) as 1 syllable each
 *   - Subtract 1 for silent trailing 'e' (when preceded by a consonant and
 *     the word has more than one vowel group)
 *   - Trailing 'le' preceded by a consonant counts as its own syllable
 *   - Minimum 1 syllable for any non-empty word
 *
 * Not perfect (won't always catch "fire" = 1 vs "fired" = 1, or "every" = 2
 * vs 3), but median error ~5% — fine for grade-level estimation.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  // Count vowel groups
  const groups = w.match(/[aeiouy]+/g) || [];
  let count = groups.length;
  // Silent trailing 'e' adjustment
  if (count > 1 && /[^aeiouy]e$/.test(w)) count -= 1;
  // Trailing "le" preceded by consonant is its own syllable ("table" = 2)
  if (/[^aeiouy]le$/.test(w) && w.length > 2) count = Math.max(count, 2);
  return Math.max(1, count);
}

/**
 * Compute Flesch-Kincaid Grade Level for a body of text.
 *
 * Returns 0 if the body has no usable words or sentences (defensive — we
 * don't want a zero-divide to fail-open a violation check).
 */
export function fleschKincaidGrade(body: string): number {
  // Strip URLs first — they bloat syllable count without contributing to readability
  const stripped = body.replace(URL_PATTERN, '').trim();
  if (!stripped) return 0;

  // Sentence count: split on terminal punctuation
  const sentences = stripped
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const sentenceCount = sentences.length;
  if (sentenceCount === 0) return 0;

  // Word count + syllable count
  const words = stripped
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z']/g, ''))
    .filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return 0;

  let syllableTotal = 0;
  for (const w of words) syllableTotal += countSyllables(w);

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableTotal / wordCount;
  return 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
}

/**
 * Citation gate — caught by DB integrity audit 2026-06-09: 225 of 343
 * composed emails had body_sentences with ZERO claim_ids (substrate collected
 * but never cited). Without citation linkage, we can't mechanically trace
 * factual claims back to evidence = hallucination risk.
 *
 * Rule: if the dossier has >=2 USE_DIRECTLY claims available AND the composed
 * body has zero claim_ids across all sentences → reject. Forces the LLM to
 * actually cite the substrate it was given.
 *
 * Persona-frame sentences (no specifics) are allowed to have empty claim_ids
 * — but if substrate was rich and we got zero cites, that's the LLM ignoring it.
 */
export function checkCitationCoverage(
  bodySentences: Array<{ text: string; claim_ids?: string[] }> | undefined,
  useDirectlyClaimCount: number,
): string | null {
  if (useDirectlyClaimCount < 2) return null; // not enough substrate to demand cites
  if (!bodySentences || bodySentences.length === 0) return null;
  const totalCites = bodySentences.reduce((acc, s) => acc + (s.claim_ids?.length || 0), 0);
  if (totalCites === 0) {
    return `Citation gate: dossier had ${useDirectlyClaimCount} USE_DIRECTLY claims but body has 0 claim_ids — every factual sentence must cite supporting evidence to prevent hallucination`;
  }
  return null;
}

/**
 * Tier 1 mechanical check — returns a violation string if reading grade
 * exceeds the ceiling (12 = college level). Null = clean.
 *
 * Target band 8-10 (peer-level fiber industry copy). 11-12 acceptable.
 * Above 12 = forced retry.
 */
export function checkReadingAge(body: string): string | null {
  const grade = fleschKincaidGrade(body);
  if (grade > READING_AGE_CEILING) {
    return `Reading age grade ${grade.toFixed(1)} exceeds ${READING_AGE_CEILING} ceiling — shorten sentences, swap latinate verbs for plain English (utilize→use, facilitate→help, demonstrate→show)`;
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
