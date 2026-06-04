/**
 * orchestrator.ts
 *
 * Waterfall pipeline: name + company -> verified email address.
 *
 * Steps: Domain Resolution -> Pattern Detection -> Candidate Generation
 *        -> Apollo Enrichment (optional) -> Mail Provider Detection
 *        -> SMTP Verification -> Confidence Assignment
 *
 * All network I/O is dependency-injected (searchFn, fetchFn, apolloFn)
 * so the module is testable with no external deps beyond Node.js builtins.
 */

import { resolveDomain } from './domain-resolver.js';
import type { DomainResult } from './domain-resolver.js';
import { generateCandidates, detectPatternFromWeb, inferPattern } from './pattern-detector.js';
import type { EmailPattern, CandidateEmail, PatternResult } from './pattern-detector.js';
import { verifyEmail, detectMailProvider } from './smtp-verifier.js';
import type { SmtpVerifyResult, MailProvider } from './smtp-verifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactInput {
  firstName: string;
  lastName: string;
  company: string;
  title?: string;
  companyUrl?: string;
  state?: string;
}

export interface EmailFinderResult {
  contact: ContactInput;
  email: string | null;
  confidence: 'green' | 'yellow' | 'amber' | 'red' | 'not-found';
  domain: string | null;
  pattern: string | null;
  verificationStatus: 'valid' | 'catch-all' | 'unverified' | 'invalid' | 'skipped';
  mailProvider: string;
  tacticsAttempted: string[];
  tacticsSucceeded: string[];
  duration: number;
  timestamp: string;
}

export interface OrchestratorOptions {
  searchFn?: (query: string) => Promise<string[]>;
  fetchFn?: (url: string) => Promise<string>;
  smtpVerify?: boolean;
  concurrency?: number;
  delayBetweenDomains?: number;
  apolloFn?: (firstName: string, lastName: string, domain: string) => Promise<string | null>;
  skipProviders?: string[];
}

