/**
 * pattern-detector.ts
 *
 * Detects email patterns for a domain and generates ranked candidate
 * email addresses for a specific person. Pure TypeScript, no external deps.
 * All web-facing functions accept an injected fetchFn for testability.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type EmailPattern =
  | 'first.last'
  | 'flast'
  | 'firstl'
  | 'first'
  | 'last.first'
  | 'first_last'
  | 'firstlast'
  | 'lastf'
  | 'f.last'
  | 'initials'
  | 'unknown';

export interface PatternResult {
  pattern: EmailPattern;
  confidence: number; // 0-1
  source: string;
  sampleEmails?: string[];
}

export interface CandidateEmail {
  email: string;
  pattern: EmailPattern;
  rank: number; // 1 = most likely
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * B2B prevalence ordering — calibrated to fiber-telecom data.
 * Test data: flast=33%, first.last=33%, first=17%, firstl=4%.
 * Both flast and first.last are co-ranked #1.
 */
const PATTERN_PREVALENCE: Array<{ pattern: EmailPattern; weight: number }> = [
  { pattern: 'first.last', weight: 0.33 },
  { pattern: 'flast', weight: 0.33 },
  { pattern: 'first', weight: 0.15 },
  { pattern: 'firstlast', weight: 0.05 },
  { pattern: 'firstl', weight: 0.04 },
  { pattern: 'first_last', weight: 0.03 },
  { pattern: 'lastf', weight: 0.02 },
  { pattern: 'last.first', weight: 0.02 },
  { pattern: 'f.last', weight: 0.02 },
  { pattern: 'initials', weight: 0.01 },
];

/** Common nickname → formal name bidirectional map (telecom-relevant). */
const NICKNAME_MAP: Record<string, string[]> = {
  william: ['bill', 'will'],
  robert: ['bob', 'rob'],
  richard: ['dick', 'rich'],
  michael: ['mike'],
  james: ['jim'],
  thomas: ['tom'],
  daniel: ['dan'],
  christopher: ['chris'],
  timothy: ['tim'],
  matthew: ['matt'],
  elizabeth: ['liz', 'beth'],
  katherine: ['kate', 'kathy'],
  kathryn: ['kate', 'kathy', 'kath'],
  catherine: ['kate', 'cathy'],
  jennifer: ['jen'],
  jonathan: ['jon'],
  benjamin: ['ben'],
  nicholas: ['nick'],
  anthony: ['tony'],
  joseph: ['joe'],
  patrick: ['pat'],
  stephen: ['steve'],
  steven: ['steve'],
  edward: ['ed'],
  andrew: ['andy', 'drew'],
  alexander: ['alex'],
  lawrence: ['larry'],
  samuel: ['sam'],
  frederick: ['fred'],
  theodore: ['ted'],
  raymond: ['ray'],
  kenneth: ['ken'],
  gregory: ['greg'],
  phillip: ['phil'],
  philip: ['phil'],
  gerald: ['jerry'],
  donald: ['don'],
  harold: ['hal'],
  douglas: ['doug'],
  margaret: ['maggie', 'meg'],
  patricia: ['pat', 'trish'],
  deborah: ['deb'],
  rebecca: ['becca'],
  victoria: ['vicky'],
  christine: ['chris'],
  christina: ['chris'],
};

/** Reverse map: nickname → formal name(s). */
const REVERSE_NICKNAME: Record<string, string[]> = {};
for (const [formal, nicks] of Object.entries(NICKNAME_MAP)) {
  for (const nick of nicks) {
    if (!REVERSE_NICKNAME[nick]) REVERSE_NICKNAME[nick] = [];
    if (!REVERSE_NICKNAME[nick].includes(formal)) {
      REVERSE_NICKNAME[nick].push(formal);
    }
  }
}

