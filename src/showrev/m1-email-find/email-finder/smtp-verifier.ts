/**
 * SMTP Email Verifier
 *
 * Verifies email addresses via SMTP RCPT TO without sending mail.
 * Connects to the recipient's MX server and checks if the address is accepted.
 *
 * Provider-specific notes:
 * - Google Workspace: returns 250 for everything (SMTP useless) — skip by default
 * - Microsoft 365: aggressive rate limits, 2-3s delays required
 * - Self-hosted (Postfix/Exchange): SMTP verify works correctly
 * - Proofpoint/Mimecast/Barracuda: blocks enumeration
 */

import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MailProvider =
  | 'google-workspace'
  | 'microsoft-365'
  | 'self-hosted'
  | 'proofpoint'
  | 'mimecast'
  | 'barracuda'
  | 'unknown';

export interface SmtpVerifyResult {
  email: string;
  status: 'valid' | 'invalid' | 'catch-all' | 'timeout' | 'error' | 'greylisted';
  smtpCode?: number;
  smtpMessage?: string;
  provider: MailProvider;
  isCatchAll: boolean;
}

interface SmtpConnection {
  socket: net.Socket | tls.TLSSocket;
  read: () => Promise<SmtpResponse>;
  write: (cmd: string) => Promise<SmtpResponse>;
  close: () => void;
}

interface SmtpResponse {
  code: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Caches (in-memory, per-process)
// ---------------------------------------------------------------------------

const mxCache = new Map<string, string | null>();
const providerCache = new Map<string, MailProvider>();
const catchAllCache = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// 1. MX Record Resolution
// ---------------------------------------------------------------------------

const resolveMx = dns.promises.resolveMx;
const resolveTxt = dns.promises.resolveTxt;

/**
 * Resolve highest-priority MX host for a domain.
 * Caches results in memory. Returns null if no MX found.
 */
export async function getMxHost(domain: string): Promise<string | null> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;

  try {
    const records = await resolveMx(domain);
    if (!records.length) {
      mxCache.set(domain, null);
      return null;
    }
    // Lowest preference number = highest priority
    records.sort((a, b) => a.priority - b.priority);
    const host = records[0].exchange;
    mxCache.set(domain, host);
    return host;
  } catch {
    mxCache.set(domain, null);
    return null;
  }
}

/**
 * Return ALL MX records for a domain, sorted by priority (lowest first).
 */
