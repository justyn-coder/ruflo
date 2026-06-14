#!/usr/bin/env python3
"""
Substrate citation audit — verify each composer claim's cited URL.

For each of the 15 smoke prospects:
  1. Pull research_summary.citations from sr_engine_output
  2. For each citation: fetch URL, check HTTP status, classify source domain
  3. Detect contaminated sources (ZoomInfo, LeadIQ, Apollo, RocketReach, Prospeo, Hunter, etc.)
  4. Surface per-claim verdict

Output: /tmp/citation-audit-15.md with per-prospect breakdown.
"""
import os
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
import re
from collections import defaultdict

SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SB_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

PROHIBITED_DOMAINS = {
    'zoominfo.com', 'leadiq.com', 'apollo.io', 'rocketreach.co',
    'rocketreach.com', 'prospeo.io', 'prospeo.com', 'hunter.io',
    'cleanlist.com', 'cleanlist.io', 'contactout.com', 'mailmo.com',
    'snov.io', 'kaspr.io', 'lusha.com', 'salezshark.com',
    'datanyze.com', 'cognism.com', 'seamless.ai',
}

PREFERRED_DOMAINS = {
    # Press release wires
    'prnewswire.com', 'globenewswire.com', 'businesswire.com',
    # Investor / SEC
    'sec.gov',
    # Industry trade press
    'telecompetitor.com', 'lightreading.com', 'fiercetelecom.com',
    'bbcmag.com', 'fiberbroadband.org', 'commerce.gov', 'ntia.gov',
}

SMOKE_15 = [
    ('Michele', 'Sadwick', 'Greenlight'),
    ('Laurie', 'Turck', 'Network Connex'),
    ('Dara', 'Leslie', 'Shentel'),
    ('Brendan', 'Karchner', 'Buckeye'),
    ('Gabriel', 'Gilliland', 'Blue Ridge'),
    ('Aamer', 'Abbasi', 'Lyte'),
    ('Casey', 'Worth', 'United Fiber'),
    ('Doug', 'Spurlin', 'Frontier'),
    ('Zack', 'Burnes', 'United Tel Supply'),
    ('Issac', 'Roehm', 'IdeaTek'),
    ('Ben', 'Lewis-Ramirez', 'Communication Network'),
    ('Anthony', 'Jelniker', 'Great Plains'),
    ('Jesus', 'Loya', 'PC Telcom'),
    ('Jeff', 'Reiman', 'The Broadband Group'),
    ('George', 'Spengler', 'Lyte'),
]


def extract_domain(url):
    """Pull bare domain from URL."""
    if not url:
        return ''
    # Sometimes citation URL has prefix like "telecompetitor — https://..."
    m = re.search(r'https?://([^/\s]+)', url)
    if not m:
        return ''
    domain = m.group(1).lower()
    # Strip www.
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain


def classify_domain(url):
    """Classify domain as PROHIBITED, PREFERRED, COMPANY-OWN, or GENERIC."""
    domain = extract_domain(url)
    if not domain:
        return 'NO-URL'
    if any(p in domain for p in PROHIBITED_DOMAINS):
        return 'CONTAMINATED'
    if any(p in domain for p in PREFERRED_DOMAINS):
        return 'PRIMARY-PRESS'
    return 'GENERIC'  # neutral — could be company own page or other


def fetch_url_check(url, timeout=15):
    """Fetch URL, return (status_code, content_snippet)."""
    if not url:
        return None, '(no url)'
    # Extract clean URL from possibly-prefixed string
    m = re.search(r'https?://[^\s\)\>]+', url)
    if not m:
        return None, '(malformed url)'
    clean_url = m.group(0).rstrip('.,;')
    try:
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 (compatible; CitationAudit/1.0)'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(50000).decode('utf-8', errors='replace')
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, f'(HTTP {e.code})'
    except Exception as e:
        return None, f'(error: {type(e).__name__}: {str(e)[:120]})'


