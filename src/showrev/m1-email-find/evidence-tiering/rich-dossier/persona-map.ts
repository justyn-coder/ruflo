/**
 * Persona-Map — deterministic category + speaker_role → PersonaTag[] classifier.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §4 step 6.
 *
 * WHY deterministic instead of LLM:
 * The persona model is operator-defined and stable (3 personas, none of which
 * shift across prospects). Calling Haiku for persona classification would
 * add latency + cost + non-determinism without adding signal. A checked-in
 * YAML map is auditable and lint-able.
 *
 * The union semantics (claim matches >1 rule → personas merge) is intentional —
 * a CEO quoting GIS→CAD pain is genuinely relevant to BOTH revenue_leader
 * (decision-maker) AND technical_designer (subject-matter).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { PersonaTag } from './types.js';

interface PersonaRule {
  /** Match if row.category === this. */
  category?: string;
  /** Match if speaker_role contains this substring (case-insensitive). */
  speaker_role_substring?: string;
  /** Personas assigned when this rule fires. */
  personas: PersonaTag[];
}

interface PersonaMapFile {
  rules: PersonaRule[];
}

/**
 * Module-singleton cached rules. Same module-scope caveat as authority-map.ts:
 * all importers in one Node process share this cache. The test-only seam
 * lives under __TEST_ONLY__ to keep production accidental-poisoning hard.
 */
let cachedRules: PersonaRule[] | null = null;

const ALLOWED_PERSONAS: readonly PersonaTag[] = ['revenue_leader', 'ops_builder', 'technical_designer'];

function defaultMapPath(): string {
  // 5 levels up to repo root (audit fix; was 6). See authority-map.ts header
  // for the segment-count explanation.
  const here = new URL('.', import.meta.url).pathname;
  return join(here, '../../../../../data/showrev/category-to-persona-map.yaml');
}

function loadRules(path: string): PersonaRule[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw) as PersonaMapFile | null;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`persona-map: ${path} did not parse as { rules: [...] }`);
  }
  // Audit issue D: validate each rule. Reject rows with neither match key,
  // empty personas, or invalid persona tags.
  for (let i = 0; i < parsed.rules.length; i++) {
    const rule = parsed.rules[i];
    if (!rule || typeof rule !== 'object') {
      throw new Error(`persona-map: ${path} row #${i} not an object`);
    }
    if (!rule.category && !rule.speaker_role_substring) {
      throw new Error(
        `persona-map: ${path} row #${i} must have either "category" or "speaker_role_substring"`,
      );
    }
    if (!Array.isArray(rule.personas) || rule.personas.length === 0) {
      throw new Error(
        `persona-map: ${path} row #${i} "personas" must be a non-empty array`,
      );
    }
    for (const p of rule.personas) {
      if (!ALLOWED_PERSONAS.includes(p)) {
        throw new Error(
          `persona-map: ${path} row #${i} unknown persona ${JSON.stringify(p)}; ` +
          `expected one of revenue_leader|ops_builder|technical_designer`,
        );
      }
    }
  }
  return parsed.rules;
}

/**
 * Test-only API surface. Production code MUST NOT import from this object.
 */
export const __TEST_ONLY__ = {
  setPersonaRules(rules: PersonaRule[]): void {
    cachedRules = rules;
  },
};

export function reloadPersonaMap(): void {
  cachedRules = null;
}

function getRules(): PersonaRule[] {
  if (!cachedRules) {
    cachedRules = loadRules(defaultMapPath());
  }
  return cachedRules;
}

/**
 * Classify a row's persona tags from its category + speaker_role.
 *
 * Returns the deduplicated union of all matching rules' personas.
 * Empty array (no rule matched) is a valid output — combined with
 * kb_status='unaddressed' it triggers SC #6 drop.
 *
 * @param category     The sr_company_evidence.category value (3 values:
 *                     company_fact / industry_context / persona_signal)
 * @param speaker_role Optional. The speaker_role free-text string from the row.
 */
export function classifyPersona(
  category: string | null | undefined,
  speaker_role?: string | null,
): PersonaTag[] {
  const rules = getRules();
  const acc = new Set<PersonaTag>();
  const role = (speaker_role || '').toLowerCase();

  for (const rule of rules) {
    let matched = false;
    if (rule.category && rule.category === category) matched = true;
    if (
      !matched &&
      rule.speaker_role_substring &&
      role &&
      role.includes(rule.speaker_role_substring.toLowerCase())
    ) {
      matched = true;
    }
    if (matched) {
      for (const p of rule.personas) acc.add(p);
    }
  }
  return Array.from(acc);
}