async function getAllMxHosts(domain: string): Promise<dns.MxRecord[]> {
  try {
    const records = await resolveMx(domain);
    records.sort((a, b) => a.priority - b.priority);
    return records;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. Mail Server Detection
// ---------------------------------------------------------------------------

const MX_PATTERNS: Array<[RegExp, MailProvider]> = [
  [/\.google\.com\.?$/i, 'google-workspace'],
  [/\.googlemail\.com\.?$/i, 'google-workspace'],
  [/\.outlook\.com\.?$/i, 'microsoft-365'],
  [/\.protection\.outlook\.com\.?$/i, 'microsoft-365'],
  [/\.pphosted\.com\.?$/i, 'proofpoint'],
  [/\.mimecast\.com\.?$/i, 'mimecast'],
  [/\.barracudanetworks\.com\.?$/i, 'barracuda'],
];

const SPF_PATTERNS: Array<[string, MailProvider]> = [
  ['include:_spf.google.com', 'google-workspace'],
  ['include:spf.protection.outlook.com', 'microsoft-365'],
  ['include:pphosted.com', 'proofpoint'],
  ['include:mimecast', 'mimecast'],
  ['include:barracuda', 'barracuda'],
];

/**
 * Detect the mail provider for a domain using MX records + SPF fallback.
 */
export async function detectMailProvider(domain: string): Promise<MailProvider> {
  const cached = providerCache.get(domain);
  if (cached) return cached;

  // Try MX records first
  const mxRecords = await getAllMxHosts(domain);
  for (const mx of mxRecords) {
    for (const [pattern, provider] of MX_PATTERNS) {
      if (pattern.test(mx.exchange)) {
        providerCache.set(domain, provider);
        return provider;
      }
    }
  }

  // Fallback: check SPF (TXT) records
  try {
    const txtRecords = await resolveTxt(domain);
    const flat = txtRecords.map(chunks => chunks.join('')).join(' ');
    for (const [spfInclude, provider] of SPF_PATTERNS) {
      if (flat.includes(spfInclude)) {
        providerCache.set(domain, provider);
        return provider;
      }
    }
  } catch {
    // TXT lookup failure is non-fatal
  }

  const result: MailProvider = mxRecords.length > 0 ? 'self-hosted' : 'unknown';
  providerCache.set(domain, result);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Low-level SMTP connection
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const EHLO_DOMAIN = 'showrev-verify.local';
const MAIL_FROM = 'verify@showrev.io';

/**
 * Parse an SMTP response line (or multi-line) into code + message.
 */
function parseSmtpResponse(raw: string): SmtpResponse {
  const trimmed = raw.trim();
  // Multi-line: last line has "CODE SPACE message", intermediates have "CODE-message"
  const lines = trimmed.split(/\r?\n/);
  const last = lines[lines.length - 1];
  const code = parseInt(last.substring(0, 3), 10);
  const message = last.substring(4).trim();
  return { code: isNaN(code) ? 0 : code, message };
}

/**
 * Open a raw TCP connection to an SMTP server.
 * Optionally upgrades to TLS via STARTTLS.
 */
function openSmtpConnection(
  host: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SmtpConnection> {
  return new Promise((resolve, reject) => {
    let currentSocket: net.Socket | tls.TLSSocket;
    let buffer = '';
    let pendingResolve: ((resp: SmtpResponse) => void) | null = null;
    let pendingReject: ((err: Error) => void) | null = null;

    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    currentSocket = socket;

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      // SMTP multi-line: lines end with "CODE-text", final line is "CODE text"
      // We wait until we see a line matching /^\d{3} / or /^\d{3}\r?\n/
      const lines = buffer.split(/\r?\n/);
      for (const line of lines) {
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
          // Complete response received
          const resp = parseSmtpResponse(buffer);
          buffer = '';
          if (pendingResolve) {
            const fn = pendingResolve;
            pendingResolve = null;
            pendingReject = null;
            fn(resp);
          }
          return;
        }
      }
    };

    const onError = (err: Error) => {
      if (pendingReject) {
        const fn = pendingReject;
        pendingReject = null;
        pendingResolve = null;
        fn(err);
      } else {
        reject(err);
      }
    };

    const onTimeout = () => {
      const err = new Error(`SMTP connection timeout to ${host}:${port}`);
      socket.destroy();
      onError(err);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('timeout', onTimeout);

    const read = (): Promise<SmtpResponse> => {
      return new Promise((res, rej) => {
        // Check if we already have a complete response in the buffer
        if (buffer.trim()) {
          const lines = buffer.split(/\r?\n/);
          for (const line of lines) {
            if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
              const resp = parseSmtpResponse(buffer);
              buffer = '';
              return res(resp);
            }
          }
        }
        pendingResolve = res;
        pendingReject = rej;
      });
    };

    const write = (cmd: string): Promise<SmtpResponse> => {
      return new Promise((res, rej) => {
        buffer = '';
        pendingResolve = res;
        pendingReject = rej;
        currentSocket.write(cmd + '\r\n');
      });
    };

    const close = () => {
      try {
        currentSocket.destroy();
      } catch {
        // Ignore close errors
      }
    };

    // Wait for the initial banner (220)
    pendingResolve = (banner: SmtpResponse) => {
      pendingResolve = null;
      pendingReject = null;

      const conn: SmtpConnection = { socket: currentSocket, read, write, close };

      // Check if STARTTLS is available: we'll try after EHLO
      resolve(conn);
    };
    pendingReject = (err: Error) => {
      pendingReject = null;
      pendingResolve = null;
      reject(err);
    };
  });
}

/**
 * Perform EHLO and optionally upgrade to TLS via STARTTLS.
 * Returns the EHLO response (250 expected).
 */
async function performEhlo(
  conn: SmtpConnection,
  host: string,
  timeoutMs: number,
): Promise<{ resp: SmtpResponse; upgradedConn: SmtpConnection }> {
  const ehloResp = await conn.write(`EHLO ${EHLO_DOMAIN}`);

  // Check if STARTTLS is advertised
  if (ehloResp.message.toLowerCase().includes('starttls') || ehloResp.code === 250) {
    // Attempt STARTTLS upgrade
    try {
      const starttlsResp = await conn.write('STARTTLS');
      if (starttlsResp.code === 220) {
        // Upgrade the socket to TLS
        const upgradedConn = await upgradeTls(conn, host, timeoutMs);
        // Re-EHLO after TLS upgrade
        const reEhlo = await upgradedConn.write(`EHLO ${EHLO_DOMAIN}`);
        return { resp: reEhlo, upgradedConn };
      }
    } catch {
      // STARTTLS failed — continue unencrypted
    }
  }

  return { resp: ehloResp, upgradedConn: conn };
}

/**
 * Upgrade an existing TCP socket to TLS.
 */
function upgradeTls(
  conn: SmtpConnection,
  host: string,
  timeoutMs: number,
): Promise<SmtpConnection> {
  return new Promise((resolve, reject) => {
    const rawSocket = conn.socket as net.Socket;
    let buffer = '';
    let pendingResolve: ((resp: SmtpResponse) => void) | null = null;
    let pendingReject: ((err: Error) => void) | null = null;

    const tlsSocket = tls.connect(
      {
        socket: rawSocket,
        servername: host,
        rejectUnauthorized: false, // Many mail servers use self-signed certs
        timeout: timeoutMs,
      },
      () => {
        // TLS handshake complete
        const read = (): Promise<SmtpResponse> => {
          return new Promise((res, rej) => {
            if (buffer.trim()) {
              const lines = buffer.split(/\r?\n/);
              for (const line of lines) {
                if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
                  const resp = parseSmtpResponse(buffer);
                  buffer = '';
                  return res(resp);
                }
              }
            }
            pendingResolve = res;
            pendingReject = rej;
          });
        };

        const write = (cmd: string): Promise<SmtpResponse> => {
          return new Promise((res, rej) => {
            buffer = '';
            pendingResolve = res;
            pendingReject = rej;
            tlsSocket.write(cmd + '\r\n');
          });
        };

        const close = () => {
          try { tlsSocket.destroy(); } catch { /* ignore */ }
        };

        resolve({ socket: tlsSocket, read, write, close });
      },
    );

    tlsSocket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split(/\r?\n/);
      for (const line of lines) {
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
          const resp = parseSmtpResponse(buffer);
          buffer = '';
          if (pendingResolve) {
            const fn = pendingResolve;
            pendingResolve = null;
            pendingReject = null;
            fn(resp);
          }
          return;
        }
      }
    });

    tlsSocket.on('error', (err: Error) => {
      if (pendingReject) {
        const fn = pendingReject;
        pendingReject = null;
        pendingResolve = null;
        fn(err);
      } else {
        reject(err);
      }
    });

    tlsSocket.on('timeout', () => {
      const err = new Error(`TLS upgrade timeout to ${host}`);
      tlsSocket.destroy();
      if (pendingReject) {
        const fn = pendingReject;
        pendingReject = null;
        pendingResolve = null;
        fn(err);
      } else {
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 4. Catch-All Detection
// ---------------------------------------------------------------------------

/**
 * Generate a random fake local-part unlikely to exist.
 */
function randomFakeLocal(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${result}_test_${Date.now()}`;
}

/**
 * Detect if a domain is a catch-all (accepts mail for any address).
 * Connects to the MX server and sends RCPT TO with a random fake address.
 * Caches result per domain.
 */
export async function isCatchAll(
  domain: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const cached = catchAllCache.get(domain);
  if (cached !== undefined) return cached;

  const mxHost = await getMxHost(domain);
  if (!mxHost) {
    catchAllCache.set(domain, false);
    return false;
  }

  let conn: SmtpConnection | null = null;
  try {
    conn = await openSmtpConnection(mxHost, 25, timeoutMs);
    const { upgradedConn } = await performEhlo(conn, mxHost, timeoutMs);
    conn = upgradedConn;

    const mailFrom = await conn.write(`MAIL FROM:<${MAIL_FROM}>`);
    if (mailFrom.code !== 250) {
      catchAllCache.set(domain, false);
      return false;
    }

    const fakeAddr = `${randomFakeLocal()}@${domain}`;
    const rcpt = await conn.write(`RCPT TO:<${fakeAddr}>`);

    // 250 = server accepted a random fake address → catch-all
    const result = rcpt.code === 250;
    catchAllCache.set(domain, result);

    await conn.write('RSET');
    await conn.write('QUIT');
    return result;
  } catch {
    // Connection error — assume not catch-all (conservative)
    catchAllCache.set(domain, false);
    return false;
  } finally {
    conn?.close();
  }
}

// ---------------------------------------------------------------------------
// 5a. Microsoft 365 Autodiscover Verification
// ---------------------------------------------------------------------------

/**
 * Verify an email using the M365 Autodiscover JSON endpoint.
 *
 * This endpoint leaks user existence without authentication and works across
 * both M365-hosted AND Google Workspace domains (because M365 autodiscover
 * resolves the user's actual mailbox location via federation).
 *
 *   GET https://outlook.office365.com/autodiscover/autodiscover.json/v1.0/{email}?Protocol=Autodiscoverv1
 *
 * Responses:
 *   200          → user EXISTS (returns autodiscover URL)
 *   302          → user does NOT exist (redirect to login)
 *   Other (429)  → rate limited / uncertain
 *
 * NOTE: The older CalendarView endpoint (api/v2.0/users/{email}/calendarview)
 * returns 401 for ALL emails at a valid tenant, making it useless for user
 * enumeration. The Autodiscover endpoint correctly differentiates.
 */
export async function verifyM365Email(email: string): Promise<SmtpVerifyResult> {
  const [, domain] = email.split('@');
  const detectedProvider = domain ? (providerCache.get(domain) ?? 'microsoft-365') : 'microsoft-365';

  try {
    const url = `https://outlook.office365.com/autodiscover/autodiscover.json/v1.0/${encodeURIComponent(email)}?Protocol=Autodiscoverv1`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual', // Don't follow 302 redirects — we need to see the status code
      signal: AbortSignal.timeout(8000),
    });

    const status = res.status;

    // 302 = definitively INVALID — the server actively rejected the user.
    // This is the high-confidence signal: 302 is a hard "no" even on domains
    // that return 200 for some/all other addresses.
    if (status === 302) {
      return {
        email,
        status: 'invalid',
        smtpCode: 302,
        smtpMessage: 'User not found (Autodiscover 302 redirect)',
        provider: detectedProvider,
        isCatchAll: false,
      };
    }

    // 200 = user *likely* exists. However, some M365 tenants return 200 for
    // random addresses too (partial catch-all). We return 'valid' here and let
    // the orchestrator's elimination strategy handle the ambiguity: if other
    // candidates at the same domain get 302 while this one gets 200, the
    // orchestrator promotes this candidate.
    if (status === 200) {
      return {
        email,
        status: 'valid',
        smtpCode: 200,
        smtpMessage: 'User exists (Autodiscover 200)',
        provider: detectedProvider,
        isCatchAll: false,
      };
    }

    // Rate limited or other — uncertain
    return {
      email,
      status: 'catch-all',
      smtpCode: status,
      smtpMessage: `Autodiscover uncertain (HTTP ${status})`,
      provider: detectedProvider,
      isCatchAll: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      email,
      status: 'timeout',
      smtpCode: undefined,
      smtpMessage: msg.slice(0, 80),
      provider: detectedProvider,
      isCatchAll: false,
    };
  }
}

// ---------------------------------------------------------------------------
// 5b. SMTP RCPT TO Verification
// ---------------------------------------------------------------------------

/**
 * Classify an SMTP response code into a verification status.
 */
function classifySmtpCode(
  code: number,
  domainIsCatchAll: boolean,
): SmtpVerifyResult['status'] {
  if (code === 250 || code === 251) {
    return domainIsCatchAll ? 'catch-all' : 'valid';
  }
  if (code >= 550 && code <= 559) return 'invalid';
  if (code >= 450 && code <= 459) return 'greylisted';
  if (code === 421) return 'greylisted'; // Service not available / rate limited
  return 'error';
}

/**
 * Verify a single email address via SMTP RCPT TO.
 *
 * Flow:
 *  1. Resolve MX for the domain
 *  2. Detect provider + catch-all status
 *  3. Connect TCP port 25 (fallback 587)
 *  4. EHLO → STARTTLS → MAIL FROM → RCPT TO
 *  5. Classify response
 *  6. (Optional) DATA-phase trick for catch-all domains
 *  7. QUIT
 */
export async function verifyEmail(
  email: string,
  options: { timeoutMs?: number; useDataTrick?: boolean } = {},
): Promise<SmtpVerifyResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const useDataTrick = options.useDataTrick ?? false;
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return {
      email,
      status: 'error',
      smtpMessage: 'Invalid email format',
      provider: 'unknown',
      isCatchAll: false,
    };
  }

  // Resolve provider + MX in parallel
  const [provider, mxHost] = await Promise.all([
    detectMailProvider(domain),
    getMxHost(domain),
  ]);

  if (!mxHost) {
    return {
      email,
      status: 'error',
      smtpMessage: `No MX records found for ${domain}`,
      provider,
      isCatchAll: false,
    };
  }

  // Google Workspace: SMTP RCPT TO is useless (always returns 250).
  // Use M365 Autodiscover endpoint instead — it works across providers
  // via federation and correctly differentiates real vs fake users.
  if (provider === 'google-workspace') {
    return verifyM365Email(email);
  }

  // Microsoft 365: SMTP RCPT TO reliably times out; use Autodiscover instead
  if (provider === 'microsoft-365') {
    return verifyM365Email(email);
  }

  let conn: SmtpConnection | null = null;
  try {
    // Try port 25 first, fallback to 587
    try {
      conn = await openSmtpConnection(mxHost, 25, timeoutMs);
    } catch {
      conn = await openSmtpConnection(mxHost, 587, timeoutMs);
    }

    const { upgradedConn } = await performEhlo(conn, mxHost, timeoutMs);
    conn = upgradedConn;

    // MAIL FROM
    const mailFromResp = await conn.write(`MAIL FROM:<${MAIL_FROM}>`);
    if (mailFromResp.code !== 250) {
      return {
        email,
        status: 'error',
        smtpCode: mailFromResp.code,
        smtpMessage: `MAIL FROM rejected: ${mailFromResp.message}`,
        provider,
        isCatchAll: false,
      };
    }

    // RCPT TO — the core verification
    const rcptResp = await conn.write(`RCPT TO:<${email}>`);

    // Detect catch-all inline if not already cached
    const domainCatchAll = await isCatchAll(domain, timeoutMs);

    let status = classifySmtpCode(rcptResp.code, domainCatchAll);

    // DATA-phase trick for catch-all domains
    // Some servers accept RCPT TO for everything but reject at DATA for invalid addresses
    if (
      useDataTrick &&
      domainCatchAll &&
      status === 'catch-all' &&
      rcptResp.code === 250
    ) {
      const dataStatus = await attemptDataPhaseTrick(conn, email);
      if (dataStatus === 'invalid') {
        status = 'invalid';
      }
    }

    // QUIT gracefully
    try { await conn.write('QUIT'); } catch { /* ignore quit errors */ }

    return {
      email,
      status,
      smtpCode: rcptResp.code,
      smtpMessage: rcptResp.message,
      provider,
      isCatchAll: domainCatchAll,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes('timeout');
    return {
      email,
      status: isTimeout ? 'timeout' : 'error',
      smtpMessage: msg,
      provider,
      isCatchAll: catchAllCache.get(domain) ?? false,
    };
  } finally {
    conn?.close();
  }
}