/** SPF provider → likely default pattern. */
const SPF_PROVIDER_PATTERNS: Record<string, { pattern: EmailPattern; confidence: number }> = {
  'google': { pattern: 'first.last', confidence: 0.55 },
  'googlemail': { pattern: 'first.last', confidence: 0.55 },
  '_spf.google.com': { pattern: 'first.last', confidence: 0.55 },
  'microsoft': { pattern: 'first.last', confidence: 0.45 },
  'outlook': { pattern: 'first.last', confidence: 0.45 },
  'protection.outlook.com': { pattern: 'first.last', confidence: 0.45 },
};

/** Paths to scrape for email clues. */
const DISCOVERY_PATHS = ['/about', '/team', '/contact', '/leadership', '/our-team', '/about-us', '/people'];

// ─── Name Normalization ──────────────────────────────────────────────────────

/** Accent-folding map for Latin characters. */
const ACCENT_MAP: Record<string, string> = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ð': 'd', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o',
  'õ': 'o', 'ö': 'o', 'ø': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
  'ý': 'y', 'ÿ': 'y',
  'ā': 'a', 'ă': 'a', 'ą': 'a',
  'ć': 'c', 'ĉ': 'c', 'ċ': 'c', 'č': 'c',
  'ď': 'd', 'đ': 'd',
  'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
  'ĥ': 'h', 'ħ': 'h',
  'ĩ': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ı': 'i',
  'ĵ': 'j',
  'ķ': 'k',
  'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ł': 'l',
  'ń': 'n', 'ņ': 'n', 'ň': 'n',
  'ō': 'o', 'ŏ': 'o', 'ő': 'o',
  'ŕ': 'r', 'ŗ': 'r', 'ř': 'r',
  'ś': 's', 'ŝ': 's', 'ş': 's', 'š': 's',
  'ţ': 't', 'ť': 't', 'ŧ': 't',
  'ũ': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
  'ŵ': 'w',
  'ŷ': 'y',
  'ź': 'z', 'ż': 'z', 'ž': 'z',
};

function foldAccents(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ACCENT_MAP[ch] ?? ch;
  }
  return out;
}

/** Suffixes to strip from names. */
const SUFFIX_RE = /\b(jr\.?|sr\.?|iii|iv|ii|phd|md|esq|cpa)$/i;

/**
 * Normalize a name part into one or more email-safe variants.
 * Returns de-duplicated lowercase ASCII strings.
 */
