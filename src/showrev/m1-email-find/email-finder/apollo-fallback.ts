/**
 * apollo-fallback.ts
 *
 * Apollo.io People Match API wrapper for email discovery fallback.
 * Called when self-hosted domain resolution or verification fails.
 *
 * API: POST https://api.apollo.io/api/v1/people/match
 * Cost: 1 credit per matched person, 0 if not found.
 * Free plan: 10,000 credits/year. Starter ($49/mo): 30,000 credits/year.
 */

export interface ApolloMatchResult {
  email: string | null;
  domain: string | null;
  confidence: 'high' | 'medium' | 'low' | 'not-found';
  source: string;
  organizationName: string | null;
  title: string | null;
  linkedinUrl: string | null;
}

export interface ApolloFallbackOptions {
  apiKey: string;
  timeoutMs?: number;
}

const APOLLO_MATCH_URL = 'https://api.apollo.io/api/v1/people/match';
const DEFAULT_TIMEOUT_MS = 15_000;

export async function apolloPeopleMatch(
  firstName: string,
  lastName: string,
  companyName: string,
  domain?: string,
  options?: ApolloFallbackOptions,
): Promise<ApolloMatchResult> {
  const apiKey = options?.apiKey || process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return { email: null, domain: null, confidence: 'not-found', source: 'apollo:no-key', organizationName: null, title: null, linkedinUrl: null };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    organization_name: companyName,
  };
  if (domain) {
    body.domain = domain;
  }

  try {
    const res = await fetch(APOLLO_MATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.log(`[apollo-fallback] API error ${res.status}: ${errText.slice(0, 200)}`);
      return { email: null, domain: null, confidence: 'not-found', source: `apollo:http-${res.status}`, organizationName: null, title: null, linkedinUrl: null };
    }

    const data = await res.json() as any;
    const person = data?.person;

    if (!person || !person.email) {
      console.log(`[apollo-fallback] No match for ${firstName} ${lastName} @ ${companyName}`);
      return { email: null, domain: null, confidence: 'not-found', source: 'apollo:no-match', organizationName: null, title: null, linkedinUrl: null };
    }

    const emailStatus = person.email_status;
    let confidence: ApolloMatchResult['confidence'] = 'medium';
    if (emailStatus === 'verified' || emailStatus === 'valid') {
      confidence = 'high';
    } else if (emailStatus === 'guessed' || emailStatus === 'assumed') {
      confidence = 'low';
    }

    const orgDomain = person.organization?.primary_domain
      || person.organization?.website_url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      || null;

    console.log(`[apollo-fallback] Match: ${person.email} (status=${emailStatus}, confidence=${confidence})`);

    return {
      email: person.email.toLowerCase(),
      domain: orgDomain,
      confidence,
      source: `apollo:${emailStatus || 'matched'}`,
      organizationName: person.organization?.name || null,
      title: person.title || null,
      linkedinUrl: person.linkedin_url || null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[apollo-fallback] Error: ${msg}`);
    return { email: null, domain: null, confidence: 'not-found', source: `apollo:error`, organizationName: null, title: null, linkedinUrl: null };
  }
}

/**
 * Create the apolloFn callback for the orchestrator's existing Step 4 hook.
 * This version requires a domain (used when domain resolution succeeded but
 * we want Apollo to confirm/enrich the email).
 */
export function createApolloEnrichFn(apiKey?: string): (firstName: string, lastName: string, domain: string) => Promise<string | null> {
  const key = apiKey || process.env.APOLLO_API_KEY;
  if (!key) return async () => null;

  return async (firstName: string, lastName: string, domain: string): Promise<string | null> => {
    const result = await apolloPeopleMatch(firstName, lastName, '', domain, { apiKey: key });
    return result.email;
  };
}