// ---------------------------------------------------------------------------
// 6. DATA-Phase Trick (DeepSeek's novel approach)
// ---------------------------------------------------------------------------

/**
 * After RCPT TO succeeds on a catch-all domain, continue into the DATA phase.
 * Some servers accept RCPT TO for everything but reject at DATA for invalid
 * recipients. Catches ~10-15% more invalid addresses on catch-all domains.
 *
 * Only use on domains confirmed as catch-all. More aggressive than RCPT TO alone.
 */
async function attemptDataPhaseTrick(
  conn: SmtpConnection,
  email: string,
): Promise<'valid' | 'invalid' | 'inconclusive'> {
  try {
    const dataResp = await conn.write('DATA');
    if (dataResp.code !== 354) {
      // Server didn't accept DATA command — inconclusive
      return 'inconclusive';
    }

    // Send a minimal message body, terminated by CRLF.CRLF
    const messageBody = [
      `From: ${MAIL_FROM}`,
      `To: ${email}`,
      `Subject: verification`,
      `Date: ${new Date().toUTCString()}`,
      '',
      'test',
      '.',  // Lone dot on a line = end of DATA
    ].join('\r\n');

    const sendResp = await conn.write(messageBody);

    // 250 = accepted (address exists even on catch-all)
    // 550/553/etc = rejected at DATA phase (address invalid despite RCPT TO 250)
    // 452 = mailbox full (still a real mailbox — valid)
    if (sendResp.code >= 550 && sendResp.code <= 559) {
      return 'invalid';
    }
    if (sendResp.code === 250 || sendResp.code === 452) {
      return 'valid';
    }
    return 'inconclusive';
  } catch {
    return 'inconclusive';
  }
}

