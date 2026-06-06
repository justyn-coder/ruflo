/**
 * P2 Cold Prospect Processor — FC2026 Attendee List
 *
 * Steps:
 *   1. Load + parse attendee CSV and Focus 100 CSV
 *   2. Exclude Inorsa employees
 *   3. Exclude P1 companies (from sr_prospects in Supabase)
 *   4. Flag Focus 100 + classify ICP
 *   5. Deduplicate
 *   6. Generate summary report + write processed CSV
 *
 * Usage: npx tsx src/showrev/m1-email-find/p2-processor.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DATA_DIR = resolve(ROOT, 'data', 'showrev', 'p2-cold');
const ATTENDEE_CSV = resolve(DATA_DIR, 'fc2026-attendees-usa.csv');
const FOCUS_CSV = resolve(DATA_DIR, 'focus-100.csv');
const OUTPUT_CSV = resolve(DATA_DIR, 'p2-processed.csv');
const OUTPUT_MD = resolve(DATA_DIR, 'p2-summary.md');
const ENGINE_ENV = resolve(ROOT, '..', 'showrev', 'engine', '.env');

// ── Types ────────────────────────────────────────────────────────────────────

interface Attendee {
  fName: string;
  lName: string;
  company: string;
  role: string;
  state: string;
  country: string;
}

interface Focus100Entry {
  company: string;
  icpType: string; // e.g. "Fiber operator", "High-volume A&E firm"
}

interface ProcessedContact extends Attendee {
  isFocus100: boolean;
  focus100Match: string; // matched Focus 100 company name, or ''
  icpType: string;       // from Focus 100 or title-based classification
  titleClassification: 'likely-icp' | 'likely-non-icp' | 'executive' | 'unclassified';
  tier: 'A' | 'B' | 'C' | 'Skip';
  isDuplicate: boolean;
  isNearDuplicate: boolean;
  nearDuplicateOf: string;
}

// ── CSV Parsing ──────────────────────────────────────────────────────────────

/**
 * Parses CSV handling quoted fields with commas, newlines inside quotes,
 * and escaped quotes ("").
 */
function parseCSV(raw: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote or end of quoted field
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        current.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        current.push(field.trim());
        field = '';
        if (ch === '\r' && i + 1 < raw.length && raw[i + 1] === '\n') i++;
        i++;
        if (current.length > 0 && current.some(c => c.length > 0)) {
          rows.push(current);
        }
        current = [];
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last row
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.some(c => c.length > 0)) rows.push(current);
  }

  return rows;
}

function parseAttendeeCSV(path: string): Attendee[] {
  const raw = readFileSync(path, 'utf-8');
  const rows = parseCSV(raw);
  if (rows.length === 0) throw new Error(`Empty CSV: ${path}`);

  // Detect header
  const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colMap: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    if (header[i].includes('fname') || header[i] === 'firstname') colMap.fName = i;
    else if (header[i].includes('lname') || header[i] === 'lastname') colMap.lName = i;
    else if (header[i].includes('company') || header[i].includes('organization')) colMap.company = i;
    else if (header[i].includes('role') || header[i].includes('title') || header[i].includes('jobtitle')) colMap.role = i;
    else if (header[i] === 'state' || header[i].includes('stateregion')) colMap.state = i;
    else if (header[i] === 'country') colMap.country = i;
  }

  const attendees: Attendee[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    attendees.push({
      fName: row[colMap.fName ?? 0] ?? '',
      lName: row[colMap.lName ?? 1] ?? '',
      company: row[colMap.company ?? 2] ?? '',
      role: row[colMap.role ?? 3] ?? '',
      state: row[colMap.state ?? 4] ?? '',
      country: row[colMap.country ?? 5] ?? '',
    });
  }
  return attendees;
}

