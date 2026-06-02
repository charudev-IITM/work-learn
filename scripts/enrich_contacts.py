#!/usr/bin/env python3
"""
Enrich master_contacts.csv with contact info from:
1. Direct website scraping (for entries with URLs)
2. Google search results (for entries without URLs)

Uses the MetadataExtractor from scrape_dealer_metadata.py.
"""
import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor, as_completed


# ── Minimal MetadataExtractor (from scrape_dealer_metadata.py) ────────

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'(?:\+91[\s\-]?)?(?:\d[\s\-]?){10}')
WHATSAPP_RE = re.compile(r'wa\.me/(\d+)|whatsapp.*?(\d{10,12})', re.I)

# Ignore junk emails
JUNK_EMAILS = {'sampledata@gmail.com', 'example@example.com', 'info@example.com',
               'support@support.com', 'email@email.com'}
JUNK_DOMAINS = {'sentry.io', 'w3.org', 'schema.org', 'googleapis.com', 'facebook.com',
                'twitter.com', 'instagram.com', 'youtube.com', 'google.com', 'gstatic.com',
                'cloudflare.com', 'jquery.com', 'jsdelivr.net', 'bootstrapcdn.com',
                'fontawesome.com', 'wordpress.org', 'wp.com', 'gravatar.com',
                'wixsite.com', 'squarespace.com'}


class SimpleExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.emails = set()
        self.phones = set()
        self.whatsapp = set()
        self._text_parts = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        href = attrs_dict.get('href', '')
        # mailto links
        if href.startswith('mailto:'):
            email = href[7:].split('?')[0].strip().lower()
            if email and '@' in email:
                self.emails.add(email)
        # tel links
        if href.startswith('tel:'):
            phone = href[4:].strip()
            phone = re.sub(r'[^\d+]', '', phone)
            if len(phone) >= 10:
                self.phones.add(phone)
        # WhatsApp links
        if 'wa.me' in href or 'whatsapp' in href.lower():
            m = re.search(r'(\d{10,13})', href)
            if m:
                self.whatsapp.add(m.group(1))

    def handle_data(self, data):
        self._text_parts.append(data)

    def extract_from_text(self):
        text = ' '.join(self._text_parts)
        # Emails from text
        for m in EMAIL_RE.finditer(text):
            email = m.group().lower()
            domain = email.split('@')[1] if '@' in email else ''
            if email not in JUNK_EMAILS and domain not in JUNK_DOMAINS:
                self.emails.add(email)
        # Phones from text (Indian format)
        for m in re.finditer(r'(?:\+91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}', text):
            phone = re.sub(r'[\s\-]', '', m.group())
            if len(phone) >= 10:
                self.phones.add(phone)