export function normalizeNameForEmail(name: string): string[] {
  if (!name || !name.trim()) return [];

  let cleaned = name.trim().toLowerCase();

  // Strip suffixes
  cleaned = cleaned.replace(SUFFIX_RE, '').trim();
  // Strip trailing commas/periods left by suffix removal
  cleaned = cleaned.replace(/[,.\s]+$/, '');

  // Fold accents
  cleaned = foldAccents(cleaned);

  // Remove apostrophes (O'Brien → obrien)
  cleaned = cleaned.replace(/'/g, '');

  // Remove any remaining non-alpha, non-hyphen, non-space characters
  cleaned = cleaned.replace(/[^a-z\s-]/g, '');

  if (!cleaned) return [];

  const variants = new Set<string>();

  // Plain (spaces/hyphens collapsed)
  const plain = cleaned.replace(/[\s-]+/g, '');
  if (plain) variants.add(plain);

  // Hyphenated preserved
  if (cleaned.includes('-')) {
    variants.add(cleaned); // keep hyphen
    variants.add(cleaned.replace(/-/g, '')); // remove hyphen
    variants.add(cleaned.replace(/-/g, '.')); // replace hyphen with dot
  }

  // Multi-word (e.g. "Mary Jane" without hyphen)
  if (cleaned.includes(' ')) {
    const parts = cleaned.split(/\s+/);
    variants.add(parts.join('')); // maryjane
    variants.add(parts.join('-')); // mary-jane
    variants.add(parts.join('.')); // mary.jane
    // Also just first word (common for first names)
    if (parts[0]) variants.add(parts[0]);
  }

  // Remove empty strings
  variants.delete('');

  return [...variants];
}

/**
 * Get all name variants including nicknames for first name.
 * Returns primary variant first, then alternates.
 */
function getFirstNameVariants(firstName: string): string[] {
  const normalizations = normalizeNameForEmail(firstName);
  if (normalizations.length === 0) return [];

  const allVariants = new Set(normalizations);

  // Add nicknames for each normalization
  for (const norm of normalizations) {
    const baseForm = norm.replace(/[\s.-]/g, '');
    // Forward: formal → nicknames
    if (NICKNAME_MAP[baseForm]) {
      for (const nick of NICKNAME_MAP[baseForm]) {
        allVariants.add(nick);
      }
    }
    // Reverse: nickname → formal names
    if (REVERSE_NICKNAME[baseForm]) {
      for (const formal of REVERSE_NICKNAME[baseForm]) {
        allVariants.add(formal);
      }
    }
  }

  // Put primary normalization first
  const primary = normalizations[0];
  allVariants.delete(primary);
  return [primary, ...allVariants];
}

// ─── Pattern Inference ───────────────────────────────────────────────────────

/**
 * Build the local part for a given pattern from first/last name.
 * Returns null if the names are too short for the pattern.
 */
function buildLocalPart(pattern: EmailPattern, first: string, last: string): string | null {
  if (!first || !last) return null;
  switch (pattern) {
    case 'first.last': return `${first}.${last}`;
    case 'flast': return `${first[0]}${last}`;
    case 'firstl': return `${first}${last[0]}`;
    case 'first': return first;
    case 'last.first': return `${last}.${first}`;
    case 'first_last': return `${first}_${last}`;
    case 'firstlast': return `${first}${last}`;
    case 'lastf': return `${last}${first[0]}`;
    case 'f.last': return `${first[0]}.${last}`;
    case 'initials': return `${first[0]}${last[0]}`;
    default: return null;
  }
}

/**
 * Build initials from all name parts (first, middle, last).
 * "Wolfgang K Domschke" -> "wkd"
 */
function buildInitials(fullNameParts: string[]): string {
  return fullNameParts
    .map((p) => p.replace(/[^a-z]/g, ''))
    .filter((p) => p.length > 0)
    .map((p) => p[0])
    .join('');
}

/** All recognizable patterns. */
const ALL_PATTERNS: EmailPattern[] = [
  'first.last', 'flast', 'firstl', 'first', 'last.first',
  'first_last', 'firstlast', 'lastf', 'f.last', 'initials',
];

/**
 * Infer the email pattern from a single known email + known name.
 */
export function inferPattern(email: string, firstName: string, lastName: string): EmailPattern {
  const local = email.split('@')[0]?.toLowerCase();
  if (!local) return 'unknown';

  const firstVariants = getFirstNameVariants(firstName);
  const lastVariants = normalizeNameForEmail(lastName);

  if (firstVariants.length === 0 || lastVariants.length === 0) return 'unknown';

  // Try every combination of name variants against every pattern
  for (const first of firstVariants) {
    for (const last of lastVariants) {
      for (const pattern of ALL_PATTERNS) {
        const candidate = buildLocalPart(pattern, first, last);
        if (candidate && candidate === local) {
          return pattern;
        }
      }
    }
  }

  // Check full-name initials (e.g. "Wolfgang K Domschke" -> "wkd")
  const fullParts = `${firstName} ${lastName}`.toLowerCase().split(/\s+/);
  if (fullParts.length >= 2) {
    const initials = buildInitials(fullParts);
    if (initials.length >= 2 && initials === local) {
      return 'initials';
    }
  }

  return 'unknown';
}

/**
 * Infer the dominant pattern from multiple email samples at a domain.
 * Each sample can optionally include the person's name for better matching.
 * When names are not provided, uses structural heuristics.
 */
export function inferPatternFromSamples(
  emails: Array<{ email: string; firstName?: string; lastName?: string }>
): PatternResult {
  if (emails.length === 0) {
    return { pattern: 'unknown', confidence: 0, source: 'no samples provided' };
  }

  const patternCounts: Partial<Record<EmailPattern, number>> = {};
  const matched: string[] = [];

  for (const sample of emails) {
    let detected: EmailPattern = 'unknown';

    if (sample.firstName && sample.lastName) {
      detected = inferPattern(sample.email, sample.firstName, sample.lastName);
    } else {
      // Structural heuristics when we don't know the name
      detected = inferPatternFromStructure(sample.email);
    }

    if (detected !== 'unknown') {
      patternCounts[detected] = (patternCounts[detected] || 0) + 1;
      matched.push(sample.email);
    }
  }

  if (Object.keys(patternCounts).length === 0) {
    return {
      pattern: 'unknown',
      confidence: 0,
      source: 'no patterns matched from samples',
      sampleEmails: emails.map(e => e.email),
    };
  }

  // Find the most common pattern
  let bestPattern: EmailPattern = 'unknown';
  let bestCount = 0;
  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestPattern = pattern as EmailPattern;
    }
  }

  // Confidence: proportion of samples that matched the dominant pattern
  const confidence = Math.min(
    bestCount / emails.length + (emails.length >= 3 ? 0.1 : 0),
    1,
  );

  return {
    pattern: bestPattern,
    confidence: Math.round(confidence * 100) / 100,
    source: `inferred from ${bestCount}/${emails.length} sample emails`,
    sampleEmails: matched,
  };
}