def check_claim_in_content(claim, body, threshold_words=2):
    """Naive: check if a few rare-ish words from the claim appear in the body."""
    if not body or len(body) < 200:
        return False
    # Find distinctive words/numbers in the claim
    # Look for: numbers > 100, capitalized multi-word phrases, dollar amounts
    distinctive = []
    # Extract numbers that look like figures
    for m in re.finditer(r'\b\d[\d,\.]*\b', claim):
        n = m.group(0)
        if any(c in n for c in ',.') or len(n) >= 3:
            distinctive.append(n)
    # Extract capitalized phrases (multi-word proper nouns)
    for m in re.finditer(r'\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\b', claim):
        phrase = m.group(0)
        if len(phrase) > 5 and phrase.lower() not in ('the', 'a', 'an'):
            distinctive.append(phrase)

    if not distinctive:
        return False
    body_lower = body.lower()
    matches = sum(1 for d in distinctive if d.lower() in body_lower)
    return matches >= min(threshold_words, len(distinctive))


def fetch_prospect_data():
    rows = []
    for first, last, co in SMOKE_15:
        f_enc = urllib.parse.quote(first)
        l_enc = urllib.parse.quote(last)
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_prospects?first_name=eq.{f_enc}&last_name=eq.{l_enc}&select=id,company,company_website,assigned_ae,email",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        candidates = json.loads(urllib.request.urlopen(req).read())
        match = next((c for c in candidates if co.lower() in (c.get('company') or '').lower()), None)
        if not match:
            print(f'  ⚠️ {first} {last} @ {co} not in sr_prospects', file=sys.stderr)
            continue
        enc_id = urllib.parse.quote(match['id'])
        req2 = urllib.request.Request(
            f"{SB_URL}/rest/v1/sr_engine_output?prospect_id=eq.{enc_id}&select=email_subject_t1,email_body_t1,email_ps_t1,research_summary&order=created_at.desc&limit=1",
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        )
        eo = json.loads(urllib.request.urlopen(req2).read())
        if not eo:
            continue
        d = {**match, **eo[0], 'first_name': first, 'last_name': last}
        rows.append(d)
    return rows


def audit_prospect(row):
    rs_raw = row.get('research_summary') or ''
    if not rs_raw:
        return {'verdict': 'NO-RESEARCH-SUMMARY', 'claims': []}
    try:
        rs = json.loads(rs_raw) if isinstance(rs_raw, str) else rs_raw
    except json.JSONDecodeError:
        return {'verdict': 'RESEARCH-SUMMARY-NOT-JSON', 'claims': []}

    citations = rs.get('citations', {})
    body_sentences = rs.get('body_sentences', [])

    # Group claims by sentence
    claim_results = []
    seen_cids = set()
    for sent in body_sentences:
        cids = sent.get('claim_ids', [])
        text = sent.get('text', '')
        for cid in cids:
            if cid in seen_cids:
                continue
            seen_cids.add(cid)
            c = citations.get(cid, {})
            claim = c.get('claim', '')
            source = c.get('source_citation', '')
            domain_class = classify_domain(source)
            print(f'    [{cid}] domain_class={domain_class}', file=sys.stderr)

            # If contaminated, mark immediately
            if domain_class == 'CONTAMINATED':
                claim_results.append({
                    'cid': cid, 'sentence': text, 'claim': claim,
                    'source': source, 'domain_class': domain_class,
                    'http_status': None, 'content_match': None,
                    'verdict': 'CONTAMINATED-SOURCE',
                })
                continue

            # Otherwise fetch + check
            status, body = fetch_url_check(source)
            content_match = check_claim_in_content(claim, body) if status == 200 else False

            if status is None or status >= 400:
                verdict = 'DEAD-URL'
            elif not content_match:
                verdict = 'CONTENT-MISMATCH'
            else:
                verdict = 'VERIFIED'

            claim_results.append({
                'cid': cid, 'sentence': text, 'claim': claim,
                'source': source, 'domain_class': domain_class,
                'http_status': status, 'content_match': content_match,
                'verdict': verdict,
            })

    # Overall verdict
    verdicts = [c['verdict'] for c in claim_results]
    if not verdicts:
        overall = 'NO-CLAIMS-DEFENSIBLE-BY-DESIGN'
    elif all(v == 'VERIFIED' for v in verdicts):
        overall = 'SHIP AS-IS'
    elif any(v == 'CONTAMINATED-SOURCE' for v in verdicts):
        overall = 'STRIP CONTAMINATED'
    elif any(v == 'DEAD-URL' for v in verdicts):
        overall = 'STRIP DEAD-URL'
    elif any(v == 'CONTENT-MISMATCH' for v in verdicts):
        overall = 'STRIP CONTENT-MISMATCH'
    else:
        overall = 'REVIEW'
    return {'verdict': overall, 'claims': claim_results}


