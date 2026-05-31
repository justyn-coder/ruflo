import { readFileSync } from 'fs';
import { resolve } from 'path';

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

    const prospect: Prospect = {
      id: `fc2026-${i.toString().padStart(3, '0')}`,
      firstName: (fields[colIndex['First Name']] || '').trim(),
      lastName: (fields[colIndex['Last Name']] || '').trim(),
      email: correctedEmail,
      emailCorrected: wasCorrected,
      originalEmail: wasCorrected ? rawEmail : undefined,
      phone: (fields[colIndex['Primary Phone']] || '').trim(),
      title: (fields[colIndex['Title']] || '').trim(),
      city: (fields[colIndex['City']] || '').trim(),
      company: (fields[colIndex['Company Name']] || '').trim(),
      state: (fields[colIndex['State']] || '').trim(),
      grade,
      tier,
      aeNotes,
      hasAeNotes,
      leadType: (fields[colIndex['Lead Type']] || '').trim(),
      isDuplicate: false,
    };

    if (grade === 'Cold') {
      prospect.skipReason = aeNotes || 'Marked Cold by AE';
    }

    seen.set(normalizedEmail, prospect);
  }

  const prospects = Array.from(seen.values());

  const byTier: Record<string, Prospect[]> = { A: [], B: [], C: [], D: [], E: [] };
  const skipped: Prospect[] = [];

  for (const p of prospects) {
    byTier[p.tier].push(p);
    if (p.tier === 'E') skipped.push(p);
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
  console.log('By tier:');
  console.log(`  A (Hot):              ${result.byTier.A.length}`);
  console.log(`  B (Warm):             ${result.byTier.B.length}`);
  console.log(`  C (Notes, ungraded):  ${result.byTier.C.length}`);
  console.log(`  D (No notes, no grade): ${result.byTier.D.length}`);
  console.log(`  E (Cold/skip):        ${result.byTier.E.length}`);
  console.log('');

  if (result.byTier.A.length > 0) {
    console.log('--- Tier A (Hot — process first) ---');
    for (const p of result.byTier.A) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.title} | ${p.company} | ${p.email}`);
      if (p.aeNotes) console.log(`    AE: ${p.aeNotes}`);
    }
    console.log('');
  }

  if (result.byTier.B.length > 0) {
    console.log('--- Tier B (Warm) ---');
    for (const p of result.byTier.B) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.title} | ${p.company} | ${p.email}`);
      if (p.aeNotes) console.log(`    AE: ${p.aeNotes}`);
    }
    console.log('');
  }

  if (result.skipped.length > 0) {
    console.log('--- Tier E (Skipped) ---');
    for (const p of result.skipped) {
      console.log(`  ${p.firstName} ${p.lastName} | ${p.company} | Reason: ${p.skipReason || 'Cold'}`);
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