function parseFocus100CSV(path: string): Focus100Entry[] {
  const raw = readFileSync(path, 'utf-8');
  const rows = parseCSV(raw);
  if (rows.length === 0) throw new Error(`Empty CSV: ${path}`);

  // Detect header — expect at minimum: company name + icp type
  const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  let companyCol = 0;
  let typeCol = 1;
  for (let i = 0; i < header.length; i++) {
    if (header[i].includes('company') || header[i].includes('name') || header[i].includes('organization')) companyCol = i;
    if (header[i] === 'icp' || header[i].includes('type') || header[i].includes('category') || header[i].includes('segment')) typeCol = i;
  }

  const entries: Focus100Entry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const company = (row[companyCol] ?? '').trim();
    if (!company) continue;
    entries.push({
      company,
      icpType: (row[typeCol] ?? '').trim() || 'Unspecified',
    });
  }
  return entries;
}

// ── Env Parsing ──────────────────────────────────────────────────────────────

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`.env not found: ${path}`);
  const lines = readFileSync(path, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// ── Supabase REST ────────────────────────────────────────────────────────────

async function fetchP1Companies(sbUrl: string, sbKey: string): Promise<string[]> {
  const companies: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = `${sbUrl}/rest/v1/sr_prospects?select=company&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase fetch failed (${res.status}): ${err}`);
    }

    const data: { company: string }[] = await res.json();
    if (data.length === 0) break;

    for (const row of data) {
      if (row.company) companies.push(row.company);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Deduplicate
  const unique = [...new Set(companies)];
  return unique;
}

// ── Fuzzy Company Matching ───────────────────────────────────────────────────

const SUFFIXES = [
  'inc', 'incorporated', 'llc', 'llp', 'ltd', 'limited', 'corp', 'corporation',
  'co', 'company', 'group', 'holdings', 'enterprises', 'partners', 'lp',
  'plc', 'pllc', 'pa', 'pc', 'sa', 'sas', 'gmbh', 'ag', 'nv', 'bv',
  'the', 'international', 'intl',
];

