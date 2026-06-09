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

let cachedRules: PersonaRule[] | null = null;

function defaultMapPath(): string {
  const here = new URL('.', import.meta.url).pathname;
  return join(here, '../../../../../../data/showrev/category-to-persona-map.yaml');
}

function loadRules(path: string): PersonaRule[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw) as PersonaMapFile | null;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`persona-map: ${path} did not parse as { rules: [...] }`);
  }
  return parsed.rules;
}

/**
 * Test seam — bypass disk read.
 */
export function _setPersonaRulesForTests(rules: PersonaRule[]): void {
  cachedRules = rules;
}

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