interface BatchSummary {
  total: number;
  green: number;
  yellow: number;
  amber: number;
  red: number;
  notFound: number;
  hitRate: string;
  avgDuration: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DELAY_BETWEEN_DOMAINS_MS = 2_000;
const DEFAULT_SKIP_PROVIDERS = ['google-workspace'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ms(): number {
  return Date.now();
}

function prefix(): string {
  return '[email-finder]';
}

/** Delay for a given number of milliseconds. */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Group contacts by company name (lowercased) for domain reuse. */
function groupByCompany(contacts: ContactInput[]): Map<string, ContactInput[]> {
  const map = new Map<string, ContactInput[]>();
  for (const c of contacts) {
    const key = c.company.toLowerCase().trim();
    const group = map.get(key) ?? [];
    group.push(c);
    map.set(key, group);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Per-company cache to avoid redundant domain/pattern lookups
// ---------------------------------------------------------------------------

interface CompanyCache {
  domain: DomainResult | null;
  pattern: PatternResult | null;
  provider: MailProvider | null;
  emailsFound: string[];
}

// ---------------------------------------------------------------------------
// Single contact pipeline
// ---------------------------------------------------------------------------

/**
 * Find the email for a single contact. Uses an optional companyCache to avoid
 * redundant domain/pattern lookups when processing multiple contacts at the
 * same company.
 */
async function findEmailForContact(
  contact: ContactInput,
  options: OrchestratorOptions,
  companyCache?: CompanyCache,
): Promise<EmailFinderResult> {
  const t0 = ms();
  const tacticsAttempted: string[] = [];
  const tacticsSucceeded: string[] = [];

  const smtpEnabled = options.smtpVerify !== false;
  const skipProviders = options.skipProviders ?? DEFAULT_SKIP_PROVIDERS;

  let domainResult: DomainResult | null = companyCache?.domain ?? null;
  let patternResult: PatternResult | null = companyCache?.pattern ?? null;
  let provider: MailProvider | null = companyCache?.provider ?? null;
  let emailsFromDomain: string[] = companyCache?.emailsFound ?? [];

  // -----------------------------------------------------------------------
  // Step 1: DOMAIN RESOLUTION
  // -----------------------------------------------------------------------
  if (!domainResult) {
    tacticsAttempted.push('domain-resolution');
    console.log(`${prefix()} Step 1: resolving domain for "${contact.company}"`);
    const t1 = ms();

    try {
      domainResult = await resolveDomain(contact.company, contact.companyUrl, {
        searchFn: options.searchFn,
        fetchFn: options.fetchFn,
      });
    } catch (err) {
      console.log(`${prefix()} Step 1 error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (domainResult) {
      tacticsSucceeded.push('domain-resolution');
      emailsFromDomain = domainResult.emailsFound ?? [];
      console.log(`${prefix()} Step 1 complete (${ms() - t1}ms): domain=${domainResult.domain}, confidence=${domainResult.confidence}`);
    } else {
      console.log(`${prefix()} Step 1 complete (${ms() - t1}ms): no domain found`);
      return buildResult(contact, {
        email: null,
        confidence: 'not-found',
        domain: null,
        pattern: null,
        verificationStatus: 'skipped',
        mailProvider: 'unknown',
        tacticsAttempted,
        tacticsSucceeded,
        duration: ms() - t0,
      });
    }

    // Populate cache for sibling contacts at same company
    if (companyCache) {
      companyCache.domain = domainResult;
      companyCache.emailsFound = emailsFromDomain;
    }
  } else {
    tacticsAttempted.push('domain-resolution (cached)');
    tacticsSucceeded.push('domain-resolution (cached)');
  }

  const domain = domainResult.domain;

  // -----------------------------------------------------------------------
  // Step 2: PATTERN DETECTION
  // -----------------------------------------------------------------------
  if (!patternResult) {
    tacticsAttempted.push('pattern-detection');
    console.log(`${prefix()} Step 2: detecting email pattern for ${domain}`);
    const t2 = ms();

    try {
      // Try web scraping first
      if (options.fetchFn) {
        patternResult = await detectPatternFromWeb(domain, options.fetchFn);
      }

      // If no pattern from web, try inferring from found emails
      if (!patternResult && emailsFromDomain.length > 0) {
        // inferPattern needs a single email + first/last name; use each found email
        // and the current contact's name to detect the domain's pattern
        for (const foundEmail of emailsFromDomain) {
          const inferred: EmailPattern = inferPattern(foundEmail, contact.firstName, contact.lastName);
          if (inferred !== 'unknown') {
            patternResult = {
              pattern: inferred,
              confidence: 0.5,
              source: `inferred from domain email: ${foundEmail}`,
            };
            break;
          }
        }
      }
    } catch (err) {
      console.log(`${prefix()} Step 2 error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (patternResult) {
      tacticsSucceeded.push('pattern-detection');
      console.log(`${prefix()} Step 2 complete (${ms() - t2}ms): pattern=${patternResult.pattern}, confidence=${patternResult.confidence}`);
    } else {
      console.log(`${prefix()} Step 2 complete (${ms() - t2}ms): no pattern detected`);
    }

    if (companyCache) {
      companyCache.pattern = patternResult;
    }
  } else {
    tacticsAttempted.push('pattern-detection (cached)');
    tacticsSucceeded.push('pattern-detection (cached)');
  }

  // -----------------------------------------------------------------------
  // Step 3: CANDIDATE GENERATION
  // -----------------------------------------------------------------------
  tacticsAttempted.push('candidate-generation');
  console.log(`${prefix()} Step 3: generating candidates for ${contact.firstName} ${contact.lastName}@${domain}`);
  const t3 = ms();

  let candidates: CandidateEmail[];
  try {
    candidates = generateCandidates(
      contact.firstName,
      contact.lastName,
      domain,
      patternResult?.pattern ?? undefined,
    );
  } catch (err) {
    console.log(`${prefix()} Step 3 error: ${err instanceof Error ? err.message : String(err)}`);
    candidates = [];
  }

  if (candidates.length > 0) {
    tacticsSucceeded.push('candidate-generation');
  }
  console.log(`${prefix()} Step 3 complete (${ms() - t3}ms): ${candidates.length} candidates`);

  // -----------------------------------------------------------------------
  // Step 4: OPTIONAL APOLLO ENRICHMENT
  // -----------------------------------------------------------------------
  if (options.apolloFn) {
    tacticsAttempted.push('apollo-enrichment');
    console.log(`${prefix()} Step 4: Apollo enrichment for ${contact.firstName} ${contact.lastName} @ ${domain}`);
    const t4 = ms();

    try {
      const apolloEmail = await options.apolloFn(contact.firstName, contact.lastName, domain);
      if (apolloEmail) {
        tacticsSucceeded.push('apollo-enrichment');
        // Promote Apollo result to top of candidates
        // Apollo enrichment doesn't map to a known EmailPattern;
        // use 'unknown' and let the email speak for itself
        const apolloCandidate: CandidateEmail = {
          email: apolloEmail.toLowerCase(),
          pattern: 'unknown',
          rank: 0,
        };
        // Remove duplicate if present, then prepend
        candidates = candidates.filter(
          (c) => c.email.toLowerCase() !== apolloEmail.toLowerCase(),
        );
        candidates.unshift(apolloCandidate);
        console.log(`${prefix()} Step 4 complete (${ms() - t4}ms): Apollo returned ${apolloEmail}`);
      } else {
        console.log(`${prefix()} Step 4 complete (${ms() - t4}ms): Apollo returned nothing`);
      }
    } catch (err) {
      console.log(`${prefix()} Step 4 error (${ms() - t4}ms): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 5: MAIL PROVIDER DETECTION
  // -----------------------------------------------------------------------
  if (!provider) {
    tacticsAttempted.push('provider-detection');
    console.log(`${prefix()} Step 5: detecting mail provider for ${domain}`);
    const t5 = ms();

    try {
      provider = await detectMailProvider(domain);
    } catch (err) {
      console.log(`${prefix()} Step 5 error: ${err instanceof Error ? err.message : String(err)}`);
      provider = 'unknown';
    }

    console.log(`${prefix()} Step 5 complete (${ms() - t5}ms): provider=${provider}`);

    if (companyCache) {
      companyCache.provider = provider;
    }
  } else {
    tacticsAttempted.push('provider-detection (cached)');
  }

  // -----------------------------------------------------------------------
  // Step 6: SMTP VERIFICATION
  // -----------------------------------------------------------------------
  const providerStr: string = provider ?? 'unknown';
  const shouldSkipSmtp =
    !smtpEnabled ||
    skipProviders.includes(providerStr);

  if (shouldSkipSmtp) {
    tacticsAttempted.push('smtp-verification (skipped)');
    console.log(`${prefix()} Step 6: SMTP skipped (enabled=${smtpEnabled}, provider=${providerStr})`);

    // No SMTP — use best candidate with pattern confidence
    const bestCandidate = candidates[0] ?? null;

    if (!bestCandidate) {
      return buildResult(contact, {
        email: null,
        confidence: 'red',
        domain,
        pattern: patternResult?.pattern ?? null,
        verificationStatus: 'skipped',
        mailProvider: providerStr,
        tacticsAttempted,
        tacticsSucceeded,
        duration: ms() - t0,
      });
    }

    // Confidence depends on pattern quality (confidence is a 0-1 number)
    const confidence = patternResult
      ? (patternResult.confidence >= 0.7 ? 'amber' : 'red')
      : 'red';

    return buildResult(contact, {
      email: bestCandidate.email,
      confidence,
      domain,
      pattern: bestCandidate.pattern ?? patternResult?.pattern ?? null,
      verificationStatus: 'skipped',
      mailProvider: providerStr,
      tacticsAttempted,
      tacticsSucceeded,
      duration: ms() - t0,
    });
  }

  // SMTP is enabled and provider supports it
  tacticsAttempted.push('smtp-verification');
  console.log(`${prefix()} Step 6: SMTP verification — ${candidates.length} candidates to check`);
  const t6 = ms();

  for (const candidate of candidates) {
    try {
      const result: SmtpVerifyResult = await verifyEmail(candidate.email);

      if (result.status === 'valid') {
        tacticsSucceeded.push('smtp-verification');
        console.log(`${prefix()} Step 6 complete (${ms() - t6}ms): ${candidate.email} = valid`);
        return buildResult(contact, {
          email: candidate.email,
          confidence: 'green',
          domain,
          pattern: candidate.pattern ?? patternResult?.pattern ?? null,
          verificationStatus: 'valid',
          mailProvider: providerStr,
          tacticsAttempted,
          tacticsSucceeded,
          duration: ms() - t0,
        });
      }

      if (result.status === 'catch-all') {
        tacticsSucceeded.push('smtp-verification (catch-all)');
        console.log(`${prefix()} Step 6 complete (${ms() - t6}ms): ${candidate.email} = catch-all`);
        return buildResult(contact, {
          email: candidate.email,
          confidence: 'yellow',
          domain,
          pattern: candidate.pattern ?? patternResult?.pattern ?? null,
          verificationStatus: 'catch-all',
          mailProvider: providerStr,
          tacticsAttempted,
          tacticsSucceeded,
          duration: ms() - t0,
        });
      }

      // 'invalid' — skip to next candidate
      console.log(`${prefix()} Step 6: ${candidate.email} = ${result.status}, trying next`);
    } catch (err) {
      console.log(`${prefix()} Step 6 error for ${candidate.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`${prefix()} Step 6 complete (${ms() - t6}ms): all candidates invalid/failed`);

  // All candidates exhausted
  return buildResult(contact, {
    email: candidates[0]?.email ?? null,
    confidence: 'red',
    domain,
    pattern: patternResult?.pattern ?? null,
    verificationStatus: 'invalid',
    mailProvider: providerStr,
    tacticsAttempted,
    tacticsSucceeded,
    duration: ms() - t0,
  });
}

// ---------------------------------------------------------------------------
// Result builder
// ---------------------------------------------------------------------------

function buildResult(
  contact: ContactInput,
  fields: Omit<EmailFinderResult, 'contact' | 'timestamp'>,
): EmailFinderResult {
  return {
    contact,
    ...fields,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API — single contact
// ---------------------------------------------------------------------------

/**
 * Find the email for a single contact.
 */
export async function findEmail(
  contact: ContactInput,
  options?: OrchestratorOptions,
): Promise<EmailFinderResult> {
  const opts: OrchestratorOptions = { ...options };
  console.log(`${prefix()} === findEmail: ${contact.firstName} ${contact.lastName} @ ${contact.company} ===`);
  return findEmailForContact(contact, opts);
}

// ---------------------------------------------------------------------------
// Public API — batch
// ---------------------------------------------------------------------------

/**
 * Find emails for a batch of contacts.
 *
 * Groups contacts by company to reuse domain/pattern lookups.
 * Respects concurrency limits and inter-domain delays.
 * Returns results in the same order as input.
 */
export async function findEmails(
  contacts: ContactInput[],
  options?: OrchestratorOptions,
): Promise<EmailFinderResult[]> {
  const opts: OrchestratorOptions = { ...options };
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const delayMs = opts.delayBetweenDomains ?? DEFAULT_DELAY_BETWEEN_DOMAINS_MS;

  console.log(`${prefix()} === findEmails: ${contacts.length} contacts, concurrency=${concurrency} ===`);

  // Map each contact to its index so we can return results in order
  const resultSlots: EmailFinderResult[] = new Array(contacts.length);

  // Group by company for cache reuse
  const companyGroups = groupByCompany(contacts);
  const companyKeys = [...companyGroups.keys()];

  // Build a flat work queue: [ { originalIndex, contact, companyKey } ]
  const indexMap = new Map<ContactInput, number>();
  contacts.forEach((c, i) => indexMap.set(c, i));

  // Process companies with concurrency limit
  let companiesProcessed = 0;

  // Process N companies concurrently
  const companyBatches: string[][] = [];
  for (let i = 0; i < companyKeys.length; i += concurrency) {
    companyBatches.push(companyKeys.slice(i, i + concurrency));
  }

  for (const batch of companyBatches) {
    const batchPromises = batch.map(async (companyKey) => {
      const companyContacts = companyGroups.get(companyKey)!;
      const cache: CompanyCache = {
        domain: null,
        pattern: null,
        provider: null,
        emailsFound: [],
      };

      // Process contacts at this company sequentially (share cache)
      for (const contact of companyContacts) {
        const result = await findEmailForContact(contact, opts, cache);
        const originalIndex = indexMap.get(contact)!;
        resultSlots[originalIndex] = result;
      }
    });

    await Promise.all(batchPromises);
    companiesProcessed += batch.length;

    console.log(`${prefix()} Progress: ${companiesProcessed}/${companyKeys.length} companies processed`);

    // Delay between batches to avoid rate-limiting
    if (companiesProcessed < companyKeys.length && delayMs > 0) {
      console.log(`${prefix()} Waiting ${delayMs}ms before next batch...`);
      await delay(delayMs);
    }
  }

  console.log(`${prefix()} === findEmails complete: ${contacts.length} contacts processed ===`);
  return resultSlots;
}

// ---------------------------------------------------------------------------
// Public API — summary stats
// ---------------------------------------------------------------------------

/**
 * Summarize a batch of results into aggregate stats.
 */
export function summarizeResults(results: EmailFinderResult[]): BatchSummary {
  const total = results.length;
  let green = 0;
  let yellow = 0;
  let amber = 0;
  let red = 0;
  let notFound = 0;
  let totalDuration = 0;

  for (const r of results) {
    switch (r.confidence) {
      case 'green':
        green++;
        break;
      case 'yellow':
        yellow++;
        break;
      case 'amber':
        amber++;
        break;
      case 'red':
        red++;
        break;
      case 'not-found':
        notFound++;
        break;
    }
    totalDuration += r.duration;
  }

  const found = green + yellow + amber;
  const hitRate = total > 0 ? ((found / total) * 100).toFixed(1) : '0.0';
  const avgDuration = total > 0 ? (totalDuration / total).toFixed(0) : '0';

  return {
    total,
    green,
    yellow,
    amber,
    red,
    notFound,
    hitRate: `${hitRate}%`,
    avgDuration: `${avgDuration}ms`,
  };
}
