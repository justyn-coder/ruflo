import { readFileSync } from 'fs';
import { resolve } from 'path';

export type ICPStatus = 'pass' | 'hold' | 'reject';

export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailCorrected: boolean;
  originalEmail?: string;
  phone: string;
  title: string;
  city: string;
  company: string;
  state: string;
  grade: 'Hot' | 'Warm' | 'Cold' | 'Ungraded';
  tier: 'A' | 'B' | 'C' | 'D' | 'E';
  icpStatus: ICPStatus;
  icpReason: string;
  aeNotes: string;
  hasAeNotes: boolean;
  leadType: string;
  skipReason?: string;
  isDuplicate: boolean;
}

export interface ImportResult {
  total: number;
  unique: number;
  duplicatesRemoved: number;
  emailsCorrected: number;
  byTier: Record<string, Prospect[]>;
  byICP: Record<ICPStatus, Prospect[]>;
  skipped: Prospect[];
  prospects: Prospect[];
}

const EMAIL_CORRECTIONS: Record<string, string> = {
  'mvarrelman@nbcllc.cok': 'mvarrelman@nbcllc.com',
  'garth@avatartechllc.om': 'garth@avatartechllc.com',
  'stephanie@natehome.con': 'stephanie@natehome.com',
};

const COLD_KEYWORDS = [
  'not icp',
  'hardware vendor',
  'manufacturing company',
  'vendor for',
  'not likely to be interested',
  'works for fiber magazine',
  'director of events',
];

const REJECT_SEGMENTS = [
  'equipment', 'manufacturer', 'distributor', 'hardware',
  'software', 'platform', 'saas', 'staffing', 'insurance',
  'education', 'training', 'media', 'publishing', 'events',
  'magazine', 'association',
];

const PASS_TITLE_SIGNALS = [
  'engineering', 'design', 'construction', 'operations',
  'plant', 'field', 'permitting', 'regulatory', 'program',
  'ceo', 'cto', 'coo', 'president', 'vp', 'director',
  'svp', 'evp', 'chief', 'cos',
];

function classifyICP(
  prospect: { title: string; company: string; aeNotes: string; grade: string; leadType: string }
): { status: ICPStatus; reason: string } {
  const notesLower = (prospect.aeNotes || '').toLowerCase();
  const titleLower = prospect.title.toLowerCase();
  const companyLower = prospect.company.toLowerCase();
  const leadLower = (prospect.leadType || '').toLowerCase();

  if (COLD_KEYWORDS.some(kw => notesLower.includes(kw))) {
    return { status: 'reject', reason: `AE flagged: ${prospect.aeNotes.slice(0, 80)}` };
  }

  if (REJECT_SEGMENTS.some(seg => companyLower.includes(seg) || leadLower.includes(seg))) {
    return { status: 'reject', reason: 'Company segment auto-reject (equipment/software/staffing)' };
  }

  if (prospect.grade === 'Cold') {
    return { status: 'reject', reason: 'AE graded Cold' };
  }

  const hasTitleSignal = PASS_TITLE_SIGNALS.some(sig => titleLower.includes(sig));
  const hasNotes = notesLower.length > 0;
  const isHotOrWarm = prospect.grade === 'Hot' || prospect.grade === 'Warm';

  if (isHotOrWarm && hasTitleSignal) {
    return { status: 'pass', reason: `${prospect.grade} grade + relevant title` };
  }

  if (isHotOrWarm) {
    return { status: 'pass', reason: `${prospect.grade} grade` };
  }

  if (hasTitleSignal && hasNotes) {
    return { status: 'pass', reason: 'Relevant title + AE notes present' };
  }

  if (hasTitleSignal) {
    return { status: 'hold', reason: 'Relevant title but no AE notes or grade' };
  }

  if (hasNotes) {
    return { status: 'hold', reason: 'AE notes present but title unclear' };
  }

  return { status: 'hold', reason: 'Thin data — needs research to determine fit' };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function detectGrade(grade: string, aeNotes: string): 'Hot' | 'Warm' | 'Cold' | 'Ungraded' {
  const g = grade.trim().toLowerCase();
  if (g === 'hot') return 'Hot';
  if (g === 'warm') return 'Warm';
  if (g === 'cold') return 'Cold';

  if (aeNotes) {
    const notesLower = aeNotes.toLowerCase();
    if (COLD_KEYWORDS.some(kw => notesLower.includes(kw))) return 'Cold';
  }

  return 'Ungraded';
}

function assignTier(grade: 'Hot' | 'Warm' | 'Cold' | 'Ungraded', hasNotes: boolean): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (grade === 'Hot') return 'A';
  if (grade === 'Warm') return 'B';
  if (grade === 'Cold') return 'E';
  return hasNotes ? 'C' : 'D';
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function importProspects(csvPath: string): ImportResult {
  const raw = readFileSync(resolve(csvPath), 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const header = parseCSVLine(lines[0]);

  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => { colIndex[h.trim()] = i; });

  const seen = new Map<string, Prospect>();
  let emailsCorrected = 0;
  let duplicatesRemoved = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const rawEmail = (fields[colIndex['Email']] || '').trim();
    if (!rawEmail) continue;

    const normalizedEmail = normalizeEmail(rawEmail);
    if (seen.has(normalizedEmail)) {
      duplicatesRemoved++;
      const existing = seen.get(normalizedEmail)!;
      const newNotes = (fields[colIndex['AE notes']] || '').trim();
      if (newNotes && !existing.aeNotes) {
        existing.aeNotes = newNotes;
        existing.hasAeNotes = true;
        existing.grade = detectGrade(existing.grade, newNotes);
        existing.tier = assignTier(existing.grade, true);
      }
      continue;
    }

    let correctedEmail = normalizedEmail;
    let wasCorrected = false;
    if (EMAIL_CORRECTIONS[normalizedEmail]) {
      correctedEmail = EMAIL_CORRECTIONS[normalizedEmail];
      wasCorrected = true;
      emailsCorrected++;
    }

    const aeNotes = (fields[colIndex['AE notes']] || '').trim();
    const hasAeNotes = aeNotes.length > 0;
    const gradeRaw = (fields[colIndex['Grade']] || '').trim();
    const grade = detectGrade(gradeRaw, aeNotes);
    const tier = assignTier(grade, hasAeNotes);

    const title = (fields[colIndex['Title']] || '').trim();
    const company = (fields[colIndex['Company Name']] || '').trim();
    const leadType = (fields[colIndex['Lead Type']] || '').trim();

    const icp = classifyICP({ title, company, aeNotes, grade, leadType });

    const prospect: Prospect = {
      id: `fc2026-${i.toString().padStart(3, '0')}`,
      firstName: (fields[colIndex['First Name']] || '').trim(),
      lastName: (fields[colIndex['Last Name']] || '').trim(),
      email: correctedEmail,
      emailCorrected: wasCorrected,
      originalEmail: wasCorrected ? rawEmail : undefined,
      phone: (fields[colIndex['Primary Phone']] || '').trim(),
      title,
      city: (fields[colIndex['City']] || '').trim(),
      company,
      state: (fields[colIndex['State']] || '').trim(),
      grade,
      tier,
      icpStatus: icp.status,
      icpReason: icp.reason,
      aeNotes,
      hasAeNotes,
      leadType,
      isDuplicate: false,
    };

    if (icp.status === 'reject') {
      prospect.skipReason = icp.reason;
    }

    seen.set(normalizedEmail, prospect);
  }

  const prospects = Array.from(seen.values());

  const byTier: Record<string, Prospect[]> = { A: [], B: [], C: [], D: [], E: [] };
  const byICP: Record<ICPStatus, Prospect[]> = { pass: [], hold: [], reject: [] };
  const skipped: Prospect[] = [];

  for (const p of prospects) {
    byTier[p.tier].push(p);
    byICP[p.icpStatus].push(p);
    if (p.icpStatus === 'reject') skipped.push(p);
  }

  // Sort each tier: contacts with notes first, then alphabetically by company
  for (const tier of Object.keys(byTier)) {
    byTier[tier].sort((a, b) => {
      if (a.hasAeNotes !== b.hasAeNotes) return a.hasAeNotes ? -1 : 1;
      return a.company.localeCompare(b.company);
    });
  }

  return {
    total: lines.length - 1,
    unique: prospects.length,
    duplicatesRemoved,
    emailsCorrected,
    byTier,
    byICP,
    skipped,
    prospects,
  };
}

