/**
 * Pre-load smoke audit — operator visibility BEFORE any HS writes.
 *
 * For each candidate prospect, surface:
 *   1. Contact lookup at exact email — exists? bounce history? owner? lifecycle?
 *   2. Company lookup at prospect's domain — single? multiple? none?
 *   3. Company NAME fuzzy match — similar names at different domains?
 *   4. CAN-SPAM history — has this contact opted out of any prior HS send?
 *
 * Read-only. No writes. Outputs structured report.
 * Operator reviews report → approves load or swaps prospects.
 *
 * Spec v6 Component 1 extension. Pairs with preload-verify.ts.
 */

import { hsApi } from './hs-api-client';

export interface ProspectInput {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  companyDomain: string;
  assignedAe: string;
}

export interface ContactMatch {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  ownerId?: string;
  lifecycleStage?: string;
  hardBounce?: string;
  hardBounceReason?: string;
  optOut?: string;
  lastActivityDate?: string;
}

export interface CompanyMatch {
  id: string;
  name: string;
  domain: string;
  matchType: 'exact_domain' | 'fuzzy_name' | 'both';
  ownerId?: string;
}

export interface ProspectAuditRow {
  prospect: ProspectInput;
  contactMatch: ContactMatch | null;
  companyMatchesByDomain: CompanyMatch[];
  companyMatchesByName: CompanyMatch[];
  riskFlags: string[];
  loadVerdict: 'PROCEED' | 'REVIEW' | 'BLOCK';
}

export interface AuditReport {
  generatedAtUtc: string;
  totalProspects: number;
  proceedCount: number;
  reviewCount: number;
  blockCount: number;
  rows: ProspectAuditRow[];
}

async function lookupContactByEmail(
  email: string,
): Promise<ContactMatch | null> {
  try {
    const res = await hsApi<{
      results: Array<{
        id: string;
        properties: Record<string, string | null>;
      }>;
    }>('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email.toLowerCase(),
            },
          ],
        },
      ],
      properties: [
        'email',
        'firstname',
        'lastname',
        'hubspot_owner_id',
        'lifecyclestage',
        'hs_email_hard_bounce',
        'hs_email_hard_bounce_reason',
        'hs_email_optout',
        'notes_last_contacted',
      ],
      limit: 1,
    });
    const result = res.data.results?.[0];
    if (!result) return null;
    const p = result.properties;
    return {
      id: result.id,
      email: p.email || email,
      firstName: p.firstname || undefined,
      lastName: p.lastname || undefined,
      ownerId: p.hubspot_owner_id || undefined,
      lifecycleStage: p.lifecyclestage || undefined,
      hardBounce: p.hs_email_hard_bounce || undefined,
      hardBounceReason: p.hs_email_hard_bounce_reason || undefined,
      optOut: p.hs_email_optout || undefined,
      lastActivityDate: p.notes_last_contacted || undefined,
    };
  } catch (e) {
    // Treat as "no match found" for empty/error states
    return null;
  }
}

async function lookupCompaniesByDomain(
  domain: string,
): Promise<CompanyMatch[]> {
  if (!domain) return [];
  try {
    const res = await hsApi<{
      results: Array<{ id: string; properties: Record<string, string | null> }>;
    }>('/crm/v3/objects/companies/search', 'POST', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'domain', operator: 'EQ', value: domain.toLowerCase() },
          ],
        },
      ],
      properties: ['name', 'domain', 'hubspot_owner_id'],
      limit: 10,
    });
    return (res.data.results || []).map((r) => ({
      id: r.id,
      name: r.properties.name || '(unnamed)',
      domain: r.properties.domain || domain,
      matchType: 'exact_domain' as const,
      ownerId: r.properties.hubspot_owner_id || undefined,
    }));
  } catch {
    return [];
  }
}

async function lookupCompaniesByName(
  companyName: string,
  excludeDomain: string,
): Promise<CompanyMatch[]> {
  if (!companyName || companyName.length < 4) return [];
  // HubSpot's CONTAINS_TOKEN does fuzzy-ish word matching on names
  try {
    const res = await hsApi<{
      results: Array<{ id: string; properties: Record<string, string | null> }>;
    }>('/crm/v3/objects/companies/search', 'POST', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'name',
              operator: 'CONTAINS_TOKEN',
              value: companyName.split(/\s+/)[0], // first word
            },
          ],
        },
      ],
      properties: ['name', 'domain', 'hubspot_owner_id'],
      limit: 10,
    });
    return (res.data.results || [])
      .filter(
        (r) => (r.properties.domain || '').toLowerCase() !== excludeDomain.toLowerCase(),
      )
      .map((r) => ({
        id: r.id,
        name: r.properties.name || '(unnamed)',
        domain: r.properties.domain || '',
        matchType: 'fuzzy_name' as const,
        ownerId: r.properties.hubspot_owner_id || undefined,
      }));
  } catch {
    return [];
  }
}

