/**
 * Pre-load verification — spec v6 Component 1 + v6.1 amendment A2.
 *
 * Runs a battery of blocking + warning checks BEFORE the loader fires.
 * Failure on a blocking check = abort the load. Warnings = log + proceed.
 *
 * Checks:
 *   1. SPF (inorsa.com TXT must include HubSpot portal include)        BLOCKING
 *   2. DKIM (hs1 + hs2 CNAMEs must resolve)                              BLOCKING
 *   3. DMARC (_dmarc.inorsa.com TXT must contain v=DMARC1)               BLOCKING
 *   4. HS token auth (GET /crm/v3/objects/contacts?limit=1 returns 200)  BLOCKING
 *   5. EXISTING_HS_CONTACT (bulk-check prospects' emails vs HS)          WARNING (log existing IDs)
 *   6. UNSUBSCRIBE_ENABLED (operator-confirmed flag in sr_engagements)   BLOCKING
 *
 * Reference: docs/showrev/POST-PORTAL-SPEC-V6.md Component 1 +
 *            §v6.1 A2 (SPF/DKIM/DMARC). HUBSPOT-INTEGRATION-RESEARCH.md
 *            Q8 (existing contact behavior).
 */

import { promises as dns } from 'dns';
import { hsApi } from './hs-api-client';

export interface CheckResult {
  name: string;
  level: 'BLOCKING' | 'WARNING';
  pass: boolean;
  details: string[];
  meta?: Record<string, unknown>;
}

export interface VerifyReport {
  allPassed: boolean;
  blockingFailures: number;
  warnings: number;
  checks: CheckResult[];
  durationMs: number;
}

const SENDER_DOMAIN = 'inorsa.com';
const HS_PORTAL_ID = '20729069';
const HS_SPF_INCLUDE = `${HS_PORTAL_ID}.spf03.hubspotemail.net`;
const DKIM_SELECTORS = [
  `hs1-${HS_PORTAL_ID}._domainkey.${SENDER_DOMAIN}`,
  `hs2-${HS_PORTAL_ID}._domainkey.${SENDER_DOMAIN}`,
];
const DMARC_HOST = `_dmarc.${SENDER_DOMAIN}`;

// === Check 1: SPF ===
async function checkSpf(): Promise<CheckResult> {
  try {
    const records = await dns.resolveTxt(SENDER_DOMAIN);
    const flat = records.map((r) => r.join('')).join('\n');
    const hasSpfV1 = /v=spf1/i.test(flat);
    const hasHsInclude = flat.includes(HS_SPF_INCLUDE);
    const details: string[] = [];
    if (!hasSpfV1) details.push(`No v=spf1 record found at ${SENDER_DOMAIN}`);
    if (!hasHsInclude)
      details.push(`SPF missing HubSpot portal include: ${HS_SPF_INCLUDE}`);
    return {
      name: 'SPF',
      level: 'BLOCKING',
      pass: details.length === 0,
      details: details.length ? details : [`SPF includes ${HS_SPF_INCLUDE} ✓`],
    };
  } catch (e) {
    return {
      name: 'SPF',
      level: 'BLOCKING',
      pass: false,
      details: [`DNS query failed: ${(e as Error).message}`],
    };
  }
}

// === Check 2: DKIM ===
async function checkDkim(): Promise<CheckResult> {
  const details: string[] = [];
  let allResolved = true;
  for (const selector of DKIM_SELECTORS) {
    try {
      const cnames = await dns.resolveCname(selector);
      if (!cnames || cnames.length === 0) {
        details.push(`${selector}: no CNAME found`);
        allResolved = false;
      } else {
        details.push(`${selector} → ${cnames[0]}`);
      }
    } catch (e) {
      details.push(`${selector}: ${(e as Error).message}`);
      allResolved = false;
    }
  }
  return {
    name: 'DKIM',
    level: 'BLOCKING',
    pass: allResolved,
    details,
  };
}

