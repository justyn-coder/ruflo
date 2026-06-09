/**
 * spam-score-sample.ts
 *
 * One-shot spam-score spot-check for a composed email via Mail-Tester.com.
 *
 * USAGE
 * -----
 *   # Pick the first green-confidence prospect from a run, T1, dry-run only:
 *   npx tsx scripts/spam-score-sample.ts --run-id v2-mq6mto4c --dry-run
 *
 *   # Specific prospect by slug, T2:
 *   npx tsx scripts/spam-score-sample.ts --slug acme-jane-doe --persona revenue_leader --touch 2
 *
 *   # Live send (requires SMTP env — see "SMTP CREDENTIALS" below):
 *   npx tsx scripts/spam-score-sample.ts --run-id v2-mq6mto4c
 *
 *   # Re-check an existing throwaway id (skip send, just scrape):
 *   npx tsx scripts/spam-score-sample.ts --inbox test-abc12345
 *
 * RESULT INTERPRETATION
 * ---------------------
 *   >  8.0  SAFE — ship the cohort
 *   6.0–8.0 REVIEW — read the issues list, fix high-severity ones, re-run
 *   <  6.0  HALT — do not send the cohort; the score reflects systemic problems
 *           (auth, blocklist, suspicious links, spammy phrases)
 *
 *   Mail-Tester's score is out of 10 and includes SPF/DKIM/DMARC, SpamAssassin
 *   triggers, blocklist hits, formatting. A clean composed cold email from a
 *   warm domain should land 9.0+.
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 *   1. Resolves a prospect (--slug or first GREEN of --run-id).
 *   2. Pulls the row from sr_engine_output via Supabase REST.
 *   3. Rebuilds the email (subject + body + PS) for the requested touch.
 *   4. Generates a throwaway address: test-<rand>@srv1.mail-tester.com.
 *   5. Sends via SMTP relay if SMTP_HOST / SMTP_USER / SMTP_PASS present —
 *      otherwise prints the swaks/sendmail command for manual send.
 *   6. Waits 90s, fetches https://www.mail-tester.com/<id>, scrapes score
 *      and the named issues block.
 *   7. Writes /tmp/spam-score-<slug-or-runid>.md with score + triggers.
 *
 * SMTP CREDENTIALS
 * ----------------
 *   Required for live send (any one of these env sets works):
 *     SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + SMTP_FROM
 *     RESEND_API_KEY + RESEND_FROM
 *   If neither is set, the script falls through to manual-send mode and
 *   prints the exact command for you to paste. No half-sends.
 *
 * ONE-SHOT, NOT PIPELINE
 * ----------------------
 *   This script is a spot-check tool. It is not wired into the cohort
 *   composition flow. Run it ad-hoc when you want one sample's spam score
 *   before shipping a batch.
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';
import { writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

const __dirname = dirname(new URL(import.meta.url).pathname);
// Load env from showrev m1-email-find first (where Supabase keys live), then root .env as fallback.
loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

// ─── CLI parse ─────────────────────────────────────────────────────────────

interface Cli {
  slug?: string;
  runId?: string;
  persona?: string;
  touch: 1 | 2 | 3;
  dryRun: boolean;
  inbox?: string;
  waitSeconds: number;
}

function parseArgs(): Cli {
  const args = process.argv.slice(2);
  const out: Cli = { touch: 1, dryRun: false, waitSeconds: 90 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => {
      const v = args[++i];
      if (!v) throw new Error(`Flag ${a} requires a value`);
      return v;
    };
    switch (a) {
      case '--slug': out.slug = next(); break;
      case '--run-id': out.runId = next(); break;
      case '--persona': out.persona = next(); break;
      case '--touch': {
        const t = parseInt(next(), 10);
        if (t !== 1 && t !== 2 && t !== 3) throw new Error(`--touch must be 1, 2, or 3`);
        out.touch = t;
        break;
      }
      case '--dry-run': out.dryRun = true; break;
      case '--inbox': out.inbox = next(); break;
      case '--wait': out.waitSeconds = parseInt(next(), 10); break;
      case '-h':
      case '--help':
        printHelpAndExit(0);
        break;
      default:
        console.error(`Unknown flag: ${a}`);
        printHelpAndExit(2);
    }
  }
  return out;
}

function printHelpAndExit(code: number): never {
  console.log(`
spam-score-sample.ts — Mail-Tester.com spot-check for one composed email.

Selection (one required):
  --slug <microsite-slug>       Pick this specific prospect.
  --run-id <run-id>             Pick the first GREEN-confidence prospect of this run.
  --inbox <test-XXXX>           Skip selection + send; just scrape this existing report.

Optional:
  --persona <bucket>            Filter on persona_bucket when combined with --run-id.
  --touch 1|2|3                 Which touch to test (default 1).
  --dry-run                     Resolve + compose + print; do not send or scrape.
  --wait <sec>                  Seconds to wait between send and scrape (default 90).
  -h, --help                    Show this help.
`);
  process.exit(code);
}

// ─── Supabase row fetch ────────────────────────────────────────────────────

interface EngineRow {
  prospect_id: string;
  run_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  title: string;
  persona_bucket: string;
  microsite_slug: string;
  assigned_ae: string;
  ae_email: string;
  intel_signal_strength: string;
  research_confidence: string;
  email_subject_t1: string;
  email_body_t1: string;
  email_ps_t1: string;
  email_subject_t2: string;
  email_body_t2: string;
  email_ps_t2: string;
  email_subject_t3: string;
  email_body_t3: string;
  email_ps_t3: string;
}

const ENGINE_SELECT =
  'prospect_id,run_id,first_name,last_name,email,company,title,persona_bucket,microsite_slug,' +
  'assigned_ae,ae_email,intel_signal_strength,research_confidence,' +
  'email_subject_t1,email_body_t1,email_ps_t1,' +
  'email_subject_t2,email_body_t2,email_ps_t2,' +
  'email_subject_t3,email_body_t3,email_ps_t3';

async function sbGet(query: string): Promise<EngineRow[]> {
  if (!SB_KEY) throw new Error('Missing Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)');
  const url = `${SB_URL}/rest/v1/sr_engine_output?select=${ENGINE_SELECT}&${query}`;
  const res = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as EngineRow[];
}

async function pickProspect(cli: Cli): Promise<EngineRow> {
  if (cli.slug) {
    const rows = await sbGet(`microsite_slug=eq.${encodeURIComponent(cli.slug)}&limit=1`);
    if (rows.length === 0) throw new Error(`No sr_engine_output row for slug=${cli.slug}`);
    return rows[0];
  }
  if (cli.runId) {
    // "Green confidence" = intel_signal_strength=Strong. Fall back to research_confidence=high if none.
    const personaQ = cli.persona ? `&persona_bucket=eq.${encodeURIComponent(cli.persona)}` : '';
    const runQ = `run_id=eq.${encodeURIComponent(cli.runId)}`;
    const greenQ = `${runQ}&intel_signal_strength=eq.Strong${personaQ}&order=created_at.asc&limit=1`;
    let rows = await sbGet(greenQ);
    if (rows.length === 0) {
      console.warn(`  ⚠ no Strong-signal row for run ${cli.runId}; falling back to research_confidence=high`);
      rows = await sbGet(`${runQ}&research_confidence=eq.high${personaQ}&order=created_at.asc&limit=1`);
    }
    if (rows.length === 0) {
      console.warn(`  ⚠ no high-confidence row either; taking first row of run`);
      rows = await sbGet(`${runQ}${personaQ}&order=created_at.asc&limit=1`);
    }
    if (rows.length === 0) throw new Error(`No sr_engine_output rows for run ${cli.runId}`);
    return rows[0];
  }
  throw new Error('Must pass --slug, --run-id, or --inbox. See --help.');
}

function pickTouch(row: EngineRow, touch: 1 | 2 | 3): { subject: string; body: string; ps: string } {
  if (touch === 1) return { subject: row.email_subject_t1, body: row.email_body_t1, ps: row.email_ps_t1 };
  if (touch === 2) return { subject: row.email_subject_t2, body: row.email_body_t2, ps: row.email_ps_t2 };
  return { subject: row.email_subject_t3, body: row.email_body_t3, ps: row.email_ps_t3 };
}

// ─── Mail-Tester throwaway ─────────────────────────────────────────────────

// Mail-Tester accepts arbitrary test-<id>@srv1.mail-tester.com. Use a random
// id we control so we know the report URL up front.
function generateInboxId(): string {
  return `test-${randomBytes(6).toString('hex')}`;
}

function inboxAddress(id: string): string {
  return `${id}@srv1.mail-tester.com`;
}

function reportUrl(id: string): string {
  return `https://www.mail-tester.com/${id}`;
}

// ─── Send paths ────────────────────────────────────────────────────────────

type SendMode = 'smtp' | 'resend' | 'none';

function detectSendMode(): SendMode {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM) {
    return 'smtp';
  }
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) return 'resend';
  return 'none';
}

async function sendViaResend(toAddr: string, subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM!;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [toAddr], subject, text: body }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
}

async function sendViaSmtp(toAddr: string, subject: string, body: string, from: string): Promise<void> {
  // Lazy-import nodemailer so the dep stays optional. Use a non-literal import path
  // so tsc does not try to resolve it at compile time — runtime resolution only.
  const nodemailerModuleName = 'nodemailer';
  let nodemailer: any;
  try {
    nodemailer = await import(nodemailerModuleName);
  } catch {
    throw new Error(
      `nodemailer not installed. Either: (a) install it (npm i -D nodemailer @types/nodemailer), ` +
        `(b) switch to Resend (set RESEND_API_KEY + RESEND_FROM), or (c) use --dry-run and send manually.`,
    );
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  await transport.sendMail({ from, to: toAddr, subject, text: body });
}

function manualSendInstructions(toAddr: string, subject: string, body: string, from: string): string {
  // swaks is the canonical "send one email by hand" tool.
  const escBody = body.replace(/"/g, '\\"');
  return [
    `# Manual send — no SMTP creds were found in env.`,
    `# To wire credentials, set EITHER:`,
    `#   SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + SMTP_FROM`,
    `#   RESEND_API_KEY + RESEND_FROM`,
    `# and re-run without --dry-run. Or send manually with swaks:`,
    ``,
    `swaks \\`,
    `  --to "${toAddr}" \\`,
    `  --from "${from}" \\`,
    `  --header "Subject: ${subject}" \\`,
    `  --body "${escBody}"`,
    ``,
    `# Then wait ~90s and re-run with --inbox to scrape the score:`,
    `#   npx tsx scripts/spam-score-sample.ts --inbox ${toAddr.split('@')[0]}`,
  ].join('\n');
}

// ─── Mail-Tester scrape ────────────────────────────────────────────────────

interface ScrapeResult {
  score?: number;
  scoreRaw?: string;
  issues: string[];
  rawHtmlSnippet: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

async function scrapeMailTester(inboxId: string): Promise<ScrapeResult> {
  const url = reportUrl(inboxId);
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } });
  const html = await res.text();
  if (!res.ok) {
    return {
      issues: [`Mail-Tester returned ${res.status} when fetching ${url}`],
      rawHtmlSnippet: html.slice(0, 400),
    };
  }

  // Score patterns to try (mail-tester has shifted markup over time):
  //   <span class="score">9.4</span>
  //   <div id="results">…X.Y / 10…</div>
  //   <strong>Your message got X.Y/10</strong>
  let score: number | undefined;
  let scoreRaw: string | undefined;
  const patterns = [
    /class="score"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*</i,
    /(-?\d+(?:\.\d+)?)\s*\/\s*10/i,
    /score[^0-9-]{0,12}(-?\d+(?:\.\d+)?)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n >= -10 && n <= 10) {
        score = n;
        scoreRaw = m[0];
        break;
      }
    }
  }

  // Issues: each named test usually lives in <li class="bad">…</li> or has data-*.
  const issues: string[] = [];
  const issueMatchers = [
    /<li[^>]*class="[^"]*bad[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    /<div[^>]*class="[^"]*test[^"]*fail[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];
  for (const re of issueMatchers) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (txt && !issues.includes(txt)) issues.push(txt);
      if (issues.length > 30) break;
    }
  }

  // If we got no score, capture a snippet so the operator can see what mail-tester returned
  // (e.g. "your email hasn't arrived yet" page, or a CAPTCHA wall).
  const rawHtmlSnippet =
    score === undefined
      ? html.replace(/<script[\s\S]*?<\/script>/g, '').slice(0, 800)
      : '';

  return { score, scoreRaw, issues, rawHtmlSnippet };
}

// ─── Report writer ─────────────────────────────────────────────────────────

function verdict(score: number | undefined): string {
  if (score === undefined) return 'UNKNOWN (could not parse score)';
  if (score > 8) return 'SAFE — ship the cohort.';
  if (score >= 6) return 'REVIEW — fix high-severity issues, re-run.';
  return 'HALT — do not send the cohort. Score reflects systemic problems.';
}

interface ReportInput {
  cli: Cli;
  row: EngineRow | null;
  touch: 1 | 2 | 3;
  composed: { subject: string; body: string; ps: string; fullBody: string };
  fromAddr: string;
  toAddr: string;
  inboxId: string;
  sendMode: SendMode | 'manual' | 'dry-run' | 'inbox-only';
  scrape: ScrapeResult | null;
}

function writeReport(input: ReportInput): string {
  const { cli, row, touch, composed, fromAddr, toAddr, inboxId, sendMode, scrape } = input;
  const slugForFile = cli.slug || row?.microsite_slug || cli.runId || inboxId;
  const path = `/tmp/spam-score-${slugForFile}.md`;

  const wc = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

  const lines: string[] = [];
  lines.push(`# Spam-score check — ${slugForFile}`);
  lines.push('');
  lines.push(`- Run-id: \`${row?.run_id || '(n/a)'}\``);
  lines.push(`- Prospect: ${row ? `${row.first_name} ${row.last_name} @ ${row.company} (${row.title})` : '(n/a)'}`);
  lines.push(`- Touch: T${touch}`);
  lines.push(`- Signal: \`${row?.intel_signal_strength || '(n/a)'}\` | Confidence: \`${row?.research_confidence || '(n/a)'}\``);
  lines.push(`- From: \`${fromAddr}\``);
  lines.push(`- To (throwaway): \`${toAddr}\``);
  lines.push(`- Mail-Tester report: ${reportUrl(inboxId)}`);
  lines.push(`- Send mode: \`${sendMode}\``);
  lines.push('');
  lines.push(`## Composed email`);
  lines.push('');
  lines.push(`**Subject:** ${composed.subject}`);
  lines.push('');
  lines.push('```');
  lines.push(composed.fullBody);
  lines.push('```');
  lines.push(`Word count (body + P.S.): ${wc(composed.fullBody)}`);
  lines.push('');

  if (scrape) {
    lines.push(`## Result`);
    lines.push('');
    lines.push(`- **Score:** ${scrape.score !== undefined ? scrape.score.toFixed(1) + ' / 10' : 'UNKNOWN'}`);
    if (scrape.scoreRaw) lines.push(`- Matched: \`${scrape.scoreRaw.slice(0, 120)}\``);
    lines.push(`- **Verdict:** ${verdict(scrape.score)}`);
    lines.push('');
    if (scrape.issues.length > 0) {
      lines.push(`### Identified issues (${scrape.issues.length})`);
      for (const i of scrape.issues.slice(0, 20)) lines.push(`- ${i}`);
      lines.push('');
    } else {
      lines.push(`No issues parsed from the report HTML.`);
      lines.push('');
    }
    if (scrape.rawHtmlSnippet) {
      lines.push(`### Raw HTML snippet (debug)`);
      lines.push('```html');
      lines.push(scrape.rawHtmlSnippet);
      lines.push('```');
    }
  } else {
    lines.push(`## Result`);
    lines.push('');
    lines.push(`No scrape performed (dry-run or manual-send mode).`);
  }

  lines.push('');
  lines.push(`## Interpretation`);
  lines.push(`- > 8.0 = SAFE`);
  lines.push(`- 6.0 – 8.0 = REVIEW`);
  lines.push(`- < 6.0 = HALT`);

  const text = lines.join('\n');
  writeFileSync(path, text);
  return path;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = parseArgs();

  // ── Inbox-only mode: just scrape an existing report ──
  if (cli.inbox) {
    console.log(`Scraping existing inbox: ${cli.inbox}`);
    const scrape = await scrapeMailTester(cli.inbox);
    const path = writeReport({
      cli,
      row: null,
      touch: cli.touch,
      composed: { subject: '(not reconstructed)', body: '', ps: '', fullBody: '(inbox-only mode)' },
      fromAddr: '(n/a)',
      toAddr: inboxAddress(cli.inbox),
      inboxId: cli.inbox,
      sendMode: 'inbox-only',
      scrape,
    });
    console.log(`\nScore: ${scrape.score !== undefined ? scrape.score.toFixed(1) : 'UNKNOWN'}`);
    console.log(`Report: ${path}`);
    return;
  }

  console.log(`Resolving prospect…`);
  const row = await pickProspect(cli);
  console.log(`  → ${row.first_name} ${row.last_name} @ ${row.company} (${row.title})`);
  console.log(`    signal=${row.intel_signal_strength} confidence=${row.research_confidence} ae=${row.assigned_ae}`);

  const touchParts = pickTouch(row, cli.touch);
  if (!touchParts.subject || !touchParts.body) {
    throw new Error(`Touch T${cli.touch} has no composed email on this row.`);
  }
  const fullBody = touchParts.ps ? `${touchParts.body}\n\n${touchParts.ps}` : touchParts.body;
  const composed = { subject: touchParts.subject, body: touchParts.body, ps: touchParts.ps, fullBody };

  const inboxId = generateInboxId();
  const toAddr = inboxAddress(inboxId);
  const fromAddr =
    process.env.SMTP_FROM ||
    process.env.RESEND_FROM ||
    row.ae_email ||
    'mike@inorsa.com';

  console.log(`\nComposed T${cli.touch}:`);
  console.log(`  Subject: ${composed.subject}`);
  console.log(`  Body (${composed.fullBody.split(/\s+/).filter(Boolean).length} words):`);
  console.log(composed.fullBody.split('\n').map((l) => '    ' + l).join('\n'));
  console.log(`\nThrowaway: ${toAddr}`);
  console.log(`Report URL: ${reportUrl(inboxId)}`);

  // ── Dry run: stop before send. ──
  if (cli.dryRun) {
    const path = writeReport({
      cli,
      row,
      touch: cli.touch,
      composed,
      fromAddr,
      toAddr,
      inboxId,
      sendMode: 'dry-run',
      scrape: null,
    });
    console.log(`\n[DRY RUN] No send. Report: ${path}`);
    return;
  }

  // ── Live send ──
  const mode = detectSendMode();
  if (mode === 'none') {
    console.log(`\n${manualSendInstructions(toAddr, composed.subject, composed.fullBody, fromAddr)}`);
    const path = writeReport({
      cli,
      row,
      touch: cli.touch,
      composed,
      fromAddr,
      toAddr,
      inboxId,
      sendMode: 'manual',
      scrape: null,
    });
    console.log(`\nNo SMTP creds in env — printed manual-send command. Report stub: ${path}`);
    return;
  }

  console.log(`\nSending via ${mode}…`);
  if (mode === 'smtp') {
    await sendViaSmtp(toAddr, composed.subject, composed.fullBody, fromAddr);
  } else {
    await sendViaResend(toAddr, composed.subject, composed.fullBody);
  }
  console.log(`  ✓ sent`);

  console.log(`Waiting ${cli.waitSeconds}s for Mail-Tester to process…`);
  await new Promise((r) => setTimeout(r, cli.waitSeconds * 1000));

  console.log(`Scraping ${reportUrl(inboxId)}…`);
  const scrape = await scrapeMailTester(inboxId);

  const path = writeReport({
    cli,
    row,
    touch: cli.touch,
    composed,
    fromAddr,
    toAddr,
    inboxId,
    sendMode: mode,
    scrape,
  });
  console.log(`\nScore: ${scrape.score !== undefined ? scrape.score.toFixed(1) + ' / 10' : 'UNKNOWN'}`);
  console.log(`Verdict: ${verdict(scrape.score)}`);
  console.log(`Report: ${path}`);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message || err}`);
  process.exit(1);
});