function normalizeCompany(name: string): string {
  let n = name.toLowerCase().trim();
  // Replace & with and
  n = n.replace(/&/g, 'and');
  // Remove common punctuation
  n = n.replace(/[.,\-'"!()]/g, ' ');
  // Remove suffix words
  const words = n.split(/\s+/).filter(w => !SUFFIXES.includes(w));
  return words.join(' ').trim();
}

/**
 * Returns true if two company names are a fuzzy match.
 * Handles: casing, suffixes (Inc/LLC/etc.), & vs "and", punctuation.
 */
function companiesMatch(a: string, b: string): boolean {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Check if one contains the other (for cases like "ABC Corp" vs "ABC Corporation of America")
  if (na.length > 3 && nb.length > 3) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
}

/**
 * Builds a lookup set from a list of company names.
 * Returns both normalized names and a map back to original.
 */
function buildCompanyIndex(companies: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of companies) {
    index.set(normalizeCompany(c), c);
  }
  return index;
}

function findCompanyMatch(name: string, index: Map<string, string>): string | null {
  const normalized = normalizeCompany(name);
  if (!normalized) return null;

  // Exact normalized match
  if (index.has(normalized)) return index.get(normalized)!;

  // Substring match (both directions)
  for (const [key, original] of index) {
    if (key.length > 3 && normalized.length > 3) {
      if (key.includes(normalized) || normalized.includes(key)) return original;
    }
  }

  // Token-level match for short names (EPB, ISG, TEP, WSP)
  // If the index key is a single short token (<=4 chars), match if the attendee
  // company starts with that token or contains it as a standalone word
  const normTokens = normalized.split(/\s+/);
  for (const [key, original] of index) {
    const keyTokens = key.split(/\s+/);
    if (keyTokens.length === 1 && keyTokens[0].length <= 5) {
      // Short single-token name: match if attendee company starts with it
      if (normTokens[0] === keyTokens[0]) return original;
    }
    // First-token match: "epb" matches "epb broadband solutions", "epb fiber optics"
    if (keyTokens[0] === normTokens[0] && keyTokens[0].length >= 3) return original;
  }

  return null;
}

// ── Title Classification ─────────────────────────────────────────────────────

const ICP_TITLE_PATTERNS = [
  /\bengine/i, /\bdesign/i, /\bconstruct/i, /\bosp\b/i, /\bfiber\b/i,
  /\btelecom/i, /\bbroadband/i, /\bnetwork/i, /\bplant/i, /\boutside plant/i,
  /\bfield/i, /\bproject manag/i, /\bprogram manag/i, /\boperations/i,
  /\bgis\b/i, /\bsurvey/i, /\bpermitting/i, /\binfrastructure/i,
  /\bcivil/i, /\bunderground/i, /\baerial/i, /\bsplicer/i, /\btechnician/i,
  /\bestimator/i, /\bcad\b/i, /\bdrafter/i, /\bbim\b/i,
  /\bprocurement/i, /\bbusiness develop/i, /\baccount manag/i,
];

const NON_ICP_TITLE_PATTERNS = [
  /\bstudent/i, /\bintern\b/i, /\bmedia/i, /\bjournalist/i, /\breporter/i,
  /\bwriter/i, /\beditor\b/i, /\bphotograph/i, /\bvideograph/i,
  /\bmarketing\b/i, /\bsocial media/i, /\bcommunicat/i,
  /\bhuman resource/i, /\bhr\b/i, /\brecruit/i, /\btalent/i,
  /\blegal/i, /\battorney/i, /\blawyer/i, /\bcompliance/i,
  /\baccounting/i, /\baccountant/i, /\bbookkeep/i, /\bpayroll/i,
  /\badmin\b/i, /\badministrative/i, /\breception/i, /\boffice manag/i,
  /\bvendor/i, /\bexhibitor/i, /\bsponsor/i,
  /\banalyst\b/i, /\bresearch\b/i,
];

const EXEC_TITLE_PATTERNS = [
  /\bceo\b/i, /\bcoo\b/i, /\bcto\b/i, /\bcfo\b/i, /\bcio\b/i, /\bcmo\b/i,
  /\bchief/i, /\bpresident/i, /\bfounder/i, /\bowner/i, /\bpartner\b/i,
  /\bvp\b/i, /\bvice president/i, /\bevp\b/i, /\bsvp\b/i,
  /\bdirector\b/i, /\bgeneral manager/i, /\bgm\b/i, /\bmanaging director/i,
  /\bprincipal\b/i,
];

function classifyTitle(role: string): 'likely-icp' | 'likely-non-icp' | 'executive' | 'unclassified' {
  if (!role || role.trim().length === 0) return 'unclassified';

  // Check executive first (many execs have "Director of Engineering" etc.)
  if (EXEC_TITLE_PATTERNS.some(p => p.test(role))) return 'executive';
  if (ICP_TITLE_PATTERNS.some(p => p.test(role))) return 'likely-icp';
  if (NON_ICP_TITLE_PATTERNS.some(p => p.test(role))) return 'likely-non-icp';
  return 'unclassified';
}

// ── Tier Assignment ──────────────────────────────────────────────────────────

function assignTier(contact: Omit<ProcessedContact, 'tier'>): 'A' | 'B' | 'C' | 'Skip' {
  const { isFocus100, titleClassification } = contact;

  // Skip clear non-ICP regardless
  if (titleClassification === 'likely-non-icp') return 'Skip';

  // Tier A: Focus 100 + ICP title or executive title
  if (isFocus100 && (titleClassification === 'likely-icp' || titleClassification === 'executive')) return 'A';

  // Tier B: Focus 100 + non-exec/ambiguous OR non-Focus + strong ICP title
  if (isFocus100) return 'B'; // Focus 100 but unclassified title — still valuable
  if (titleClassification === 'likely-icp' || titleClassification === 'executive') return 'B';

  // Tier C: non-Focus + ambiguous title
  if (titleClassification === 'unclassified') return 'C';

  return 'Skip';
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateKey(a: Attendee): string {
  return `${a.fName.toLowerCase().trim()}|${a.lName.toLowerCase().trim()}|${normalizeCompany(a.company)}`;
}

function nearDuplicateKey(a: Attendee): string {
  return `${a.lName.toLowerCase().trim()}|${normalizeCompany(a.company)}`;
}

// ── CSV Output ───────────────────────────────────────────────────────────────

function escapeCSVField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function writeProcessedCSV(contacts: ProcessedContact[], path: string): void {
  const headers = [
    'fName', 'lName', 'company', 'role', 'state', 'country',
    'isFocus100', 'focus100Match', 'icpType', 'titleClassification', 'tier',
    'isDuplicate', 'isNearDuplicate', 'nearDuplicateOf',
  ];
  const lines = [headers.join(',')];
  for (const c of contacts) {
    lines.push([
      escapeCSVField(c.fName),
      escapeCSVField(c.lName),
      escapeCSVField(c.company),
      escapeCSVField(c.role),
      escapeCSVField(c.state),
      escapeCSVField(c.country),
      String(c.isFocus100),
      escapeCSVField(c.focus100Match),
      escapeCSVField(c.icpType),
      c.titleClassification,
      c.tier,
      String(c.isDuplicate),
      String(c.isNearDuplicate),
      escapeCSVField(c.nearDuplicateOf),
    ].join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== P2 COLD PROSPECT PROCESSING ===\n');

  // ── Preflight checks ──────────────────────────────────────────────────────
  if (!existsSync(ATTENDEE_CSV)) {
    console.error(`ERROR: Attendee CSV not found at: ${ATTENDEE_CSV}`);
    console.error('Place the FC2026 attendee list CSV there and re-run.');
    process.exit(1);
  }
  if (!existsSync(FOCUS_CSV)) {
    console.error(`ERROR: Focus 100 CSV not found at: ${FOCUS_CSV}`);
    console.error('Place the Focus 100 company list CSV there and re-run.');
    process.exit(1);
  }

  // ── STEP 1: Load and parse ────────────────────────────────────────────────
  const attendees = parseAttendeeCSV(ATTENDEE_CSV);
  const focus100 = parseFocus100CSV(FOCUS_CSV);

  console.log('STEP 1: Loaded');
  console.log(`  Attendees: ${attendees.length.toLocaleString()}`);
  console.log(`  Focus 100 companies: ${focus100.length}`);

  // ── STEP 2: Exclude Inorsa employees ──────────────────────────────────────
  const inorsaExcluded: Attendee[] = [];
  let pool = attendees.filter(a => {
    if (normalizeCompany(a.company) === normalizeCompany('INORSA') || a.company.toLowerCase().trim() === 'inorsa') {
      inorsaExcluded.push(a);
      return false;
    }
    return true;
  });

  console.log(`\nSTEP 2: Inorsa excluded`);
  console.log(`  Removed: ${inorsaExcluded.length}${inorsaExcluded.length > 0 ? ` (${inorsaExcluded.map(a => `${a.fName} ${a.lName}`).join(', ')})` : ''}`);

  // ── STEP 3: Exclude P1 companies ──────────────────────────────────────────
  console.log(`\nSTEP 3: P1 exclusion`);
  let p1Companies: string[] = [];
  try {
    const env = loadEnv(ENGINE_ENV);
    const sbUrl = env.SUPABASE_URL;
    const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !sbKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');

    console.log('  Fetching P1 companies from sr_prospects...');
    p1Companies = await fetchP1Companies(sbUrl, sbKey);
    console.log(`  Found ${p1Companies.length} distinct P1 companies in Supabase`);
  } catch (err: any) {
    console.error(`  WARNING: Could not fetch P1 companies: ${err.message}`);
    console.error('  Continuing without P1 exclusion.');
  }

  // Build Focus 100 index BEFORE P1 exclusion so we can override
  const focus100IndexEarly = buildCompanyIndex(focus100.map(f => f.company));

  const p1Index = buildCompanyIndex(p1Companies);
  const p1Excluded: { attendee: Attendee; matchedCompany: string }[] = [];
  const p1OverriddenByFocus: string[] = [];
  const matchedP1CompanySet = new Set<string>();

  if (p1Companies.length > 0) {
    pool = pool.filter(a => {
      const match = findCompanyMatch(a.company, p1Index);
      if (match) {
        // Focus 100 overrides P1 exclusion — Chris wants these companies
        const isFocus = findCompanyMatch(a.company, focus100IndexEarly);
        if (isFocus) {
          if (!p1OverriddenByFocus.includes(match)) p1OverriddenByFocus.push(match);
          return true; // keep it
        }
        p1Excluded.push({ attendee: a, matchedCompany: match });
        matchedP1CompanySet.add(match);
        return false;
      }
      return true;
    });
  }

  if (p1OverriddenByFocus.length > 0) {
    console.log(`  Focus 100 override (kept despite P1 match): ${p1OverriddenByFocus.join(', ')}`);
  }

  console.log(`  P1 companies matched: ${matchedP1CompanySet.size}`);
  console.log(`  Contacts removed: ${p1Excluded.length}`);
  if (matchedP1CompanySet.size > 0) {
    const sorted = [...matchedP1CompanySet].sort();
    console.log(`  Companies: ${sorted.join(', ')}`);
  }

  // ── STEP 4: Flag Focus 100 + classify ─────────────────────────────────────
  const focus100Index = buildCompanyIndex(focus100.map(f => f.company));
  const focus100TypeMap = new Map<string, string>();
  for (const f of focus100) {
    focus100TypeMap.set(normalizeCompany(f.company), f.icpType);
  }

  const matchedFocus100Set = new Set<string>();
  const processed: ProcessedContact[] = [];

  for (const a of pool) {
    const focus100Match = findCompanyMatch(a.company, focus100Index);
    const isFocus100 = !!focus100Match;

    let icpType = '';
    if (isFocus100 && focus100Match) {
      const normMatch = normalizeCompany(focus100Match);
      icpType = focus100TypeMap.get(normMatch) ?? 'Unspecified';
      matchedFocus100Set.add(focus100Match);
    }

    const titleClassification = classifyTitle(a.role);

    const partial = {
      ...a,
      isFocus100,
      focus100Match: focus100Match ?? '',
      icpType,
      titleClassification,
      isDuplicate: false,
      isNearDuplicate: false,
      nearDuplicateOf: '',
    };

    const tier = assignTier(partial);
    processed.push({ ...partial, tier });
  }

  // Focus 100 companies NOT in attendee list
  const allFocus100Normalized = focus100.map(f => normalizeCompany(f.company));
  const matchedFocus100Normalized = new Set(
    [...matchedFocus100Set].map(c => normalizeCompany(c))
  );
  const missingFocus100 = focus100.filter(f => !matchedFocus100Normalized.has(normalizeCompany(f.company)));

  console.log(`\nSTEP 4: Focus 100 flagged`);
  console.log(`  Focus 100 matches: ${processed.filter(c => c.isFocus100).length} contacts at ${matchedFocus100Set.size} companies`);
  console.log(`  Focus 100 NOT in attendee list: ${missingFocus100.length} companies`);
  if (missingFocus100.length > 0) {
    console.log(`    ${missingFocus100.map(f => f.company).sort().join(', ')}`);
  }

  // ── STEP 5: Deduplication ─────────────────────────────────────────────────
  const seen = new Map<string, number>(); // dedup key -> index
  let exactDupes = 0;
  const nearDupeSeen = new Map<string, number[]>(); // near-dup key -> indices

  for (let i = 0; i < processed.length; i++) {
    const key = deduplicateKey(processed[i]);
    if (seen.has(key)) {
      processed[i].isDuplicate = true;
      exactDupes++;
    } else {
      seen.set(key, i);
    }

    // Track near-duplicates
    const nearKey = nearDuplicateKey(processed[i]);
    if (!nearDupeSeen.has(nearKey)) {
      nearDupeSeen.set(nearKey, []);
    }
    nearDupeSeen.get(nearKey)!.push(i);
  }

  // Flag near-duplicates (same last name + company, different first name)
  let nearDupes = 0;
  for (const [, indices] of nearDupeSeen) {
    if (indices.length < 2) continue;
    // Only flag if there are different first names (not exact dupes)
    const uniqueFirstNames = new Set(indices.map(i => processed[i].fName.toLowerCase().trim()));
    if (uniqueFirstNames.size > 1) {
      for (const idx of indices) {
        if (!processed[idx].isDuplicate) {
          const others = indices
            .filter(i => i !== idx && !processed[i].isDuplicate)
            .map(i => `${processed[i].fName} ${processed[i].lName}`);
          if (others.length > 0) {
            processed[idx].isNearDuplicate = true;
            processed[idx].nearDuplicateOf = others.join('; ');
            nearDupes++;
          }
        }
      }
    }
  }

  console.log(`\nSTEP 5: Deduplication`);
  console.log(`  Exact dupes removed: ${exactDupes}`);
  console.log(`  Near-dupes flagged: ${nearDupes}`);

  // ── STEP 6: Final counts + output ─────────────────────────────────────────
  const active = processed.filter(c => !c.isDuplicate);
  const tierA = active.filter(c => c.tier === 'A');
  const tierB = active.filter(c => c.tier === 'B');
  const tierC = active.filter(c => c.tier === 'C');
  const tierSkip = active.filter(c => c.tier === 'Skip');
  const focus100Contacts = active.filter(c => c.isFocus100);
  const focus100Fiber = focus100Contacts.filter(c => c.icpType.toLowerCase().includes('fiber') || c.icpType.toLowerCase().includes('operator'));
  const focus100AE = focus100Contacts.filter(c => c.icpType.toLowerCase().includes('a&e') || c.icpType.toLowerCase().includes('a & e') || c.icpType.toLowerCase().includes('engineering') || c.icpType.toLowerCase().includes('design'));
  const likelyICP = active.filter(c => !c.isFocus100 && (c.titleClassification === 'likely-icp' || c.titleClassification === 'executive'));
  const likelyNonICP = active.filter(c => c.titleClassification === 'likely-non-icp');
  const unclassified = active.filter(c => !c.isFocus100 && c.titleClassification === 'unclassified');

  console.log(`\nSTEP 6: Final counts`);
  console.log(`  Total remaining: ${active.length}`);
  console.log(`  Focus 100 contacts: ${focus100Contacts.length} (Fiber operator: ${focus100Fiber.length}, A&E: ${focus100AE.length})`);
  console.log(`  Likely ICP (non-Focus): ${likelyICP.length}`);
  console.log(`  Likely non-ICP: ${likelyNonICP.length}`);
  console.log(`  Unclassified: ${unclassified.length}`);

  console.log(`\nTIER DISTRIBUTION:`);
  console.log(`  Tier A (Focus 100 + ICP/exec title): ${tierA.length}`);
  console.log(`  Tier B (Focus 100 + other title OR non-Focus + ICP/exec title): ${tierB.length}`);
  console.log(`  Tier C (non-Focus + ambiguous): ${tierC.length}`);
  console.log(`  Skip (students, media, vendors, non-ICP): ${tierSkip.length}`);

  // ── Write outputs ─────────────────────────────────────────────────────────
  writeProcessedCSV(processed, OUTPUT_CSV);
  console.log(`\nOutput: ${OUTPUT_CSV}`);

  // Write summary markdown
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const md = buildSummaryMarkdown({
    attendeeCount: attendees.length,
    focus100Count: focus100.length,
    inorsaExcluded,
    p1MatchedCompanies: [...matchedP1CompanySet].sort(),
    p1ExcludedCount: p1Excluded.length,
    focus100MatchedContacts: focus100Contacts.length,
    focus100MatchedCompanies: matchedFocus100Set.size,
    missingFocus100,
    exactDupes,
    nearDupes,
    activeCount: active.length,
    focus100ContactCount: focus100Contacts.length,
    focus100FiberCount: focus100Fiber.length,
    focus100AECount: focus100AE.length,
    likelyICPCount: likelyICP.length,
    likelyNonICPCount: likelyNonICP.length,
    unclassifiedCount: unclassified.length,
    tierA: tierA.length,
    tierB: tierB.length,
    tierC: tierC.length,
    tierSkip: tierSkip.length,
    timestamp: now,
  });
  writeFileSync(OUTPUT_MD, md, 'utf-8');
  console.log(`Report: ${OUTPUT_MD}`);
  console.log('\nDone.\n');
}

// ── Markdown Report Builder ──────────────────────────────────────────────────

interface ReportData {
  attendeeCount: number;
  focus100Count: number;
  inorsaExcluded: Attendee[];
  p1MatchedCompanies: string[];
  p1ExcludedCount: number;
  focus100MatchedContacts: number;
  focus100MatchedCompanies: number;
  missingFocus100: Focus100Entry[];
  exactDupes: number;
  nearDupes: number;
  activeCount: number;
  focus100ContactCount: number;
  focus100FiberCount: number;
  focus100AECount: number;
  likelyICPCount: number;
  likelyNonICPCount: number;
  unclassifiedCount: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierSkip: number;
  timestamp: string;
}

function buildSummaryMarkdown(d: ReportData): string {
  return `---
title: P2 Cold Prospect Processing Report
status: ACTIVE
last_updated: ${d.timestamp}
version: v1
---

# P2 Cold Prospect Processing Report

**Generated:** ${d.timestamp}

## Step 1: Loaded

| Input | Count |
|---|---|
| Attendees | ${d.attendeeCount.toLocaleString()} |
| Focus 100 companies | ${d.focus100Count} |

## Step 2: Inorsa Excluded

Removed: **${d.inorsaExcluded.length}**${d.inorsaExcluded.length > 0 ? ` (${d.inorsaExcluded.map(a => `${a.fName} ${a.lName}`).join(', ')})` : ''}

## Step 3: P1 Excluded

| Metric | Count |
|---|---|
| P1 companies matched | ${d.p1MatchedCompanies.length} |
| Contacts removed | ${d.p1ExcludedCount} |

${d.p1MatchedCompanies.length > 0 ? `**Companies:** ${d.p1MatchedCompanies.join(', ')}` : 'No P1 companies matched.'}

## Step 4: Focus 100 Flagged

| Metric | Count |
|---|---|
| Focus 100 matches | ${d.focus100MatchedContacts} contacts at ${d.focus100MatchedCompanies} companies |
| Focus 100 NOT in attendee list | ${d.missingFocus100.length} companies |

${d.missingFocus100.length > 0 ? `**Missing from attendee list:** ${d.missingFocus100.map(f => f.company).sort().join(', ')}` : 'All Focus 100 companies have at least one attendee.'}

## Step 5: Deduplication

| Metric | Count |
|---|---|
| Exact dupes removed | ${d.exactDupes} |
| Near-dupes flagged | ${d.nearDupes} |

## Step 6: Final Counts

| Metric | Count |
|---|---|
| Total remaining | ${d.activeCount.toLocaleString()} |
| Focus 100 contacts | ${d.focus100ContactCount} (Fiber operator: ${d.focus100FiberCount}, A&E: ${d.focus100AECount}) |
| Likely ICP (non-Focus) | ${d.likelyICPCount} |
| Likely non-ICP | ${d.likelyNonICPCount} |
| Unclassified | ${d.unclassifiedCount} |

## Tier Distribution

| Tier | Criteria | Count |
|---|---|---|
| A | Focus 100 + ICP/exec title | ${d.tierA} |
| B | Focus 100 + other title OR non-Focus + ICP/exec title | ${d.tierB} |
| C | Non-Focus + ambiguous title | ${d.tierC} |
| Skip | Students, media, vendors, non-ICP | ${d.tierSkip} |

## Version History

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | ${d.timestamp} | Claude | Initial processing run |
`;
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