/**
 * Structural heuristic: guess pattern from the shape of the local part
 * when we don't know the person's name.
 */
function inferPatternFromStructure(email: string): EmailPattern {
  const local = email.split('@')[0]?.toLowerCase();
  if (!local) return 'unknown';

  // Skip generic addresses
  const GENERIC = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'office', 'help', 'team', 'hr', 'jobs', 'press', 'media', 'marketing', 'billing', 'accounts', 'noreply', 'no-reply', 'webmaster', 'postmaster'];
  if (GENERIC.includes(local)) return 'unknown';

  // first.last (most distinctive: exactly one dot, both parts 2+ chars)
  if (/^[a-z]{2,}\.[a-z]{2,}$/.test(local)) return 'first.last';

  // first_last
  if (/^[a-z]{2,}_[a-z]{2,}$/.test(local)) return 'first_last';

  // f.last (single char dot word)
  if (/^[a-z]\.[a-z]{2,}$/.test(local)) return 'f.last';

  // Single word — ambiguous, could be first, flast, firstl, firstlast, etc.
  // Can't determine without name context
  return 'unknown';
}

// ─── Web Scraping Pattern Detection ──────────────────────────────────────────

/** Regex to extract email addresses from HTML/text. */
const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

/** Extract emails from raw HTML or text. */
function extractEmails(html: string, domain: string): string[] {
  const matches = html.match(EMAIL_RE) || [];
  const domainLower = domain.toLowerCase();

  // Filter to the target domain, deduplicate, exclude generic
  const GENERIC_PREFIXES = new Set([
    'info', 'contact', 'hello', 'support', 'sales', 'admin', 'office',
    'help', 'team', 'hr', 'jobs', 'press', 'media', 'marketing',
    'billing', 'accounts', 'noreply', 'no-reply', 'webmaster', 'postmaster',
  ]);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of matches) {
    const email = raw.toLowerCase();
    const [local, emailDomain] = email.split('@');
    if (!emailDomain || !local) continue;

    // Match domain (exact or subdomain)
    if (emailDomain !== domainLower && !emailDomain.endsWith('.' + domainLower)) continue;

    // Skip generic
    if (GENERIC_PREFIXES.has(local)) continue;

    if (!seen.has(email)) {
      seen.add(email);
      result.push(email);
    }
  }

  return result;
}

/**
 * Detect email pattern by scraping common web pages for a domain.
 * Accepts injected fetch for testability.
 */