def main():
    print('=== Substrate Citation Audit (15 prospects) ===', file=sys.stderr)
    print('Fetching prospect data...', file=sys.stderr)
    rows = fetch_prospect_data()
    print(f'Got {len(rows)} prospects with research_summary', file=sys.stderr)

    audits = []
    for row in rows:
        name = f"{row['first_name']} {row['last_name']}"
        print(f'\nAuditing: {name} @ {row["company"]}...', file=sys.stderr)
        audit = audit_prospect(row)
        audit['prospect'] = name
        audit['company'] = row['company']
        audit['ae'] = row.get('assigned_ae', '')
        audit['email'] = row.get('email', '')
        audit['subject'] = row.get('email_subject_t1', '')
        audit['body'] = row.get('email_body_t1', '')
        audit['ps'] = row.get('email_ps_t1', '')
        audits.append(audit)

    # Build report
    report = ['# Substrate Citation Audit — Smoke 15\n']
    report.append(f'Generated for tomorrow morning send decision\n')
    report.append('## Verdict tally\n')

    tally = defaultdict(int)
    for a in audits:
        tally[a['verdict']] += 1
    for v, c in sorted(tally.items(), key=lambda x: -x[1]):
        report.append(f'- **{v}**: {c}\n')

    report.append('\n---\n')

    for a in audits:
        report.append(f'\n## {a["prospect"]} @ {a["company"]} ({a["ae"]})\n')
        report.append(f'**Verdict: {a["verdict"]}**\n\n')
        report.append(f'Subject: "{a["subject"]}"\n\n')
        report.append('Body:\n```\n' + (a['body'] or '') + '\n```\n\n')
        if a.get('ps'):
            report.append(f'P.S.: "{a["ps"]}"\n\n')

        if not a.get('claims'):
            report.append('No claims to verify (industry framing only — defensible).\n')
        else:
            report.append('### Claims\n')
            for cl in a['claims']:
                icon = '✅' if cl['verdict'] == 'VERIFIED' else ('🚫' if cl['verdict'] == 'CONTAMINATED-SOURCE' else '⚠️')
                report.append(f'\n{icon} **{cl["verdict"]}**\n')
                report.append(f'- Claim: {cl["claim"][:300]}\n')
                report.append(f'- Source: {cl["source"][:200]}\n')
                report.append(f'- Domain class: {cl["domain_class"]}\n')
                report.append(f'- HTTP status: {cl["http_status"]}\n')
                report.append(f'- Content match: {cl["content_match"]}\n')

    out_path = '/tmp/citation-audit-15.md'
    with open(out_path, 'w') as f:
        f.write(''.join(report))

    # Also save raw JSON for downstream processing
    with open('/tmp/citation-audit-15.json', 'w') as f:
        json.dump(audits, f, indent=2)

    print(f'\n💾 Saved {out_path}', file=sys.stderr)
    print(f'💾 Saved /tmp/citation-audit-15.json', file=sys.stderr)
    print('\n--- Summary tally ---', file=sys.stderr)
    for v, c in sorted(tally.items(), key=lambda x: -x[1]):
        print(f'  {v}: {c}', file=sys.stderr)


if __name__ == '__main__':
    main()
