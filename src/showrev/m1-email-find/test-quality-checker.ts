import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '.env') });

interface EmailOutput {
  touchNumber: number;
  subject: string;
  body: string;
  ps: string;
  wordCount: number;
  pattern: string;
}

interface QualityCheck {
  name: string;
  category: 'mechanical' | 'anti-validation' | 'copy-rules' | 'icp-awareness' | 'framing';
  pass: boolean;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const PITCH_VERBATIM = 'We convert your GIS and LLD data into construction and permit drawings in minutes, so your team takes on more work without adding headcount.';

const ANTI_VALIDATION_TERMS = [
  /\bvalidat(?:es?|ing|ion)\b/i,
  /\bcatch(?:es|ing)?\s+errors?\b/i,
  /\bquality\s+control\b/i,
  /\bquality\s+assurance\b/i,
  /\berror\s+detection\b/i,
  /\berror.?catch/i,
  /\bquality\s+check/i,
  /\bdetects?\s+(?:errors?|mistakes?|issues?)\b/i,
  /\bstructural\s+analysis\b/i,
  /\bHarmoni\b/i,
  /\bcell\s*tower/i,
  /\bcellular\b/i,
  /\bsmall\s+cell/i,
  /\bDAS\b/,
  /\bMicroStation\b/i,
  /\boffshore\b/i,
  /\b(?:India|Philippines|outsourc)/i,
];

const SALUTATION_PATTERN = /^([A-Z][a-z]+),\s/;
const GREETING_WORDS = /^(Hey|Hi|Hello|Dear|Greetings)\s/i;
const EM_DASH = /[—–]/;
const FOLLOWING_UP = /following\s+up\s+on\s+my\s+previous/i;
const I_WANTED = /^I\s+wanted\s+to\b/im;
const TOM_MARCIANO = /\bTom\s+Marciano\b/i;
const INORSA_SENTENCE_PATTERN = /\binorsa\b/gi;

function checkEmail(email: EmailOutput, prospectFirstName: string, icpType: string, isPostShow: boolean): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const fullText = `${email.subject} ${email.body} ${email.ps}`;
  const bodyOnly = email.body;

  // --- MECHANICAL ---

  const wordLimit = email.touchNumber <= 2 ? 88 : 66;
  checks.push({
    name: `T${email.touchNumber} word count`,
    category: 'mechanical',
    pass: email.wordCount <= wordLimit,
    detail: `${email.wordCount} words (limit: ${wordLimit})`,
    severity: email.wordCount > wordLimit ? 'high' : 'low',
  });

  const firstLine = bodyOnly.split('\n')[0]?.trim() || '';
  const salutationOk = SALUTATION_PATTERN.test(firstLine) && firstLine.startsWith(prospectFirstName);
  checks.push({
    name: `T${email.touchNumber} salutation format`,
    category: 'copy-rules',
    pass: salutationOk,
    detail: `First line: "${firstLine.slice(0, 50)}"`,
    severity: 'critical',
  });

  const hasGreetingWord = GREETING_WORDS.test(firstLine);
  checks.push({
    name: `T${email.touchNumber} no greeting word`,
    category: 'copy-rules',
    pass: !hasGreetingWord,
    detail: hasGreetingWord ? `FORBIDDEN greeting word found in: "${firstLine.slice(0, 40)}"` : 'Clean',
    severity: 'critical',
  });

  // --- ANTI-VALIDATION ---

  const textWithoutPitch = fullText.replace(PITCH_VERBATIM, '');
  for (const pattern of ANTI_VALIDATION_TERMS) {
    const match = textWithoutPitch.match(pattern);
    if (match) {
      checks.push({
        name: `T${email.touchNumber} anti-validation: ${pattern.source.slice(0, 30)}`,
        category: 'anti-validation',
        pass: false,
        detail: `FORBIDDEN term found: "${match[0]}" in context: "...${textWithoutPitch.slice(Math.max(0, textWithoutPitch.indexOf(match[0]) - 20), textWithoutPitch.indexOf(match[0]) + match[0].length + 20)}..."`,
        severity: 'critical',
      });
    }
  }
  if (!ANTI_VALIDATION_TERMS.some(p => p.test(textWithoutPitch))) {
    checks.push({
      name: `T${email.touchNumber} anti-validation clean`,
      category: 'anti-validation',
      pass: true,
      detail: 'No forbidden terms found',
      severity: 'critical',
    });
  }