export async function detectPatternFromWeb(
  domain: string,
  fetchFn: (url: string) => Promise<string>,
): Promise<PatternResult | null> {
  const allEmails: string[] = [];
  const triedPaths: string[] = [];

  const base = domain.startsWith('http') ? domain : `https://${domain}`;

  for (const path of DISCOVERY_PATHS) {
    const url = `${base}${path}`;
    triedPaths.push(path);

    try {
      const html = await fetchFn(url);
      const emails = extractEmails(html, domain);
      allEmails.push(...emails);
    } catch {
      // Page didn't load — skip
    }
  }

  if (allEmails.length === 0) {
    return null;
  }

  // Deduplicate
  const unique = [...new Set(allEmails)];

  // Infer pattern from structural heuristics (no names available from web)
  const result = inferPatternFromSamples(unique.map(e => ({ email: e })));

  return {
    ...result,
    source: `web scrape: found ${unique.length} email(s) on ${triedPaths.filter((_, i) => i < DISCOVERY_PATHS.length).join(', ')}`,
    sampleEmails: unique,
  };
}

// ─── SPF Record Analysis ─────────────────────────────────────────────────────

/**
 * Analyze SPF record text to guess email provider and likely pattern.
 * SPF record should be the raw TXT value (e.g. "v=spf1 include:_spf.google.com ~all").
 */
export function analyzeSpfRecord(spfText: string): PatternResult | null {
  if (!spfText) return null;

  const lower = spfText.toLowerCase();

  for (const [keyword, info] of Object.entries(SPF_PROVIDER_PATTERNS)) {
    if (lower.includes(keyword)) {
      return {
        pattern: info.pattern,
        confidence: info.confidence,
        source: `SPF record contains "${keyword}" — likely ${keyword.includes('google') ? 'Google Workspace' : 'Microsoft 365'}`,
      };
    }
  }

  return null;
}

// ─── Candidate Generation ────────────────────────────────────────────────────

/**
 * Generate ranked candidate email addresses for a person at a domain.
 *
 * If knownPattern is provided, returns a single high-confidence candidate.
 * Otherwise returns candidates for all patterns, ranked by B2B prevalence.
 */
