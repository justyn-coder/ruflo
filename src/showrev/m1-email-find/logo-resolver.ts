const TIMEOUT_MS = 4000;

const SOURCES = [
  (domain: string) => `https://img.logo.dev/${domain}?token=pk_anonymous&format=png&size=200`,
  (domain: string) => `https://logo.clearbit.com/${domain}?size=200`,
  (domain: string) => `https://api.companyenrich.com/logos/${domain}`,
  (domain: string) => `https://logos.hunter.io/${domain}`,
  (domain: string) => `https://logo.uplead.com/${domain}`,
];

async function probeUrl(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const cl = parseInt(res.headers.get('content-length') || '0', 10);
    if (cl > 0 && cl < 200) return null; // tiny placeholder/pixel
    return url;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function resolveCompanyLogo(
  domain: string,
  opts?: { verbose?: boolean },
): Promise<string | null> {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
  if (!clean || !clean.includes('.')) return null;

  const results = await Promise.allSettled(
    SOURCES.map(fn => probeUrl(fn(clean), TIMEOUT_MS)),
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      if (opts?.verbose) console.log(`    Logo resolved: ${r.value}`);
      return r.value;
    }
  }

  if (opts?.verbose) console.log(`    Logo: no valid source found for ${clean}, will use text fallback`);
  return null;
}

export async function verifyLogoUrl(url: string): Promise<boolean> {
  const result = await probeUrl(url, TIMEOUT_MS);
  return result !== null;
}

export async function resolveOrVerify(
  existingUrl: string | null | undefined,
  domain: string,
  opts?: { verbose?: boolean },
): Promise<string | null> {
  if (existingUrl) {
    const valid = await verifyLogoUrl(existingUrl);
    if (valid) return existingUrl;
    if (opts?.verbose) console.log(`    Logo URL broken (${existingUrl.slice(0, 60)}...), resolving fresh`);
  }
  return resolveCompanyLogo(domain, opts);
}