export function printImportSummary(result: ImportResult): void {
  console.log('\n=== M1 Email Find — Import Summary ===\n');
  console.log(`Total rows:        ${result.total}`);
  console.log(`Unique contacts:   ${result.unique}`);
  console.log(`Duplicates removed: ${result.duplicatesRemoved}`);
  console.log(`Emails corrected:  ${result.emailsCorrected}`);
  console.log('');
  console.log('ICP status:');
  console.log(`  PASS:   ${result.byICP.pass.length}`);
  console.log(`  HOLD:   ${result.byICP.hold.length}`);
  console.log(`  REJECT: ${result.byICP.reject.length}`);
  console.log('');
  console.log('Batch order (tier):');
  console.log(`  A (Hot):              ${result.byTier.A.length}`);
  console.log(`  B (Warm):             ${result.byTier.B.length}`);
  console.log(`  C (Notes, ungraded):  ${result.byTier.C.length}`);
  console.log(`  D (No notes, no grade): ${result.byTier.D.length}`);
  console.log(`  E (Cold/skip):        ${result.byTier.E.length}`);
  console.log('');

  if (result.byICP.pass.length > 0) {
    console.log('--- ICP PASS (ready for pipeline) ---');
    for (const p of result.byICP.pass) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.title} | ${p.company} | ${p.icpReason}`);
    }
    console.log('');
  }

  if (result.byICP.hold.length > 0) {
    console.log('--- ICP HOLD (needs research) ---');
    for (const p of result.byICP.hold) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.title} | ${p.company} | ${p.icpReason}`);
    }
    console.log('');
  }

  if (result.byICP.reject.length > 0) {
    console.log('--- ICP REJECT ---');
    for (const p of result.byICP.reject) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.company} | ${p.icpReason}`);
    }
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('importer.ts') || process.argv[1]?.endsWith('importer.js')) {
  const csvPath = process.argv[2] || resolve(__dirname, '../../../data/showrev/fiber-connect-2026-booth-scans.csv');
  const result = importProspects(csvPath);
  printImportSummary(result);
  console.log('\nFull prospect data written to stdout as JSON:');
  console.log(JSON.stringify(result, null, 2));
}