  // --- COPY RULES ---

  checks.push({
    name: `T${email.touchNumber} no em-dashes`,
    category: 'copy-rules',
    pass: !EM_DASH.test(fullText),
    detail: EM_DASH.test(fullText) ? 'Em-dash or en-dash found' : 'Clean',
    severity: 'medium',
  });

  checks.push({
    name: `T${email.touchNumber} no "following up on my previous"`,
    category: 'copy-rules',
    pass: !FOLLOWING_UP.test(fullText),
    detail: FOLLOWING_UP.test(fullText) ? 'Forbidden reference to previous email' : 'Clean',
    severity: 'high',
  });

  checks.push({
    name: `T${email.touchNumber} no "I wanted to" opener`,
    category: 'copy-rules',
    pass: !I_WANTED.test(bodyOnly),
    detail: I_WANTED.test(bodyOnly) ? '"I wanted to" framing found' : 'Clean',
    severity: 'medium',
  });

  checks.push({
    name: `T${email.touchNumber} no Tom Marciano`,
    category: 'copy-rules',
    pass: !TOM_MARCIANO.test(fullText),
    detail: TOM_MARCIANO.test(fullText) ? 'FORBIDDEN: Tom Marciano referenced' : 'Clean',
    severity: 'critical',
  });

  const inorsaMentions = (fullText.match(INORSA_SENTENCE_PATTERN) || []).length;
  const inorsaSentences = fullText.split(/[.!?]+/).filter(s => /\binorsa\b/i.test(s));
  checks.push({
    name: `T${email.touchNumber} one Inorsa sentence max`,
    category: 'copy-rules',
    pass: inorsaSentences.length <= 1,
    detail: `${inorsaSentences.length} sentence(s) mention Inorsa (${inorsaMentions} total mentions)`,
    severity: inorsaSentences.length > 2 ? 'critical' : 'high',
  });

  // --- ICP AWARENESS ---

  if (email.touchNumber <= 2 && email.ps) {
    const hasMicrositeLink = /fiber\.inorsa\.com/i.test(email.ps);
    checks.push({
      name: `T${email.touchNumber} microsite link in P.S.`,
      category: 'icp-awareness',
      pass: hasMicrositeLink,
      detail: hasMicrositeLink ? 'Microsite link present' : 'Missing microsite link in P.S.',
      severity: 'medium',
    });
  }

  // --- FRAMING ---

  if (!isPostShow) {
    const boothReferences = /\bbooth\b|\bbadge\b|\bstopped\s+by\b|\bwe\s+met\b|\bour\s+booth\b/i;
    checks.push({
      name: `T${email.touchNumber} no booth reference (cold prospect)`,
      category: 'framing',
      pass: !boothReferences.test(fullText),
      detail: boothReferences.test(fullText) ? 'COLD prospect but references booth/meeting' : 'Clean',
      severity: 'high',
    });
  }

  // --- AI-WRITING DETECTION (research-validated, DL-199) ---
  // Source: VERMILLION Framework (ResearchLeap 2025), PNAS 2025 (PMC11874169), B2B practitioner findings

  // Check 1: Echoed sentence structures — adjacent sentences mirroring grammatical rhythm
  const sentences = bodyOnly.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  let echoCount = 0;
  for (let i = 1; i < sentences.length; i++) {
    const prev = sentences[i - 1].replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    const curr = sentences[i].replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    if (prev.length >= 3 && curr.length >= 3 && Math.abs(prev.length - curr.length) <= 2) {
      const prevStart = prev.slice(0, 3).map(w => w.length > 3 ? 'L' : 'S').join('');
      const currStart = curr.slice(0, 3).map(w => w.length > 3 ? 'L' : 'S').join('');
      if (prevStart === currStart) echoCount++;
    }
  }
  checks.push({
    name: `T${email.touchNumber} echoed sentence structures`,
    category: 'framing',
    pass: echoCount <= 1,
    detail: echoCount > 1 ? `${echoCount} adjacent sentence pairs mirror grammatical rhythm (AI tell)` : `${echoCount} echo(es) — within tolerance`,
    severity: 'medium',
  });