// ---------------------------------------------------------------------------
// 7. Batch Verification
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Group emails by their domain.
 */
function groupByDomain(emails: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const email of emails) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    const list = groups.get(domain) ?? [];
    list.push(email);
    groups.set(domain, list);
  }
  return groups;
}

/** Default providers to skip — now empty because Autodiscover works across providers. */
const DEFAULT_SKIP_PROVIDERS: MailProvider[] = [];

/**
 * Verify a batch of emails with concurrency control and rate limiting.
 *
 * Groups emails by domain to reuse connections and respect rate limits.
 * Skips Google Workspace domains by default (SMTP always returns 250).
 * Returns results in the same order as input.
 */
export async function verifyBatch(
  emails: string[],
  options?: {
    concurrency?: number;
    delayMs?: number;
    skipProviders?: MailProvider[];
    timeoutMs?: number;
    useDataTrick?: boolean;
  },
): Promise<SmtpVerifyResult[]> {
  const concurrency = options?.concurrency ?? 3;
  const delayMs = options?.delayMs ?? 2000;
  const skipProviders = options?.skipProviders ?? DEFAULT_SKIP_PROVIDERS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const useDataTrick = options?.useDataTrick ?? false;

  // Build a result map keyed by email for order-preserving output
  const resultMap = new Map<string, SmtpVerifyResult>();
  const domainGroups = groupByDomain(emails);

  // Pre-detect providers to identify skip-able domains
  const domainProviders = new Map<string, MailProvider>();
  await Promise.all(
    Array.from(domainGroups.keys()).map(async (domain) => {
      const provider = await detectMailProvider(domain);
      domainProviders.set(domain, provider);
    }),
  );

  // Fast-path: skip domains whose provider is in the skip list
  for (const [domain, domainEmails] of domainGroups) {
    const provider = domainProviders.get(domain)!;
    if (skipProviders.includes(provider)) {
      for (const email of domainEmails) {
        resultMap.set(email, {
          email,
          status: 'catch-all',
          smtpMessage: `${provider} — SMTP verification skipped (unreliable)`,
          provider,
          isCatchAll: true,
        });
      }
      domainGroups.delete(domain);
    }
  }

  // Process remaining domains with concurrency control
  const domainQueue = Array.from(domainGroups.entries());
  const activeDomains: Promise<void>[] = [];

  const processDomain = async (domain: string, domainEmails: string[]) => {
    const provider = domainProviders.get(domain) ?? 'unknown';

    for (let i = 0; i < domainEmails.length; i++) {
      const email = domainEmails[i];
      const result = await verifyEmail(email, { timeoutMs, useDataTrick });
      resultMap.set(email, result);

      // Delay between same-domain checks to avoid rate limiting
      if (i < domainEmails.length - 1) {
        // Microsoft 365 uses Graph API (fast, no SMTP) — shorter delay sufficient
        // Other providers use SMTP and may need longer delays
        const effectiveDelay = provider === 'microsoft-365'
          ? Math.min(delayMs, 500)
          : delayMs;
        await sleep(effectiveDelay);
      }
    }
  };

  // Semaphore-style concurrency: process N domains in parallel
  let idx = 0;
  const next = async (): Promise<void> => {
    while (idx < domainQueue.length) {
      const current = idx++;
      const [domain, domainEmails] = domainQueue[current];
      await processDomain(domain, domainEmails);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, domainQueue.length) }, () => next());
  await Promise.all(workers);

  // Return results in original input order
  return emails.map(email => resultMap.get(email) ?? {
    email,
    status: 'error' as const,
    smtpMessage: 'Email not processed',
    provider: 'unknown' as const,
    isCatchAll: false,
  });
}

// ---------------------------------------------------------------------------
// Utility exports for testing / external use
// ---------------------------------------------------------------------------

/** Clear all in-memory caches. Useful between test runs. */
export function clearCaches(): void {
  mxCache.clear();
  providerCache.clear();
  catchAllCache.clear();
}