export function generateCandidates(
  firstName: string,
  lastName: string,
  domain: string,
  knownPattern?: EmailPattern,
): CandidateEmail[] {
  const firstVariants = getFirstNameVariants(firstName);
  const lastVariants = normalizeNameForEmail(lastName);

  if (firstVariants.length === 0 || lastVariants.length === 0) return [];

  const primaryFirst = firstVariants[0];
  const primaryLast = lastVariants[0];
  const domainLower = domain.toLowerCase().replace(/^@/, '');

  // Known pattern: generate for primary AND nickname variants (Fix 9)
  if (knownPattern && knownPattern !== 'unknown') {
    const candidates: CandidateEmail[] = [];
    const seen = new Set<string>();
    let rank = 1;

    // Primary name first
    const local = buildLocalPart(knownPattern, primaryFirst, primaryLast);
    if (local) {
      const email = `${local}@${domainLower}`;
      seen.add(email);
      candidates.push({ email, pattern: knownPattern, rank: rank++ });
    }

    // Nickname variants for the known pattern
    for (const variant of firstVariants.slice(1)) {
      const altLocal = buildLocalPart(knownPattern, variant, primaryLast);
      if (altLocal) {
        const email = `${altLocal}@${domainLower}`;
        if (!seen.has(email)) {
          seen.add(email);
          candidates.push({ email, pattern: knownPattern, rank: rank++ });
        }
      }
    }

    // Initials candidate if known pattern is initials
    if (knownPattern === 'initials') {
      const fullParts = `${firstName} ${lastName}`.toLowerCase().split(/\s+/);
      const initials = buildInitials(fullParts);
      if (initials.length >= 2) {
        const email = `${initials}@${domainLower}`;
        if (!seen.has(email)) {
          seen.add(email);
          candidates.push({ email, pattern: 'initials', rank: rank++ });
        }
      }
    }

    return candidates;
  }

  // Generate all pattern candidates, primary names first
  const candidates: CandidateEmail[] = [];
  const seen = new Set<string>();
  let rank = 1;

  // Pass 1: all patterns with primary names
  for (const { pattern } of PATTERN_PREVALENCE) {
    if (pattern === 'initials') continue; // handle separately below
    const local = buildLocalPart(pattern, primaryFirst, primaryLast);
    if (local) {
      const email = `${local}@${domainLower}`;
      if (!seen.has(email)) {
        seen.add(email);
        candidates.push({ email, pattern, rank: rank++ });
      }
    }
  }

  // Pass 2: nickname variants for ALL high-prevalence patterns (Fix 9)
  // Use all patterns where nickname could change the output
  const nicknamePatterns: EmailPattern[] = [
    'first.last', 'flast', 'first', 'firstlast', 'firstl',
    'first_last', 'last.first', 'f.last', 'lastf',
  ];
  for (const variant of firstVariants.slice(1)) { // skip primary, already used
    for (const pattern of nicknamePatterns) {
      const local = buildLocalPart(pattern, variant, primaryLast);
      if (local) {
        const email = `${local}@${domainLower}`;
        if (!seen.has(email)) {
          seen.add(email);
          candidates.push({ email, pattern, rank: rank++ });
        }
      }
    }
  }

  // Pass 3: hyphenated last name variants for top patterns
  if (lastVariants.length > 1) {
    for (const lastVariant of lastVariants.slice(1)) {
      for (const { pattern } of PATTERN_PREVALENCE.slice(0, 3)) { // top 3 patterns only
        if (pattern === 'initials') continue;
        const local = buildLocalPart(pattern, primaryFirst, lastVariant);
        if (local) {
          const email = `${local}@${domainLower}`;
          if (!seen.has(email)) {
            seen.add(email);
            candidates.push({ email, pattern, rank: rank++ });
          }
        }
      }
    }
  }

  // Pass 4: initials — full name parts (Fix 10)
  const fullParts = `${firstName} ${lastName}`.toLowerCase().split(/\s+/);
  const initials = buildInitials(fullParts);
  if (initials.length >= 2) {
    const email = `${initials}@${domainLower}`;
    if (!seen.has(email)) {
      seen.add(email);
      candidates.push({ email, pattern: 'initials', rank: rank++ });
    }
  }
  // Also two-letter initials (first + last only, no middle)
  if (fullParts.length > 2) {
    const shortInitials = `${fullParts[0][0]}${fullParts[fullParts.length - 1][0]}`;
    if (shortInitials !== initials) {
      const email = `${shortInitials}@${domainLower}`;
      if (!seen.has(email)) {
        seen.add(email);
        candidates.push({ email, pattern: 'initials', rank: rank++ });
      }
    }
  }

  return candidates;
}

// ─── DMARC Pattern Detection ────────────────────────────────────────────────

/**
 * Extract email pattern clues from DMARC rua=/ruf= reporting addresses.
 *
 * Many companies include a real person's email as the DMARC aggregate
 * report destination. For example:
 *   _dmarc.bookereng.com TXT "v=DMARC1; p=none; rua=mailto:spencer@bookereng.com"
 *
 * This reveals both the domain's email infrastructure AND the naming pattern.
 * The caller should run found emails through `inferPattern()` if a known
 * person at the domain can be matched.
 */
