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

import { resolveDomain, resolveDomainsFromMx } from './domain-resolver.js';
import type { DomainResult } from './domain-resolver.js';
import { generateCandidates, detectPatternFromWeb, inferPattern } from './pattern-detector.js';
import type { EmailPattern, CandidateEmail, PatternResult } from './pattern-detector.js';
import { queryCompanyPeers, inferPatternFromPeers, applyPatternToProspect } from './peer-pattern.js';
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

export interface ApolloFallbackResult {
  email: string | null;
  domain: string | null;
  confidence: 'high' | 'medium' | 'low' | 'not-found';
  source: string;
}

export interface OrchestratorOptions {
  searchFn?: (query: string) => Promise<string[]>;
  fetchFn?: (url: string) => Promise<string>;
  smtpVerify?: boolean;
  concurrency?: number;
  delayBetweenDomains?: number;
  apolloFn?: (firstName: string, lastName: string, domain: string) => Promise<string | null>;
  apolloPeopleMatchFn?: (firstName: string, lastName: string, companyName: string, domain?: string) => Promise<ApolloFallbackResult>;
  millionVerifierFn?: (email: string) => Promise<{ quality: string; result: string }>;
  skipProviders?: string[];
  apolloPrimary?: boolean;
  domainHints?: Record<string, string>;
  pipelineTimeoutMs?: number;
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
const DEFAULT_PIPELINE_TIMEOUT_MS = 60_000;
const DEFAULT_SKIP_PROVIDERS: string[] = [];

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

  const pipelineDeadline = Date.now() + (options.pipelineTimeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS);
  let apolloAlreadyTried = false;

  let domainResult: DomainResult | null = companyCache?.domain ?? null;
  let patternResult: PatternResult | null = companyCache?.pattern ?? null;
  let provider: MailProvider | null = companyCache?.provider ?? null;
  let emailsFromDomain: string[] = companyCache?.emailsFound ?? [];

