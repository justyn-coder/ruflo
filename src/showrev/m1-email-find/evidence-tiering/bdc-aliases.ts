/**
 * FCC BDC name-alias layer.
 *
 * BDC stores providers under their FCC-registered name (typically the legal
 * holding-company name). Our cohort CSVs and substrate use the BRAND name
 * (what the operator actually goes to market with). These often diverge:
 *   - "GFiber" (brand) is registered as "Google Fiber" in BDC
 *   - "EPB Fiber Optics" (brand) registered as "Epb" (Electric Power Board of Chattanooga)
 *   - "Fidium Fiber" (brand) is registered under both forms
 *
 * Without aliases, getFccCoverage() exact-name-matches fail on ~70% of
 * cohort entries we KNOW are in BDC. This layer maps brand → registered name.
 *
 * Source of mappings:
 *   - Manual review of post-ingest mismatches (2026-06-09)
 *   - Known parent-co mappings from substrate research
 *   - Operator-confirmed canonical pairings
 *
 * NOTE: Only add aliases where we're CONFIDENT they're the same entity.
 * False positives (similar prefix, different company) cause incorrect ICP
 * verdicts — operator gets "fit" verdict for the wrong company.
 *
 * DO NOT add companies that are on the Inorsa DNC list (§10 of
 * wiki-459-mirror.md). Those should never appear in any cohort surface.
 */

interface BdcAlias {
  brand: string;             // What appears in our cohort / substrate (normalized)
  registered: string;        // What BDC stores (normalized)
  confidence: 'verified' | 'high' | 'medium';
  source: string;            // Where the mapping came from
}