export async function detectPatternFromDmarc(domain: string): Promise<PatternResult | null> {
  try {
    const { promises: dns } = await import('dns');
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map(r => r.join('')).join(' ');

    // Extract rua= and ruf= email addresses
    const emailMatches = flat.match(/(?:rua|ruf)=mailto:([^;,\s]+)/gi) || [];
    const emails: string[] = [];
    for (const match of emailMatches) {
      const email = match.replace(/^(?:rua|ruf)=mailto:/i, '').trim();
      if (email.includes('@') && email.split('@')[1] === domain) {
        emails.push(email.toLowerCase());
      }
    }

    if (emails.length === 0) return null;

    // We found real email(s) at this domain from DMARC records.
    // Try structural inference on the found emails.
    const structuralResult = inferPatternFromSamples(emails.map(e => ({ email: e })));

    if (structuralResult.pattern !== 'unknown') {
      return {
        pattern: structuralResult.pattern,
        confidence: Math.min(structuralResult.confidence + 0.1, 0.85),
        source: `dmarc-rua: inferred "${structuralResult.pattern}" from ${emails.join(', ')}`,
        sampleEmails: emails,
      };
    }

    // Structural inference didn't match — return the raw emails for the caller
    // to match against known people at the domain via inferPattern()
    return {
      pattern: 'unknown',
      confidence: 0.6,
      source: 'dmarc-rua',
      sampleEmails: emails,
    };
  } catch {
    return null;
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface DetectionInput {
  domain: string;
  knownEmails?: Array<{ email: string; firstName?: string; lastName?: string }>;
  spfRecord?: string;
  fetchFn?: (url: string) => Promise<string>;
}

export interface DetectionOutput {
  domain: string;
  patterns: PatternResult[];
  bestPattern: PatternResult | null;
}

/**
 * Run all detection approaches and merge results.
 *
 * Priority order:
 * 1. Known emails (highest confidence when names are known)
 * 2. Web scraping (real emails found on site)
 * 3. DMARC rua=/ruf= email extraction (DNS-based, no HTTP needed)
 * 4. SPF analysis (weakest signal, provider heuristic only)
 *
 * Returns all pattern signals plus the single best pattern.
 */
export async function detectPattern(input: DetectionInput): Promise<DetectionOutput> {
  const patterns: PatternResult[] = [];

  // Approach 1: Known emails
  if (input.knownEmails && input.knownEmails.length > 0) {
    const result = inferPatternFromSamples(input.knownEmails);
    if (result.pattern !== 'unknown') {
      patterns.push({ ...result, source: `known emails: ${result.source}` });
    }
  }

  // Approach 2: Web scraping
  if (input.fetchFn) {
    try {
      const webResult = await detectPatternFromWeb(input.domain, input.fetchFn);
      if (webResult && webResult.pattern !== 'unknown') {
        patterns.push(webResult);
      }
    } catch {
      // Web detection failed — not fatal
    }
  }

  // Approach 3: DMARC rua=/ruf= emails (fallback when web scraping finds nothing)
  // DNS-only, no HTTP fetch needed — fast and reliable
  if (patterns.every(p => p.source.startsWith('known emails') || p.pattern === 'unknown')) {
    try {
      const dmarcResult = await detectPatternFromDmarc(input.domain);
      if (dmarcResult) {
        // If we have known people AND dmarc found emails, try to match
        if (dmarcResult.pattern === 'unknown' && dmarcResult.sampleEmails?.length && input.knownEmails?.length) {
          for (const sample of dmarcResult.sampleEmails) {
            for (const known of input.knownEmails) {
              if (known.firstName && known.lastName) {
                const matched = inferPattern(sample, known.firstName, known.lastName);
                if (matched !== 'unknown') {
                  patterns.push({
                    pattern: matched,
                    confidence: 0.75,
                    source: `dmarc-rua: matched "${matched}" via ${sample} against ${known.firstName} ${known.lastName}`,
                    sampleEmails: dmarcResult.sampleEmails,
                  });
                  break;
                }
              }
            }
            if (patterns.some(p => p.source.startsWith('dmarc-rua: matched'))) break;
          }
        }

        // If dmarc found a structural pattern on its own, keep it
        if (dmarcResult.pattern !== 'unknown') {
          patterns.push(dmarcResult);
        } else if (dmarcResult.sampleEmails?.length && !patterns.some(p => p.source.startsWith('dmarc-rua'))) {
          // Store even the unknown pattern — the sampleEmails are valuable
          patterns.push(dmarcResult);
        }
      }
    } catch {
      // DMARC detection failed — not fatal
    }
  }

  // Approach 4: SPF record
  if (input.spfRecord) {
    const spfResult = analyzeSpfRecord(input.spfRecord);
    if (spfResult) {
      patterns.push(spfResult);
    }
  }

  // Pick best pattern by confidence
  let bestPattern: PatternResult | null = null;
  for (const p of patterns) {
    if (!bestPattern || p.confidence > bestPattern.confidence) {
      bestPattern = p;
    }
  }

  return { domain: input.domain, patterns, bestPattern };
}