def fetch_url(url, timeout=10):
    """Fetch URL content with SSL handling."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    try:
        resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return resp.read().decode('utf-8', errors='ignore')
    except Exception:
        return None


def scrape_website(url):
    """Scrape a website for contact info."""
    html = fetch_url(url)
    if not html:
        return {}

    ext = SimpleExtractor()
    try:
        ext.feed(html)
    except Exception:
        pass
    ext.extract_from_text()

    # Also try /contact page
    for suffix in ['/contact', '/contact-us', '/contactus']:
        contact_url = url.rstrip('/') + suffix
        html2 = fetch_url(contact_url)
        if html2:
            ext2 = SimpleExtractor()
            try:
                ext2.feed(html2)
                ext2.extract_from_text()
                ext.emails.update(ext2.emails)
                ext.phones.update(ext2.phones)
                ext.whatsapp.update(ext2.whatsapp)
            except Exception:
                pass

    return {
        'emails': list(ext.emails),
        'phones': list(ext.phones),
        'whatsapp': list(ext.whatsapp),
    }


def google_search_contact(company_name, city):
    """Search Google for company contact info via web search."""
    query = f"{company_name} {city} jeweller contact email phone"
    search_url = f"https://www.google.com/search?q={urllib.request.quote(query)}"

    html = fetch_url(search_url, timeout=8)
    if not html:
        return {}

    # Extract emails and phones from search results
    emails = set()
    phones = set()

    for m in EMAIL_RE.finditer(html):
        email = m.group().lower()
        domain = email.split('@')[1] if '@' in email else ''
        if email not in JUNK_EMAILS and domain not in JUNK_DOMAINS:
            emails.add(email)

    for m in re.finditer(r'(?:\+91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}', html):
        phone = re.sub(r'[\s\-]', '', m.group())
        if len(phone) >= 10:
            phones.add(phone)

    # Try to extract a website URL from results
    website = ''
    for m in re.finditer(r'href="(https?://[^"]*?(?:jewel|gold|bullion|chain|ornament)[^"]*?)"', html, re.I):
        url = m.group(1)
        if 'google' not in url and 'youtube' not in url:
            website = url
            break

    return {
        'emails': list(emails),
        'phones': list(phones),
        'website': website,
    }


def enrich_entry(row):
    """Try to enrich a single entry."""
    result = {'firm_name': row['firm_name'], 'emails': '', 'phone': '', 'whatsapp': '', 'website': ''}

    # Strategy 1: Direct website scraping
    if row.get('website'):
        info = scrape_website(row['website'])
        if info.get('emails'):
            result['emails'] = '; '.join(info['emails'])
        if info.get('phones'):
            result['phone'] = '; '.join(info['phones'])
        if info.get('whatsapp'):
            result['whatsapp'] = info['whatsapp'][0]
        return result

    # Strategy 2: Google search
    if row['firm_name'] and row.get('city'):
        info = google_search_contact(row['firm_name'], row.get('city', ''))
        if info.get('emails'):
            result['emails'] = '; '.join(info['emails'])
        if info.get('phones'):
            result['phone'] = '; '.join(info['phones'])
        if info.get('website'):
            result['website'] = info['website']
        return result

    return result


def main():
    base = '/Users/kamal/comp-intel'
    master_path = os.path.join(base, 'master_contacts.csv')
    output_path = os.path.join(base, 'master_contacts_enriched.csv')

    # Load master
    with open(master_path, 'r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    print(f"Loaded {len(rows)} rows")

    # Find entries needing enrichment
    needs = []
    for i, row in enumerate(rows):
        if not row['emails'] and not row['phone']:
            needs.append((i, row))

    print(f"Need enrichment: {len(needs)}")

    # Tier 1: Entries with websites (scrape directly)
    tier1 = [(i, r) for i, r in needs if r.get('website')]
    # Tier 2: Companies (Google search) - limit to manageable batch
    tier2 = [(i, r) for i, r in needs if not r.get('website') and r['firm_name'] and r.get('city')]

    print(f"Tier 1 (website scrape): {len(tier1)}")
    print(f"Tier 2 (Google search): {len(tier2)}")

    enriched_count = 0

    # Process Tier 1
    print("\n--- Tier 1: Scraping websites ---")
    for idx, (i, row) in enumerate(tier1):
        try:
            result = enrich_entry(row)
            if result['emails'] or result['phone']:
                rows[i]['emails'] = result['emails']
                rows[i]['phone'] = result['phone']
                if result['whatsapp']:
                    rows[i]['whatsapp'] = result['whatsapp']
                enriched_count += 1
                print(f"  [{idx+1}/{len(tier1)}] ✓ {row['firm_name']}: {result['emails'][:30]}")
            else:
                print(f"  [{idx+1}/{len(tier1)}] ✗ {row['firm_name']}: no contact found")
        except Exception as e:
            print(f"  [{idx+1}/{len(tier1)}] ! {row['firm_name']}: error {e}")
        time.sleep(0.5)

    # Process Tier 2 (batch - limit to avoid rate limits)
    batch_size = min(200, len(tier2))  # Process up to 200 at a time
    print(f"\n--- Tier 2: Google search (batch of {batch_size}) ---")
    for idx, (i, row) in enumerate(tier2[:batch_size]):
        try:
            result = enrich_entry(row)
            if result['emails'] or result['phone']:
                rows[i]['emails'] = result['emails']
                rows[i]['phone'] = result['phone']
                if result.get('website') and not rows[i]['website']:
                    rows[i]['website'] = result['website']
                enriched_count += 1
                if idx % 20 == 0 or result['emails']:
                    print(f"  [{idx+1}/{batch_size}] ✓ {row['firm_name']}: {result['emails'][:30]}")
            else:
                if idx % 50 == 0:
                    print(f"  [{idx+1}/{batch_size}] scanning... ({enriched_count} found so far)")
        except Exception as e:
            if idx % 50 == 0:
                print(f"  [{idx+1}/{batch_size}] error: {e}")
        time.sleep(1.5)  # Rate limit for Google

    # Write enriched output
    fields = ['firm_name', 'contact_person', 'emails', 'phone', 'whatsapp',
              'type', 'address', 'city', 'state', 'website', 'source']
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, '') for k in fields})

    total_enriched = sum(1 for r in rows if r['emails'] or r['phone'])
    still_missing = sum(1 for r in rows if not r['emails'] and not r['phone'])
    print(f"\n=== RESULTS ===")
    print(f"  New enrichments this run: {enriched_count}")
    print(f"  Total with contact info: {total_enriched}")
    print(f"  Still missing: {still_missing}")
    print(f"  Written: {output_path}")


if __name__ == '__main__':
    main()