export const BDC_ALIASES: BdcAlias[] = [
  // Verified — direct brand/registered pairings confirmed via FCC FRN lookup
  { brand: 'gfiber', registered: 'google fiber', confidence: 'verified', source: 'FCC FRN 0024-7894' },
  { brand: 'google fiber', registered: 'google fiber', confidence: 'verified', source: 'self' },
  { brand: 'epb fiber optics', registered: 'epb', confidence: 'verified', source: 'Electric Power Board of Chattanooga' },
  { brand: 'fidium', registered: 'fidium fiber', confidence: 'verified', source: 'Consolidated Communications brand' },
  { brand: 'fidium (consolidated communications)', registered: 'fidium fiber', confidence: 'verified', source: 'parent-co disclosure' },
  { brand: 'frontier communications', registered: 'frontier', confidence: 'verified', source: 'self-evident' },
  { brand: 'altafiber', registered: 'altafiber', confidence: 'verified', source: 'Cincinnati Bell rebrand' },
  { brand: 'centurylink (lumen)', registered: 'lumen', confidence: 'verified', source: 'CenturyLink rebrand 2020' },
  { brand: 'centurylink', registered: 'lumen', confidence: 'verified', source: 'CenturyLink rebrand 2020' },

  // High — strong evidence of same entity but worth re-verifying
  { brand: 'acentek (ace telephone association)', registered: 'acentek', confidence: 'high', source: 'naming convention' },
  { brand: 'conexon', registered: 'conexon connect', confidence: 'high', source: 'Conexon is parent, Conexon Connect is operating arm' },
  { brand: 'brightspeed operations', registered: 'brightspeed', confidence: 'high', source: 'self-evident' },
  { brand: 'verizon business', registered: 'verizon', confidence: 'high', source: 'Verizon Communications subsidiary' },
  { brand: 'verizon fiber solutions for business', registered: 'verizon', confidence: 'high', source: 'subsidiary' },
  { brand: 'at&t fiber', registered: 'at&t', confidence: 'high', source: 'subsidiary' },
  { brand: 'fastwyre broadband', registered: 'fastwyre', confidence: 'high', source: 'suffix' },
  { brand: 'allo communications', registered: 'allo', confidence: 'high', source: 'suffix' },
  { brand: 'great plains communications', registered: 'great plains', confidence: 'high', source: 'suffix' },
  { brand: 'dakota carrier network', registered: 'dakota carrier', confidence: 'high', source: 'suffix' },
  { brand: 'cox communications', registered: 'cox', confidence: 'high', source: 'self-evident' },
  { brand: 'omni fiber', registered: 'omni fiber', confidence: 'verified', source: 'self' },
  { brand: 'ripple fiber', registered: 'ripple fiber', confidence: 'verified', source: 'self' },
  { brand: 'gateway fiber', registered: 'gateway fiber', confidence: 'verified', source: 'self' },
  { brand: '123net', registered: '123 net', confidence: 'high', source: 'spacing variance' },
  { brand: '123 net', registered: '123net', confidence: 'high', source: 'spacing variance' },
  { brand: 'ezee fiber', registered: 'ezee fiber', confidence: 'verified', source: 'self' },
  { brand: 'metronet holdings', registered: 'metronet', confidence: 'high', source: 'corporate suffix' },
  { brand: 'metronet', registered: 'metronet holdings', confidence: 'high', source: 'corporate suffix' },
  { brand: 'mediacom', registered: 'mediacom communications', confidence: 'high', source: 'suffix' },
  { brand: 'ritter communications', registered: 'ritter', confidence: 'high', source: 'suffix' },
  { brand: 'spectrum', registered: 'charter spectrum', confidence: 'high', source: 'Charter brand' },
  { brand: 'charter', registered: 'charter spectrum', confidence: 'high', source: 'Charter brand' },
  { brand: 'fastbridge fiber', registered: 'fastbridge', confidence: 'high', source: 'suffix' },
  { brand: 'gonetspeed', registered: 'consolidated communications', confidence: 'high', source: 'parent-co' },
  { brand: 'wow! internet', registered: 'wide open west', confidence: 'high', source: 'corporate name' },
  { brand: 'wow!', registered: 'wide open west', confidence: 'high', source: 'corporate name' },
  { brand: 'tds telecom', registered: 'tds', confidence: 'high', source: 'suffix' },
  { brand: 'consolidated', registered: 'consolidated communications', confidence: 'high', source: 'suffix' },
  { brand: 'sparklight', registered: 'cable one', confidence: 'high', source: 'rebrand 2019' },
  { brand: 'cable one', registered: 'sparklight', confidence: 'high', source: 'rebrand 2019' },
  { brand: 'astound broadband', registered: 'astound', confidence: 'high', source: 'corporate suffix' },
  { brand: 'rcn', registered: 'astound', confidence: 'high', source: 'Astound acquisition' },
  { brand: 'wave broadband', registered: 'astound', confidence: 'high', source: 'Astound acquisition' },
  { brand: 'grande communications', registered: 'astound', confidence: 'high', source: 'Astound acquisition' },
  { brand: 'enmax', registered: 'enmax communications', confidence: 'high', source: 'suffix' },
];

/**
 * Resolve a brand-name to the BDC-registered name for FCC lookup.
 * Returns the original if no alias is known.
 */
export function resolveBdcAlias(brandNormalized: string): string {
  if (!brandNormalized) return brandNormalized;
  const lower = brandNormalized.toLowerCase().trim();
  const hit = BDC_ALIASES.find(a => a.brand.toLowerCase() === lower);
  return hit ? hit.registered : brandNormalized;
}

/**
 * Get all known aliases for a given brand (in case multiple registered names exist).
 * Used by getFccCoverage to try multiple candidates.
 */
export function getBdcCandidates(brandNormalized: string): string[] {
  const lower = brandNormalized.toLowerCase().trim();
  const candidates = new Set<string>([brandNormalized]);
  for (const alias of BDC_ALIASES) {
    if (alias.brand.toLowerCase() === lower) candidates.add(alias.registered);
    if (alias.registered.toLowerCase() === lower) candidates.add(alias.brand);
  }
  return [...candidates];
}