// === Check 3: DMARC ===
async function checkDmarc(): Promise<CheckResult> {
  try {
    const records = await dns.resolveTxt(DMARC_HOST);
    const flat = records.map((r) => r.join('')).join('\n');
    const isDmarc = /v=DMARC1/i.test(flat);
    if (!isDmarc) {
      return {
        name: 'DMARC',
        level: 'BLOCKING',
        pass: false,
        details: [`No v=DMARC1 record found at ${DMARC_HOST}`],
      };
    }
    // Capture policy (p=quarantine / p=reject / p=none)
    const policyMatch = flat.match(/p=(none|quarantine|reject)/i);
    const policy = policyMatch ? policyMatch[1] : 'unspecified';
    return {
      name: 'DMARC',
      level: 'BLOCKING',
      pass: true,
      details: [`DMARC valid: ${flat.slice(0, 200)}`],
      meta: { policy },
    };
  } catch (e) {
    return {
      name: 'DMARC',
      level: 'BLOCKING',
      pass: false,
      details: [`DNS query failed: ${(e as Error).message}`],
    };
  }
}

// === Check 4: HS token auth ===
async function checkHsAuth(): Promise<CheckResult> {
  try {
    const res = await hsApi('/crm/v3/objects/contacts?limit=1');
    return {
      name: 'HS_AUTH',
      level: 'BLOCKING',
      pass: res.status === 200,
      details: [
        `Token works: GET /crm/v3/objects/contacts?limit=1 → ${res.status}`,
        `Burst remaining: ${res.rateLimits.remaining}/${res.rateLimits.max}`,
        `Daily remaining: ${res.rateLimits.dailyRemaining}`,
      ],
      meta: { rateLimits: res.rateLimits },
    };
  } catch (e) {
    return {
      name: 'HS_AUTH',
      level: 'BLOCKING',
      pass: false,
      details: [`HS API call failed: ${(e as Error).message}`],
    };
  }
}

// === Check 5: EXISTING_HS_CONTACT ===
/**
 * Bulk-check the prospects' emails vs HubSpot.
 * Per Q8 — legacy upsert returns existing contact ID on match. We pre-check
 * here for two reasons:
 *   1. Logging — operator sees which prospects already exist before load
 *   2. Property-write strategy — we may want to NOT overwrite existing
 *      contact properties on subsequent loads (decision deferred to spec v6
 *      Path A loader logic, but the pre-check enables the audit).
 *
 * Returns WARNING level even when matches exist — this is informational,
 * not blocking.
 */
async function checkExistingContacts(
  emails: string[],
): Promise<CheckResult> {
  if (emails.length === 0) {
    return {
      name: 'EXISTING_HS_CONTACT',
      level: 'WARNING',
      pass: true,
      details: ['No prospects supplied — skipping check'],
    };
  }

  const existing: Array<{ email: string; id: string }> = [];
  const errors: string[] = [];

  // HS search endpoint accepts up to 100 filter values per call.
  const BATCH_SIZE = 100;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const slice = emails.slice(i, i + BATCH_SIZE);
    try {
      const res = await hsApi<{ results: Array<{ id: string; properties: { email: string } }> }>(
        '/crm/v3/objects/contacts/search',
        'POST',
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: 'IN',
                  values: slice.map((e) => e.toLowerCase()),
                },
              ],
            },
          ],
          properties: ['email'],
          limit: 100,
        },
      );
      for (const r of res.data.results || []) {
        existing.push({
          email: r.properties.email,
          id: r.id,
        });
      }
    } catch (e) {
      errors.push(
        `Batch ${i / BATCH_SIZE}: ${(e as Error).message.slice(0, 200)}`,
      );
    }
  }

  const details: string[] = [
    `Checked ${emails.length} prospect emails`,
    `Already-in-HS: ${existing.length}`,
  ];
  if (existing.length > 0) {
    details.push(
      `First few: ${existing.slice(0, 5).map((e) => `${e.email}=${e.id}`).join(', ')}`,
    );
  }
  if (errors.length > 0) {
    details.push(`Errors (treated as warnings): ${errors.length}`);
    details.push(...errors.slice(0, 3));
  }

  return {
    name: 'EXISTING_HS_CONTACT',
    level: 'WARNING',
    pass: errors.length === 0, // errors are warnings, but pass=false signals issues
    details,
    meta: { existing, errors },
  };
}

// === Check 6: UNSUBSCRIBE_ENABLED ===
/**
 * HubSpot doesn't expose sequence-level Unsubscribe settings via the v3 API.
 * We read an operator-confirmed flag from a config file or env var.
 *
 * Operator commits a JSON file at `data/showrev/p2-cold/unsubscribe-confirmed.json`
 * with shape:
 *   { "FC2026 - Mike Rutski Cold": true,
 *     "FC2026 - Nathan Dunn Cold": true,
 *     "FC2026 - Lucas Spencer Cold": true,
 *     "confirmed_at": "2026-06-11", "confirmed_by": "operator" }
 *
 * Missing file = BLOCKING (operator hasn't confirmed yet).
 */
