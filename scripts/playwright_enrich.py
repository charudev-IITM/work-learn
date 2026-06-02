#!/usr/bin/env python3
"""
Playwright-based batch enrichment using Google search.
Extracts contact info from Google AI overviews and search snippets.

Usage:
    python playwright_enrich.py              # Process all unenriched
    python playwright_enrich.py --limit 50   # Process first 50
    python playwright_enrich.py --resume     # Resume from last position
"""
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

BASE = '/Users/kamal/comp-intel'
MASTER_CSV = os.path.join(BASE, 'master_contacts.csv')
ENRICHED_CSV = os.path.join(BASE, 'master_contacts_enriched.csv')
PROGRESS_FILE = os.path.join(BASE, 'enrich_progress.json')

# Regex patterns
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'(?:\+91[\s\-]?)?(?:[06-9]\d{1,4}[\s\-]?\d{4,8})')

JUNK_DOMAINS = {'sentry.io', 'w3.org', 'schema.org', 'googleapis.com', 'facebook.com',
                'twitter.com', 'instagram.com', 'youtube.com', 'google.com', 'gstatic.com',
                'cloudflare.com', 'jquery.com', 'example.com', 'sentry-next.wixpress.com'}


def extract_contacts_from_text(text):
    """Extract emails and phones from text."""
    emails = set()
    phones = set()

    for m in EMAIL_RE.finditer(text):
        email = m.group().lower().rstrip('.')
        domain = email.split('@')[1] if '@' in email else ''
        if domain not in JUNK_DOMAINS and not domain.endswith('.png') and not domain.endswith('.jpg'):
            emails.add(email)

    # Indian phone numbers
    for m in re.finditer(r'(?:\+91[\s\-]?)?[06-9]\d{4}[\s\-]?\d{5}', text):
        phone = re.sub(r'[\s\-]', '', m.group())
        if len(phone) >= 10:
            phones.add(phone)

    # Landline format: 022-XXXXXXXX
    for m in re.finditer(r'0\d{2,4}[\s\-]?\d{6,8}', text):
        phone = re.sub(r'[\s\-]', '', m.group())
        if len(phone) >= 10:
            phones.add(phone)

    return list(emails), list(phones)


def extract_address_from_text(text):
    """Try to extract an Indian address from text."""
    # Look for patterns like "Address: ..." or text with pin codes
    addr_match = re.search(r'(?:Address|Located at|Office)[:\s]+([^.]{20,200}?\d{6})', text, re.I)
    if addr_match:
        return addr_match.group(1).strip()

    # Look for pin code context
    pin_match = re.search(r'([^.]{20,150}?\b\d{6}\b)', text)
    if pin_match:
        return pin_match.group(1).strip()

    return ''


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()

    # Load current data
    source = ENRICHED_CSV if os.path.exists(ENRICHED_CSV) else MASTER_CSV
    with open(source, 'r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    print(f"Loaded {len(rows)} rows from {source}")

    # Find entries needing enrichment
    needs = []
    for i, row in enumerate(rows):
        if not row.get('emails') and not row.get('phone') and row.get('firm_name'):
            needs.append((i, row))

    print(f"Need enrichment: {len(needs)}")

    # Resume support
    start_idx = 0
    if args.resume and os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
            start_idx = progress.get('last_index', 0)
        print(f"Resuming from index {start_idx}")

    batch = needs[start_idx:start_idx + args.limit]
    print(f"Processing batch of {len(batch)} (from index {start_idx})")

    enriched_count = 0

    for batch_idx, (row_idx, row) in enumerate(batch):
        firm = row['firm_name']
        city = row.get('city', '')
        person = row.get('contact_person', '')

        # Build search query
        query_parts = [firm]
        if city:
            query_parts.append(city)
        if row.get('type') in ('jeweller', 'both'):
            query_parts.append('jeweller')
        query_parts.extend(['contact', 'email', 'phone'])
        query = ' '.join(query_parts)

        search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}"

        print(f"  [{batch_idx+1}/{len(batch)}] Searching: {firm} ({city})...", end=' ', flush=True)

        # Use curl to fetch Google search results (faster than Playwright per-query)
        try:
            result = subprocess.run(
                ['curl', '-s', '-L', '-A',
                 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                 '--max-time', '10',
                 search_url],
                capture_output=True, text=True, timeout=15
            )
            html = result.stdout
        except Exception as e:
            print(f"error: {e}")
            continue

        if not html or len(html) < 500:
            print("empty response")
            time.sleep(2)
            continue

        # Extract contacts from the full HTML
        emails, phones = extract_contacts_from_text(html)
        address = extract_address_from_text(html)

        # Also try to find website
        website = ''
        if not row.get('website'):
            for m in re.finditer(r'href="(https?://(?:www\.)?[a-z0-9\-]+\.(?:com|in|co\.in|net|org)[^"]*)"', html, re.I):
                url = m.group(1)
                if not any(d in url for d in ['google.', 'youtube.', 'facebook.', 'instagram.',
                                               'twitter.', 'justdial.', 'zaubacorp.', 'contactout.',
                                               'indiamart.', 'wikipedia.']):
                    website = url
                    break

        if emails or phones:
            rows[row_idx]['emails'] = '; '.join(emails[:5])  # Max 5 emails
            rows[row_idx]['phone'] = '; '.join(phones[:5])    # Max 5 phones
            if website and not rows[row_idx].get('website'):
                rows[row_idx]['website'] = website
            if address and not rows[row_idx].get('address'):
                rows[row_idx]['address'] = address
            enriched_count += 1
            print(f"✓ emails={len(emails)} phones={len(phones)}")
        else:
            print("✗ no contact found")

        # Rate limit
        time.sleep(2)

        # Save progress periodically
        if (batch_idx + 1) % 10 == 0:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump({'last_index': start_idx + batch_idx + 1, 'enriched': enriched_count}, f)

    # Write enriched output
    fields = ['firm_name', 'contact_person', 'emails', 'phone', 'whatsapp',
              'type', 'address', 'city', 'state', 'website', 'source']
    with open(ENRICHED_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, '') for k in fields})

    # Save final progress
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({'last_index': start_idx + len(batch), 'enriched': enriched_count}, f)

    total_enriched = sum(1 for r in rows if r.get('emails') or r.get('phone'))
    still_missing = sum(1 for r in rows if not r.get('emails') and not r.get('phone'))
    print(f"\n=== RESULTS ===")
    print(f"  New enrichments this run: {enriched_count}")
    print(f"  Total with contact info: {total_enriched}")
    print(f"  Still missing: {still_missing}")
    print(f"  Written: {ENRICHED_CSV}")


if __name__ == '__main__':
    main()
