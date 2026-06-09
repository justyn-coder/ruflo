/**
 * Rich-Dossier — Phase A barrel.
 *
 * Public surface (for composers + tests):
 *   getRichDossier            — single function composers call
 *   assertDossierFresh        — Hardening 2 temporal-language guard
 *   shouldSkip                — Hardening 3 empty-dossier hard-stop
 *   matchInorsaAngles         — exposed for testing + SOT lint
 *   classifyPersona           — exposed for fixture-driven tests
 *   lookupAuthority           — exposed for fixture-driven tests
 *   classifyClaim             — exposed for KB-fixture-driven tests
 *
 * Errors:
 *   UnknownPublisherError     — thrown by lookupAuthority on unknown publisher
 *   SubstrateQueryError       — wrapped DB error
 *   TemporalLanguageError     — thrown by assertDossierFresh
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4.
 */

export { getRichDossier } from './get-rich-dossier.js';
export { assertDossierFresh, shouldSkip, TemporalLanguageError } from './composer-guard.js';
export {
  lookupAuthority,
  publisherFromCitation,
  authorityWeight,
  demoteAuthority,
  reloadAuthorityMap,
  __TEST_ONLY__ as __TEST_ONLY_AUTHORITY__,
} from './authority-map.js';
export {
  classifyPersona,
  reloadPersonaMap,
  __TEST_ONLY__ as __TEST_ONLY_PERSONA__,
} from './persona-map.js';
export {
  classifyClaim,
  kbWeight,
  gcKbCache,
  reloadKb,
  __TEST_ONLY__ as __TEST_ONLY_KB__,
} from './kb-classifier.js';
export { matchInorsaAngles, INORSA_ANGLES } from './inorsa-angles.js';
export { fetchSubstrate } from './substrate-bridge.js';

export type {
  RichDossier,
  ScoredClaim,
  PersonaTag,
  AuthorityTier,
  KbStatus,
  DateConfidence,
  EmptyReason,
} from './types.js';
export { UnknownPublisherError, SubstrateQueryError } from './types.js';