async function checkUnsubscribeEnabled(
  sequenceNames: string[],
): Promise<CheckResult> {
  const { readFile } = await import('fs/promises');
  const { resolve } = await import('path');
  const configPath = resolve(
    process.cwd(),
    'data/showrev/p2-cold/unsubscribe-confirmed.json',
  );

  try {
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const missing: string[] = [];
    const confirmed: string[] = [];
    for (const seq of sequenceNames) {
      if (config[seq] === true) confirmed.push(seq);
      else missing.push(seq);
    }
    if (missing.length > 0) {
      return {
        name: 'UNSUBSCRIBE_ENABLED',
        level: 'BLOCKING',
        pass: false,
        details: [
          `Operator has NOT confirmed Unsubscribe enabled for: ${missing.join(', ')}`,
          `Confirmed sequences: ${confirmed.length}/${sequenceNames.length}`,
          `Confirmed_at: ${config.confirmed_at || '(missing)'}`,
        ],
      };
    }
    return {
      name: 'UNSUBSCRIBE_ENABLED',
      level: 'BLOCKING',
      pass: true,
      details: [
        `All ${sequenceNames.length} sequences have operator-confirmed Unsubscribe`,
        `Confirmed_at: ${config.confirmed_at || '(missing)'} by ${config.confirmed_by || '(missing)'}`,
      ],
    };
  } catch (e) {
    return {
      name: 'UNSUBSCRIBE_ENABLED',
      level: 'BLOCKING',
      pass: false,
      details: [
        `Cannot read ${configPath}: ${(e as Error).message}`,
        'Operator must commit a JSON file confirming Unsubscribe is enabled on each P2 cold sequence.',
        'Expected shape: { "<sequence name>": true, ..., "confirmed_at": "YYYY-MM-DD", "confirmed_by": "operator" }',
      ],
    };
  }
}

// === Orchestrator ===
export interface VerifyInput {
  prospectEmails: string[];
  sequenceNames: string[];
}

export async function runVerify(input: VerifyInput): Promise<VerifyReport> {
  const start = Date.now();

  // Run cheap checks first (DNS = parallel), then network checks
  const [spf, dkim, dmarc, hsAuth] = await Promise.all([
    checkSpf(),
    checkDkim(),
    checkDmarc(),
    checkHsAuth(),
  ]);

  const checks: CheckResult[] = [spf, dkim, dmarc, hsAuth];

  // Only run expensive checks if foundation is green
  const foundationOk = checks.every((c) => c.pass);
  if (foundationOk) {
    const existing = await checkExistingContacts(input.prospectEmails);
    const unsub = await checkUnsubscribeEnabled(input.sequenceNames);
    checks.push(existing, unsub);
  } else {
    checks.push({
      name: 'EXISTING_HS_CONTACT',
      level: 'WARNING',
      pass: false,
      details: ['Skipped — foundation checks failed'],
    });
    checks.push({
      name: 'UNSUBSCRIBE_ENABLED',
      level: 'BLOCKING',
      pass: false,
      details: ['Skipped — foundation checks failed'],
    });
  }

  const blockingFailures = checks.filter(
    (c) => c.level === 'BLOCKING' && !c.pass,
  ).length;
  const warnings = checks.filter(
    (c) => c.level === 'WARNING' && !c.pass,
  ).length;

  return {
    allPassed: blockingFailures === 0,
    blockingFailures,
    warnings,
    checks,
    durationMs: Date.now() - start,
  };
}

/**
 * Format a VerifyReport for human-readable output (CLI / logs).
 */
export function formatReport(report: VerifyReport): string {
  const lines: string[] = [];
  lines.push(
    `Pre-load verify report — ${report.allPassed ? 'PASS ✅' : 'FAIL ❌'} (${report.durationMs}ms)`,
  );
  lines.push(
    `  Blocking failures: ${report.blockingFailures}  |  Warnings: ${report.warnings}`,
  );
  for (const c of report.checks) {
    const icon = c.pass ? '✓' : c.level === 'BLOCKING' ? '✗' : '⚠';
    lines.push(`  ${icon} [${c.level}] ${c.name}`);
    for (const d of c.details) {
      lines.push(`      ${d}`);
    }
  }
  return lines.join('\n');
}