  // Check 2: Participial clause density — present-participial openers at 2-5x human rate
  // Exclude common non-participial -ing words in fiber/construction context
  const ingExclusions = /^(Building|Engineering|King|Ring|Sing|String|Spring|Sterling|Mining|Morning|Evening|Lightning|Ceiling|Billing|Willing|Darling)\s/i;
  const participialOpeners = sentences.filter(s => /^[A-Z][a-z]*ing\s/.test(s.trim()) && !ingExclusions.test(s.trim()));
  checks.push({
    name: `T${email.touchNumber} participial clause density`,
    category: 'framing',
    pass: participialOpeners.length <= 1,
    detail: participialOpeners.length > 1
      ? `${participialOpeners.length} participial openers found: "${participialOpeners.map(s => s.slice(0, 30)).join('", "')}" (AI tell per PNAS 2025)`
      : `${participialOpeners.length} — within human range`,
    severity: 'medium',
  });

  // Check 3: Sentence-length variance — low variance = AI tell (B2B practitioner consensus)
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  if (sentenceLengths.length >= 3) {
    const mean = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    const variance = sentenceLengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / sentenceLengths.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    checks.push({
      name: `T${email.touchNumber} sentence-length variance`,
      category: 'framing',
      pass: cv >= 25,
      detail: cv < 25
        ? `CV=${cv.toFixed(1)}% (lengths: ${sentenceLengths.join(',')}). Below 25% = robotic cadence (AI tell)`
        : `CV=${cv.toFixed(1)}% — natural variation`,
      severity: 'medium',
    });
  }

  return checks;
}

export function analyzeEmails(
  emails: EmailOutput[],
  prospectFirstName: string,
  icpType: string,
  isPostShow: boolean,
  label: string,
): { checks: QualityCheck[]; passRate: number; criticalFailures: number } {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Quality Analysis: ${label}`);
  console.log(`  ICP: ${icpType} | Framing: ${isPostShow ? 'post-show' : 'cold'}`);
  console.log(`${'─'.repeat(60)}\n`);

  const allChecks: QualityCheck[] = [];

  for (const email of emails) {
    const checks = checkEmail(email, prospectFirstName, icpType, isPostShow);
    allChecks.push(...checks);

    const failures = checks.filter(c => !c.pass);
    if (failures.length === 0) {
      console.log(`  T${email.touchNumber} (${email.pattern}, ${email.wordCount}w): ALL CHECKS PASSED`);
    } else {
      console.log(`  T${email.touchNumber} (${email.pattern}, ${email.wordCount}w): ${failures.length} FAILURE(S)`);
      for (const f of failures) {
        const icon = f.severity === 'critical' ? '🚨' : f.severity === 'high' ? '⚠️' : '⚡';
        console.log(`    ${icon} [${f.severity}] ${f.name}: ${f.detail}`);
      }
    }

    console.log(`\n  --- T${email.touchNumber} Content ---`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  Body:\n${email.body.split('\n').map(l => `    ${l}`).join('\n')}`);
    if (email.ps) console.log(`  P.S.: ${email.ps}`);
    console.log('');
  }

  const total = allChecks.length;
  const passed = allChecks.filter(c => c.pass).length;
  const criticalFails = allChecks.filter(c => !c.pass && c.severity === 'critical').length;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  console.log(`  Result: ${passed}/${total} checks passed (${passRate.toFixed(1)}%)`);
  if (criticalFails > 0) {
    console.log(`  🚨 ${criticalFails} CRITICAL failure(s) — must fix before send`);
  }

  return { checks: allChecks, passRate, criticalFailures: criticalFails };
}