function evaluateRow(
  prospect: ProspectInput,
  contactMatch: ContactMatch | null,
  domainMatches: CompanyMatch[],
  nameMatches: CompanyMatch[],
): { riskFlags: string[]; verdict: 'PROCEED' | 'REVIEW' | 'BLOCK' } {
  const riskFlags: string[] = [];
  let verdict: 'PROCEED' | 'REVIEW' | 'BLOCK' = 'PROCEED';

  // Contact-level risks
  if (contactMatch) {
    if (contactMatch.hardBounce === 'true') {
      riskFlags.push(`🚫 Existing contact has hs_email_hard_bounce=true (reason: ${contactMatch.hardBounceReason || 'unknown'}) — DO NOT SEND`);
      verdict = 'BLOCK';
    }
    if (contactMatch.optOut === 'true') {
      riskFlags.push(`🚫 Existing contact has hs_email_optout=true — CAN-SPAM: DO NOT SEND`);
      verdict = 'BLOCK';
    }
    if (contactMatch.lifecycleStage && contactMatch.lifecycleStage !== '1162148264') {
      riskFlags.push(`⚠️ Existing contact is at lifecycle stage "${contactMatch.lifecycleStage}" (not Prospect). Cold outreach to a Customer/Lead is risky`);
      if (verdict !== 'BLOCK') verdict = 'REVIEW';
    }
    if (contactMatch.ownerId && contactMatch.ownerId !== '') {
      riskFlags.push(`ℹ️ Existing contact has owner ${contactMatch.ownerId}. Loader will preserve it (won't overwrite).`);
    }
    if (contactMatch.lastActivityDate) {
      riskFlags.push(`ℹ️ Existing contact last contacted: ${contactMatch.lastActivityDate}`);
    }
    riskFlags.push(`✅ Contact exists (HS id ${contactMatch.id}). Loader will UPDATE showrev_* only.`);
  } else {
    riskFlags.push(`✨ New contact — will be created.`);
  }

  // Company-level risks
  if (domainMatches.length === 0) {
    riskFlags.push(`✨ No company at ${prospect.companyDomain}. Will be created.`);
  } else if (domainMatches.length === 1) {
    riskFlags.push(`✅ Single company match at ${prospect.companyDomain} → "${domainMatches[0].name}" (HS id ${domainMatches[0].id}). Will be reused.`);
  } else {
    riskFlags.push(`⚠️ ${domainMatches.length} companies at ${prospect.companyDomain} — possible duplication. Operator pick: ${domainMatches.map((m) => `${m.id}=${m.name}`).join(', ')}`);
    if (verdict !== 'BLOCK') verdict = 'REVIEW';
  }

  // Name-fuzzy matches at different domains (potential "same company different domain" cases)
  if (nameMatches.length > 0) {
    riskFlags.push(`⚠️ ${nameMatches.length} other companies with similar names at DIFFERENT domains: ${nameMatches.slice(0, 3).map((m) => `${m.name}@${m.domain}`).join(', ')}${nameMatches.length > 3 ? ` (+${nameMatches.length - 3} more)` : ''}. Verify these aren't the same entity.`);
    if (verdict === 'PROCEED') verdict = 'REVIEW';
  }

  return { riskFlags, verdict };
}

export async function auditOneProspect(
  prospect: ProspectInput,
): Promise<ProspectAuditRow> {
  const [contactMatch, domainMatches, nameMatches] = await Promise.all([
    lookupContactByEmail(prospect.email),
    lookupCompaniesByDomain(prospect.companyDomain),
    lookupCompaniesByName(prospect.company, prospect.companyDomain),
  ]);

  const { riskFlags, verdict } = evaluateRow(
    prospect,
    contactMatch,
    domainMatches,
    nameMatches,
  );

  return {
    prospect,
    contactMatch,
    companyMatchesByDomain: domainMatches,
    companyMatchesByName: nameMatches,
    riskFlags,
    loadVerdict: verdict,
  };
}

export async function runAudit(
  prospects: ProspectInput[],
): Promise<AuditReport> {
  const rows: ProspectAuditRow[] = [];
  for (const p of prospects) {
    const row = await auditOneProspect(p);
    rows.push(row);
  }
  return {
    generatedAtUtc: new Date().toISOString(),
    totalProspects: prospects.length,
    proceedCount: rows.filter((r) => r.loadVerdict === 'PROCEED').length,
    reviewCount: rows.filter((r) => r.loadVerdict === 'REVIEW').length,
    blockCount: rows.filter((r) => r.loadVerdict === 'BLOCK').length,
    rows,
  };
}

export function formatReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# Pre-load Audit Report`);
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push(`- Total prospects: ${report.totalProspects}`);
  lines.push(`- ✅ Proceed: ${report.proceedCount}`);
  lines.push(`- ⚠️ Review: ${report.reviewCount}`);
  lines.push(`- 🚫 Block: ${report.blockCount}`);
  lines.push('');
  for (const r of report.rows) {
    const icon = r.loadVerdict === 'BLOCK' ? '🚫' : r.loadVerdict === 'REVIEW' ? '⚠️' : '✅';
    lines.push(`---`);
    lines.push(`### ${icon} ${r.prospect.firstName} ${r.prospect.lastName} (${r.prospect.assignedAe})`);
    lines.push(`- Email: \`${r.prospect.email}\``);
    lines.push(`- Company: ${r.prospect.company} (${r.prospect.companyDomain})`);
    lines.push(`- Verdict: **${r.loadVerdict}**`);
    lines.push('');
    for (const flag of r.riskFlags) {
      lines.push(`  - ${flag}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
