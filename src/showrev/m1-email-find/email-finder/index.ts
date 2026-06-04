/**
 * index.ts — Clean re-exports for the email-finder module.
 *
 * Usage:
 *   import { findEmail, findEmails, summarizeResults } from './email-finder/index.js';
 */

// Orchestrator (primary API)
export { findEmail, findEmails, summarizeResults } from './orchestrator.js';
export type { ContactInput, EmailFinderResult, OrchestratorOptions } from './orchestrator.js';

// Domain Resolver
export { resolveDomain } from './domain-resolver.js';
export type { DomainResult } from './domain-resolver.js';

// SMTP Verifier
export { verifyEmail, verifyBatch, detectMailProvider } from './smtp-verifier.js';
export type { SmtpVerifyResult, MailProvider } from './smtp-verifier.js';

// Pattern Detector
export { generateCandidates, detectPatternFromWeb, inferPattern } from './pattern-detector.js';
export type { EmailPattern, CandidateEmail, PatternResult } from './pattern-detector.js';