  // -----------------------------------------------------------------------
  // Step 0: APOLLO-PRIMARY (when enabled, try Apollo first before anything)
  // -----------------------------------------------------------------------
  if (options.apolloPrimary && options.apolloPeopleMatchFn) {
    apolloAlreadyTried = true;
    tacticsAttempted.push('apollo-primary');
    console.log(`${prefix()} Step 0: Apollo-primary for ${contact.firstName} ${contact.lastName} @ ${contact.company}`);
    try {
      const apolloResult = await options.apolloPeopleMatchFn(
        contact.firstName, contact.lastName, contact.company,
      );
      if (apolloResult.email) {
        tacticsSucceeded.push('apollo-primary');
        const apolloDomain = apolloResult.domain || apolloResult.email.split('@')[1];
        console.log(`${prefix()} Step 0: Apollo returned ${apolloResult.email} (confidence=${apolloResult.confidence})`);

        let mvQuality = 'skipped';
        if (options.millionVerifierFn) {
          try {
            const mvResult = await options.millionVerifierFn(apolloResult.email);
            mvQuality = mvResult.quality;
            console.log(`${prefix()} Step 0: MV: ${apolloResult.email} = ${mvQuality}`);
          } catch (err) {
            console.log(`${prefix()} Step 0: MV error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (mvQuality !== 'bad') {
          const confidence = apolloResult.confidence === 'high' ? 'green' as const
            : apolloResult.confidence === 'medium' ? 'yellow' as const
            : 'amber' as const;
          return buildResult(contact, {
            email: apolloResult.email,
            confidence: mvQuality === 'good' ? 'green' : confidence,
            domain: apolloDomain,
            pattern: null,
            verificationStatus: mvQuality === 'good' ? 'valid' : 'unverified',
            mailProvider: `apollo:${apolloResult.source}`,
            tacticsAttempted,
            tacticsSucceeded,
            duration: ms() - t0,
          });
        }
        console.log(`${prefix()} Step 0: MV=bad, falling through to self-hosted pipeline`);
      } else {
        console.log(`${prefix()} Step 0: Apollo returned no match, falling through`);
      }
    } catch (err) {
      console.log(`${prefix()} Step 0: Apollo error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 1: DOMAIN RESOLUTION (with domain hints)
  // -----------------------------------------------------------------------
  if (!domainResult) {
    // Check pipeline timeout before expensive domain resolution
    if (Date.now() > pipelineDeadline) {
      console.log(`${prefix()} Pipeline timeout — skipping remaining steps`);
      return buildResult(contact, {
        email: null, confidence: 'not-found', domain: null, pattern: null,
        verificationStatus: 'skipped', mailProvider: 'unknown',
        tacticsAttempted, tacticsSucceeded, duration: ms() - t0,
      });
    }

    tacticsAttempted.push('domain-resolution');

    // Check domain hints first (known overrides from inventory/Focus 100)
    // Try exact match, then strip common suffixes for fuzzy match
    const companyKey = contact.company.toLowerCase().trim();
    let hintDomain = options.domainHints?.[companyKey];
    if (!hintDomain && options.domainHints) {
      const SUFFIXES = [' inc.', ' inc', ' llc', ' llc.', ' corp', ' corp.', ' ltd.', ' ltd',
        ' co.', ' co', ' group', ' communications', ' industries', ' services',
        ' enterprises', ' solutions', ' networks', ' fiber', ' broadband', ' telecom'];
      // Try stripping suffixes from search key
      for (const suffix of SUFFIXES) {
        if (companyKey.endsWith(suffix)) {
          hintDomain = options.domainHints[companyKey.slice(0, -suffix.length)];
          if (hintDomain) break;
        }
      }
      // Try matching hint keys that start with search key (or vice versa)
      if (!hintDomain) {
        for (const [hk, hv] of Object.entries(options.domainHints)) {
          if (hk.startsWith(companyKey) || companyKey.startsWith(hk)) {
            hintDomain = hv;
            break;
          }
        }
      }
    }
    if (hintDomain) {
      console.log(`${prefix()} Step 1: domain hint match for "${contact.company}" -> ${hintDomain}`);
      domainResult = { domain: hintDomain, confidence: 'high' as const, source: 'domain-hint', emailsFound: [] };
      tacticsSucceeded.push('domain-resolution (hint)');
    }

    if (!domainResult) {
      console.log(`${prefix()} Step 1: resolving domain for "${contact.company}"`);
      const t1 = ms();

      try {
        domainResult = await resolveDomain(contact.company, contact.companyUrl, {
          searchFn: options.searchFn,
          fetchFn: options.fetchFn,
          firstName: contact.firstName,
          lastName: contact.lastName,
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

        // Step 1b: APOLLO FALLBACK — try People Match when domain resolution fails entirely
        // Skip if Apollo was already tried as primary (Step 0)
        if (!apolloAlreadyTried && options.apolloPeopleMatchFn) {
        tacticsAttempted.push('apollo-people-match (no-domain)');
        console.log(`${prefix()} Step 1b: Apollo People Match fallback for ${contact.firstName} ${contact.lastName} @ ${contact.company}`);
        try {
          const apolloResult = await options.apolloPeopleMatchFn(
            contact.firstName, contact.lastName, contact.company,
          );
          if (apolloResult.email) {
            tacticsSucceeded.push('apollo-people-match (no-domain)');
            const apolloDomain = apolloResult.domain || apolloResult.email.split('@')[1];
            console.log(`${prefix()} Step 1b: Apollo returned ${apolloResult.email} (domain=${apolloDomain}, confidence=${apolloResult.confidence})`);

            // Run MillionVerifier on Apollo result if available
            let mvQuality = 'skipped';
            if (options.millionVerifierFn) {
              try {
                const mvResult = await options.millionVerifierFn(apolloResult.email);
                mvQuality = mvResult.quality;
                console.log(`${prefix()} Step 1b: MillionVerifier: ${apolloResult.email} = ${mvQuality}`);
              } catch (err) {
                console.log(`${prefix()} Step 1b: MillionVerifier error: ${err instanceof Error ? err.message : String(err)}`);
              }
            }

            const confidence = apolloResult.confidence === 'high' ? 'green' as const
              : apolloResult.confidence === 'medium' ? 'yellow' as const
              : 'amber' as const;

            return buildResult(contact, {
              email: apolloResult.email,
              confidence: mvQuality === 'bad' ? 'red' : confidence,
              domain: apolloDomain,
              pattern: null,
              verificationStatus: mvQuality === 'good' ? 'valid' : mvQuality === 'bad' ? 'invalid' : 'unverified',
              mailProvider: `apollo:${apolloResult.source}`,
              tacticsAttempted,
              tacticsSucceeded,
              duration: ms() - t0,
            });
          } else {
            console.log(`${prefix()} Step 1b: Apollo returned no match`);
          }
        } catch (err) {
          console.log(`${prefix()} Step 1b: Apollo error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

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
    } // end inner if (!domainResult) — resolveDomain path

    // Populate cache for sibling contacts at same company
    if (companyCache) {
      companyCache.domain = domainResult;
      companyCache.emailsFound = emailsFromDomain;
    }
  } else {
    tacticsAttempted.push('domain-resolution (cached)');
    tacticsSucceeded.push('domain-resolution (cached)');
  }

  let domain = domainResult.domain;

  // -----------------------------------------------------------------------
  // Step 1c: MX-BASED DOMAIN VALIDATION
  // If resolved domain has no MX or MX points to a different org domain,
  // the website domain may not be the email domain. Track as alternative.
  // -----------------------------------------------------------------------
  const alternativeDomains: string[] = [];
  try {
    const mxRecords = await resolveDomainsFromMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      tacticsAttempted.push('mx-validation');
      const mxHosts = mxRecords.map(r => r.exchange.toLowerCase());
      // Shared hosting providers — MX pointing here doesn't imply a different email domain
      const SHARED_MX = ['google.com', 'googlemail.com', 'outlook.com', 'protection.outlook.com',
        'pphosted.com', 'mimecast.com', 'mimecast.eu', 'barracuda.com', 'barracudanetworks.com',
        'securemx.com', 'emailsrvr.com', 'zoho.com', 'zoho.eu', 'messagelabs.com',
        'ppe-hosted.com', 'exclaimer.net', 'proofpoint.com', 'fireeyecloud.com',
        'iphmx.com', 'trendmicro.com', 'spamh.com', 'sophos.com',
        'mailanyone.net', 'mx25.net', 'reflexion.net', 'serverdata.net',
        'registrar-servers.com', 'secureserver.net', 'emailfiltering.com'];
      const isSharedMx = mxHosts.every(h => SHARED_MX.some(s => h.endsWith(`.${s}`) || h === s));
      if (!isSharedMx) {
        // Extract root domain from MX host — might reveal the real email domain
        for (const mx of mxHosts) {
          const parts = mx.split('.');
          if (parts.length >= 2) {
            const mxRoot = parts.slice(-2).join('.');
            if (mxRoot !== domain && mxRoot !== 'com' && mxRoot !== 'net' && mxRoot !== 'org') {
              // MX root differs from resolved domain — potential alternative
              alternativeDomains.push(mxRoot);
              console.log(`${prefix()} Step 1c: MX for ${domain} points to ${mx} — alternative domain: ${mxRoot}`);
            }
          }
        }
      }
      if (alternativeDomains.length > 0) {
        tacticsSucceeded.push('mx-validation (alt-domains)');
      }
    }
  } catch {
    // MX lookup failure is non-fatal
  }
  // Inject MX-discovered alternatives into domainResult for Step 6 to pick up
  if (alternativeDomains.length > 0) {
    const existing = domainResult.alternativeDomains ?? [];
    const merged = Array.from(new Set([...existing, ...alternativeDomains]));
    domainResult.alternativeDomains = merged;
  }

  // -----------------------------------------------------------------------
  // Step 1d: PEER-PATTERN DERIVATION (sr_company_contacts)
  //
  // Before running web-scrape pattern detection or SMTP guess-and-check,
  // see whether we already have one or more verified peer emails at this
  // company stored in `sr_company_contacts` from prior research. If so,
  // infer the company pattern from peers and (a) return GREEN directly
  // when 2+ peers agree (high confidence) or (b) seed Step 2 with the
  // peer-derived pattern so candidate generation + SMTP verification can
  // confirm against a single high-likelihood candidate (medium confidence).
  // -----------------------------------------------------------------------
  let peerHighConfidenceEmail: string | null = null;
  let peerSource: string | null = null;
  if (!patternResult && Date.now() < pipelineDeadline) {
    tacticsAttempted.push('peer-pattern');
    try {
      const peers = await queryCompanyPeers(contact.company);
      if (peers.length > 0) {
        const peerResult = inferPatternFromPeers(peers);
        console.log(`${prefix()} Step 1d: ${peers.length} peer(s), pattern=${peerResult.pattern}, confidence=${peerResult.confidence}, matched=${peerResult.matchedPeers}/${peerResult.totalPeers}`);

        if (peerResult.pattern) {
          // Seed Step 2 with the peer-derived pattern. Confidence is mapped
          // from the peer rubric: 'high' = 0.95, 'medium' = 0.7, 'low' = 0.4.
          const confidenceValue = peerResult.confidence === 'high' ? 0.95
            : peerResult.confidence === 'medium' ? 0.7
            : 0.4;
          patternResult = {
            pattern: peerResult.pattern,
            confidence: confidenceValue,
            source: `peer-pattern: ${peerResult.matchedPeers}/${peerResult.totalPeers} peers (${peerResult.sampleEmails.slice(0, 2).join(', ')})`,
          };
          peerSource = patternResult.source;
          if (companyCache) companyCache.pattern = patternResult;
          tacticsSucceeded.push('peer-pattern');

          // High confidence (2+ peers agree) AND we can build the predicted
          // email from the pattern: short-circuit to GREEN without Path A SMTP.
          if (peerResult.confidence === 'high') {
            const predicted = applyPatternToProspect(
              peerResult.pattern,
              contact.firstName,
              contact.lastName,
              domain,
            );
            if (predicted) {
              peerHighConfidenceEmail = predicted;
              console.log(`${prefix()} Step 1d: high-confidence peer-derived email ${predicted} -> GREEN (skipping SMTP)`);
              return buildResult(contact, {
                email: predicted,
                confidence: 'green',
                domain,
                pattern: peerResult.pattern,
                verificationStatus: 'unverified',
                mailProvider: 'peer-derived',
                tacticsAttempted,
                tacticsSucceeded,
                duration: ms() - t0,
              });
            }
          }
          // Medium confidence (1 peer): fall through to Step 2/3/6. The seeded
          // patternResult will drive candidate generation; SMTP confirms.
          // Final confidence will end up GREEN if SMTP returns valid, YELLOW
          // if catch-all, AMBER if no signal — same as existing behavior.
        }
      }
    } catch (err) {
      console.log(`${prefix()} Step 1d error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Reference peerHighConfidenceEmail / peerSource so TS noUnusedLocals
  // doesn't trip — they document the high-confidence short-circuit path
  // above and are useful for downstream debug logging if needed.
  void peerHighConfidenceEmail;
  void peerSource;

  // -----------------------------------------------------------------------
  // Step 2: PATTERN DETECTION
  // -----------------------------------------------------------------------
  if (Date.now() > pipelineDeadline) {
    console.log(`${prefix()} Pipeline timeout after Step 1 — returning domain-only`);
    return buildResult(contact, {
      email: null, confidence: 'not-found', domain, pattern: null,
      verificationStatus: 'skipped', mailProvider: 'unknown',
      tacticsAttempted, tacticsSucceeded, duration: ms() - t0,
    });
  }
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
  // Step 6: SMTP VERIFICATION (with alternative domain fallback)
  // -----------------------------------------------------------------------
  if (Date.now() > pipelineDeadline) {
    console.log(`${prefix()} Pipeline timeout before verification — returning best candidate unverified`);
    const bestCandidate = candidates[0] ?? null;
    return buildResult(contact, {
      email: bestCandidate?.email ?? null,
      confidence: bestCandidate ? 'amber' as const : 'not-found' as const,
      domain, pattern: patternResult?.pattern ?? null,
      verificationStatus: 'skipped', mailProvider: provider ?? 'unknown',
      tacticsAttempted, tacticsSucceeded, duration: ms() - t0,
    });
  }
  const providerStr: string = provider ?? 'unknown';

  // Only skip entirely when verification is globally disabled
  if (!smtpEnabled) {
    tacticsAttempted.push('smtp-verification (skipped)');
    console.log(`${prefix()} Step 6: SMTP globally disabled`);

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
  console.log(`${prefix()} Step 6: verification — ${candidates.length} candidates to check on ${domain} (provider=${providerStr})`);
  const t6 = ms();
  // Hard timeout on entire verification step — Proofpoint/self-hosted can hang for minutes
  const VERIFY_TIMEOUT_MS = 30000;
  const verifyDeadline = Date.now() + VERIFY_TIMEOUT_MS;

  // ---------------------------------------------------------------------------
  // Build a list of (domain, candidates, provider) tuples to try.
  // Primary domain first, then alternative domains from domain resolution.
  // ---------------------------------------------------------------------------
  interface DomainAttempt {
    attemptDomain: string;
    attemptCandidates: CandidateEmail[];
    attemptProvider: MailProvider | string;
    isAlternative: boolean;
  }

  const domainAttempts: DomainAttempt[] = [
    { attemptDomain: domain, attemptCandidates: candidates, attemptProvider: providerStr, isAlternative: false },
  ];

  // Enqueue alternative domains from domain resolution
  const altDomains = domainResult.alternativeDomains ?? [];
  if (altDomains.length > 0) {
    console.log(`${prefix()} Step 6: ${altDomains.length} alternative domain(s) available: ${altDomains.join(', ')}`);
  }
  for (const altDomain of altDomains) {
    if (altDomain.toLowerCase() === domain.toLowerCase()) continue; // skip duplicate
    const altCandidates = generateCandidates(
      contact.firstName,
      contact.lastName,
      altDomain,
      patternResult?.pattern ?? undefined,
    );
    // Detect provider for the alternative domain
    let altProvider: MailProvider | string = 'unknown';
    try {
      altProvider = await detectMailProvider(altDomain);
    } catch { /* keep unknown */ }
    console.log(`${prefix()} Step 6: alt domain ${altDomain} -> ${altCandidates.length} candidates, provider=${altProvider}`);
    domainAttempts.push({
      attemptDomain: altDomain,
      attemptCandidates: altCandidates,
      attemptProvider: altProvider,
      isAlternative: true,
    });
  }

  // Track best catch-all result across all attempts (fallback if no GREEN)
  let bestCatchAll: {
    email: string;
    domain: string;
    pattern: string | null;
    provider: string;
  } | null = null;

  // ---------------------------------------------------------------------------
  // Verification uses two strategies depending on the method:
  //
  // A) SMTP RCPT TO (self-hosted): valid=250 is a hard GREEN signal.
  //    Short-circuit immediately on the first valid result.
  //
  // B) Autodiscover (M365 + Google Workspace): 302=hard INVALID, 200=soft valid.
  //    Some M365 tenants return 200 for random addresses (partial catch-all).
  //    Strategy: try ALL candidates, collect 302s (eliminated) and 200s (survived).
  //    If some are eliminated while others survive, promote survivors.
  //    This "elimination" approach correctly picks the real pattern.
  // ---------------------------------------------------------------------------

  interface SurvivorEntry {
    candidate: CandidateEmail;
    domain: string;
    provider: string;
    isAlternative: boolean;
  }
  const allSurvivors: SurvivorEntry[] = [];
  let anyEliminationsOccurred = false;

  for (const attempt of domainAttempts) {
    const { attemptDomain, attemptCandidates, attemptProvider, isAlternative } = attempt;

    // Skip providers in the explicit skip list
    if (skipProviders.includes(attemptProvider as string)) {
      console.log(`${prefix()} Step 6: skipping ${attemptDomain} (provider=${attemptProvider} in skip list)`);
      if (!isAlternative && attemptCandidates.length > 0 && !bestCatchAll) {
        bestCatchAll = {
          email: attemptCandidates[0].email,
          domain: attemptDomain,
          pattern: attemptCandidates[0].pattern ?? patternResult?.pattern ?? null,
          provider: attemptProvider as string,
        };
      }
      continue;
    }

    if (isAlternative) {
      tacticsAttempted.push(`alt-domain:${attemptDomain}`);
      console.log(`${prefix()} Step 6: trying alternative domain ${attemptDomain} (${attemptCandidates.length} candidates, provider=${attemptProvider})`);
    }

    // Detect verification method for this domain
    const usesAutodiscover = attemptProvider === 'microsoft-365' || attemptProvider === 'google-workspace';
    const method = usesAutodiscover ? 'Autodiscover' : 'SMTP';

    let domainHasInvalids = false;
    const domainSurvivors: SurvivorEntry[] = [];

    for (const candidate of attemptCandidates) {
      // Hard deadline check — bail if we've exceeded 30s total for all verification
      const remainingMs = verifyDeadline - Date.now();
      if (remainingMs <= 0) {
        console.log(`${prefix()} Step 6: TIMEOUT after ${VERIFY_TIMEOUT_MS}ms — stopping verification`);
        break;
      }
      try {
        console.log(`${prefix()} Step 6: verifying ${candidate.email} (pattern=${candidate.pattern}, rank=${candidate.rank}, method=${method})`);
        // Wrap in race so a hanging SMTP connection can't exceed the deadline
        const perCallTimeout = Math.min(remainingMs, 15_000);
        const result: SmtpVerifyResult = await Promise.race([
          verifyEmail(candidate.email),
          new Promise<SmtpVerifyResult>((resolve) =>
            setTimeout(() => resolve({ status: 'timeout', smtpCode: null, smtpMessage: `Per-call timeout after ${perCallTimeout}ms` }), perCallTimeout),
          ),
        ]);
        console.log(`${prefix()} Step 6: ${candidate.email} -> ${result.status} (code=${result.smtpCode ?? 'n/a'}, msg=${result.smtpMessage ?? 'n/a'})`);

        if (result.status === 'valid') {
          if (!usesAutodiscover) {
            // SMTP valid = hard GREEN, return immediately
            tacticsSucceeded.push('smtp-verification');
            if (isAlternative) tacticsSucceeded.push(`alt-domain:${attemptDomain}`);
            console.log(`${prefix()} Step 6 complete (${ms() - t6}ms): ${candidate.email} = VALID (GREEN) via SMTP`);
            return buildResult(contact, {
              email: candidate.email,
              confidence: 'green',
              domain: attemptDomain,
              pattern: candidate.pattern ?? patternResult?.pattern ?? null,
              verificationStatus: 'valid',
              mailProvider: attemptProvider as string,
              tacticsAttempted,
              tacticsSucceeded,
              duration: ms() - t0,
            });
          }

          // Autodiscover 200 = soft valid, collect for elimination analysis
          domainSurvivors.push({
            candidate,
            domain: attemptDomain,
            provider: attemptProvider as string,
            isAlternative,
          });
          console.log(`${prefix()} Step 6: ${candidate.email} = Autodiscover 200 (survived, rank=${candidate.rank})`);
        } else if (result.status === 'invalid') {
          domainHasInvalids = true;
          console.log(`${prefix()} Step 6: ${candidate.email} = INVALID (eliminated)`);
        } else if (result.status === 'catch-all') {
          domainSurvivors.push({
            candidate,
            domain: attemptDomain,
            provider: attemptProvider as string,
            isAlternative,
          });
          console.log(`${prefix()} Step 6: ${candidate.email} = catch-all (survived)`);
        } else {
          console.log(`${prefix()} Step 6: ${candidate.email} = ${result.status}, skipped`);
        }
      } catch (err) {
        console.log(`${prefix()} Step 6 error for ${candidate.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Summarize domain results
    if (domainHasInvalids) {
      anyEliminationsOccurred = true;
      console.log(`${prefix()} Step 6: ${attemptDomain} elimination: ${domainSurvivors.length} survived, ${attemptCandidates.length - domainSurvivors.length} eliminated`);
    }

    if (domainSurvivors.length > 0) {
      allSurvivors.push(...domainSurvivors);
    }

    // Early exit: if Autodiscover elimination on this domain produced exactly 1
    // survivor, that's a high-confidence result — skip remaining domains.
    if (usesAutodiscover && domainHasInvalids && domainSurvivors.length === 1) {
      const winner = domainSurvivors[0];
      tacticsSucceeded.push('smtp-verification (elimination)');
      if (isAlternative) tacticsSucceeded.push(`alt-domain:${attemptDomain}`);
      console.log(`${prefix()} Step 6 early-exit: single Autodiscover survivor ${winner.candidate.email} on ${attemptDomain} — skipping remaining domains`);
      return buildResult(contact, {
        email: winner.candidate.email,
        confidence: 'green',
        domain: winner.domain,
        pattern: winner.candidate.pattern ?? patternResult?.pattern ?? null,
        verificationStatus: 'valid',
        mailProvider: winner.provider,
        tacticsAttempted,
        tacticsSucceeded,
        duration: ms() - t0,
      });
    }
  }

  console.log(`${prefix()} Step 6 complete (${ms() - t6}ms): ${allSurvivors.length} survivors across ${domainAttempts.length} domain(s), eliminations=${anyEliminationsOccurred}`);

  // Rank survivors and pick the best
  if (allSurvivors.length > 0) {
    // Sort survivors by likelihood. Priority:
    // 1. Penalize initials (2 chars or less)
    // 2. Exact input-name match (phil.arnholt > phillip.arnholt when input="Phil")
    // 3. When NO eliminations occurred (catch-all): prefer shorter local parts
    //    among equally-qualified candidates. Calibration data shows small/mid
    //    companies skew toward simpler formats (first@, flast@) over first.last@.
    // 4. Original candidate rank (pattern priority from Step 2 detection)
    const inputFirst = contact.firstName.toLowerCase();
    const inputLast = contact.lastName.toLowerCase();
    allSurvivors.sort((a, b) => {
      const aLocal = a.candidate.email.split('@')[0].toLowerCase();
      const bLocal = b.candidate.email.split('@')[0].toLowerCase();
      // Penalize initials (2 chars or less) — almost never real
      const aIsInitials = aLocal.length <= 2;
      const bIsInitials = bLocal.length <= 2;
      if (aIsInitials !== bIsInitials) return aIsInitials ? 1 : -1;
      // Prefer candidates that use the exact input first name
      const aExactFirst = aLocal.startsWith(inputFirst + '.') || aLocal.startsWith(inputFirst + '@') || aLocal === inputFirst;
      const bExactFirst = bLocal.startsWith(inputFirst + '.') || bLocal.startsWith(inputFirst + '@') || bLocal === inputFirst;
      if (aExactFirst !== bExactFirst) return aExactFirst ? -1 : 1;
      // When verification is ambiguous (no eliminations, or eliminations
      // didn't narrow the field to ≤3) AND no pattern was detected: prefer
      // shorter local parts. Calibration showed catch-all and over-permissive
      // M365 tenants return 200 for many candidates; shorter forms (first@,
      // flast@) are more likely correct than first.last@ when unproven.
      const ambiguous = !anyEliminationsOccurred || allSurvivors.length > 3;
      if (ambiguous && !patternResult) {
        if (aLocal.length !== bLocal.length) return aLocal.length - bLocal.length;
      }
      // Fall through to original candidate rank (pattern detection priority)
      if (a.candidate.rank !== b.candidate.rank) return a.candidate.rank - b.candidate.rank;
      return 0;
    });

    const winner = allSurvivors[0];

    if (anyEliminationsOccurred && allSurvivors.length <= 3) {
      // Elimination narrowed the field — high confidence
      const conf = allSurvivors.length === 1 ? 'green' as const : 'yellow' as const;
      tacticsSucceeded.push('smtp-verification (elimination)');
      if (winner.isAlternative) tacticsSucceeded.push(`alt-domain:${winner.domain}`);
      console.log(`${prefix()} Step 6 elimination winner: ${winner.candidate.email} (${allSurvivors.length} survivors -> ${conf})`);
      return buildResult(contact, {
        email: winner.candidate.email,
        confidence: conf,
        domain: winner.domain,
        pattern: winner.candidate.pattern ?? patternResult?.pattern ?? null,
        verificationStatus: allSurvivors.length === 1 ? 'valid' : 'catch-all',
        mailProvider: winner.provider,
        tacticsAttempted,
        tacticsSucceeded,
        duration: ms() - t0,
      });
    }

    // No eliminations or too many survivors — treat as catch-all.
    // Path A final-gate: run MillionVerifier on the best survivor to disambiguate
    // catch-all servers (M365/Google return 200 OK for everything via SMTP).
    let pathACatchAllConfidence: 'green' | 'yellow' | 'amber' | 'red' = 'yellow';
    let pathACatchAllVerification: 'valid' | 'catch-all' | 'unverified' | 'invalid' | 'skipped' = 'catch-all';
    if (options.millionVerifierFn) {
      tacticsAttempted.push('mv-final-gate (path-a-catch-all)');
      try {
        const mvResult = await options.millionVerifierFn(winner.candidate.email);
        const mvQuality = (mvResult.quality || '').toLowerCase();
        console.log(`${prefix()} Step 6 MV final-gate: ${winner.candidate.email} = ${mvQuality}`);
        if (mvQuality === 'good' || mvQuality === 'valid') {
          pathACatchAllConfidence = 'green';
          pathACatchAllVerification = 'valid';
          tacticsSucceeded.push('mv-final-gate (upgrade-to-green)');
        } else if (mvQuality === 'catch_all' || mvQuality === 'catch-all') {
          pathACatchAllConfidence = 'amber';
          pathACatchAllVerification = 'catch-all';
          tacticsSucceeded.push('mv-final-gate (upgrade-to-amber)');
        } else if (mvQuality === 'bad' || mvQuality === 'invalid' || mvQuality === 'disposable' || mvQuality === 'do_not_send') {
          pathACatchAllConfidence = 'red';
          pathACatchAllVerification = 'invalid';
          tacticsSucceeded.push('mv-final-gate (definitive-negative)');
        }
        // 'unknown' or anything else: keep yellow (no signal either way)
      } catch (err) {
        console.log(`${prefix()} Step 6 MV final-gate error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    tacticsSucceeded.push('smtp-verification (catch-all)');
    console.log(`${prefix()} Step 6 fallback: best survivor ${winner.candidate.email} -> ${pathACatchAllConfidence}`);
    return buildResult(contact, {
      email: winner.candidate.email,
      confidence: pathACatchAllConfidence,
      domain: winner.domain,
      pattern: winner.candidate.pattern ?? patternResult?.pattern ?? null,
      verificationStatus: pathACatchAllVerification,
      mailProvider: winner.provider,
      tacticsAttempted,
      tacticsSucceeded,
      duration: ms() - t0,
    });
  }

  // Return best catch-all if we found one
  if (bestCatchAll) {
    tacticsSucceeded.push('smtp-verification (catch-all)');
    console.log(`${prefix()} Step 6 fallback: using catch-all ${bestCatchAll.email}`);
    return buildResult(contact, {
      email: bestCatchAll.email,
      confidence: 'yellow',
      domain: bestCatchAll.domain,
      pattern: bestCatchAll.pattern,
      verificationStatus: 'catch-all',
      mailProvider: bestCatchAll.provider,
      tacticsAttempted,
      tacticsSucceeded,
      duration: ms() - t0,
    });
  }

  // All candidates across all domains exhausted — try Apollo People Match as last resort
  // Skip if Apollo was already tried as primary (Step 0)
  if (!apolloAlreadyTried && options.apolloPeopleMatchFn) {
    tacticsAttempted.push('apollo-people-match (red-fallback)');
    console.log(`${prefix()} Step 7: Apollo People Match fallback (all self-hosted candidates failed)`);
    try {
      const apolloResult = await options.apolloPeopleMatchFn(
        contact.firstName, contact.lastName, contact.company, domain,
      );
      if (apolloResult.email) {
        tacticsSucceeded.push('apollo-people-match (red-fallback)');
        const apolloDomain = apolloResult.domain || apolloResult.email.split('@')[1];
        console.log(`${prefix()} Step 7: Apollo returned ${apolloResult.email} (confidence=${apolloResult.confidence})`);

        let mvQuality = 'skipped';
        if (options.millionVerifierFn) {
          try {
            const mvResult = await options.millionVerifierFn(apolloResult.email);
            mvQuality = mvResult.quality;
            console.log(`${prefix()} Step 7: MillionVerifier: ${apolloResult.email} = ${mvQuality}`);
          } catch (err) {
            console.log(`${prefix()} Step 7: MillionVerifier error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const confidence = apolloResult.confidence === 'high' ? 'green' as const
          : apolloResult.confidence === 'medium' ? 'yellow' as const
          : 'amber' as const;

        return buildResult(contact, {
          email: apolloResult.email,
          confidence: mvQuality === 'bad' ? 'red' : confidence,
          domain: apolloDomain,
          pattern: null,
          verificationStatus: mvQuality === 'good' ? 'valid' : mvQuality === 'bad' ? 'invalid' : 'unverified',
          mailProvider: `apollo:${apolloResult.source}`,
          tacticsAttempted,
          tacticsSucceeded,
          duration: ms() - t0,
        });
      } else {
        console.log(`${prefix()} Step 7: Apollo returned no match`);
      }
    } catch (err) {
      console.log(`${prefix()} Step 7: Apollo error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Path A final-gate: before giving up with RED, run MillionVerifier on the
  // best candidate. MV's catch-all detection catches cases where M365/Google
  // SMTP returns ambiguous results that our self-hosted probe couldn't classify.
  //
  // Mapping:
  //   - MV 'good'/'valid' -> upgrade to GREEN (deliverable)
  //   - MV 'catch_all'    -> upgrade to AMBER (sendable, caveat)
  //   - MV 'unknown'      -> keep RED (no signal either way)
  //   - MV 'bad'/'disposable' -> keep RED (definitive negative)
  const bestRedCandidate = candidates[0]?.email ?? null;
  if (bestRedCandidate && options.millionVerifierFn) {
    tacticsAttempted.push('mv-final-gate (path-a-red)');
    try {
      const mvResult = await options.millionVerifierFn(bestRedCandidate);
      const mvQuality = (mvResult.quality || '').toLowerCase();
      console.log(`${prefix()} Path A final-gate MV: ${bestRedCandidate} = ${mvQuality}`);
      if (mvQuality === 'good' || mvQuality === 'valid') {
        tacticsSucceeded.push('mv-final-gate (upgrade-to-green)');
        return buildResult(contact, {
          email: bestRedCandidate,
          confidence: 'green',
          domain,
          pattern: patternResult?.pattern ?? null,
          verificationStatus: 'valid',
          mailProvider: providerStr,
          tacticsAttempted,
          tacticsSucceeded,
          duration: ms() - t0,
        });
      }
      if (mvQuality === 'catch_all' || mvQuality === 'catch-all') {
        tacticsSucceeded.push('mv-final-gate (upgrade-to-amber)');
        return buildResult(contact, {
          email: bestRedCandidate,
          confidence: 'amber',
          domain,
          pattern: patternResult?.pattern ?? null,
          verificationStatus: 'catch-all',
          mailProvider: providerStr,
          tacticsAttempted,
          tacticsSucceeded,
          duration: ms() - t0,
        });
      }
      // 'unknown', 'bad', 'invalid', 'disposable', 'do_not_send' -> keep red below
    } catch (err) {
      console.log(`${prefix()} Path A final-gate MV error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return buildResult(contact, {
    email: bestRedCandidate,
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
