#!/usr/bin/env python3
"""
Build master contacts CSV from all data sources:
1. PDF (master platinum members directory)
2. platinum_members_jewellers.csv
3. bullion_dealers_research.csv
4. PostgreSQL dealer_metadata table
"""
import csv
import json
import re
import os

# ── Known cities ──────────────────────────────────────────────────────
KNOWN_CITIES = {
    'MUMBAI', 'MUMBAI CITY', 'MUMBAI SUBURBAN', 'NEW DELHI', 'DELHI',
    'CHENNAI', 'BANGALORE', 'BENGALURU', 'BANGLORE', 'HYDERABAD',
    'KOLKATA', 'PUNE', 'JAIPUR', 'AHMEDABAD', 'AHEMDABAD', 'SURAT',
    'RAJKOT', 'LUCKNOW', 'KOCHI', 'KERALA', 'THRISSUR', 'COIMBATORE',
    'JODHPUR', 'NAGPUR', 'INDORE', 'RAIPUR', 'CHANDIGARH', 'BHOPAL',
    'AMRITSAR', 'UDAIPUR', 'VADODARA', 'THANE', 'BELGAUM', 'GUWAHATI',
    'MANGALORE', 'JALNA', 'BHIWANDI', 'HOWRAH', 'PALGHAR', 'SANGLI',
    'DHENKANAL', 'MUZAFFARNAGAR', 'SARAN', 'NELLORE', 'SALEM',
    'TRICHY', 'VELLORE', 'VIJAYAWADA', 'VISAKHAPATNAM', 'NASHIK',
    'MUZAFFARPUR',
}

CITY_NORMALIZE = {
    'MUMBAI CITY': 'MUMBAI',
    'MUMBAI SUBURBAN': 'MUMBAI',
    'BENGALURU': 'BANGALORE',
    'BANGLORE': 'BANGALORE',
    'AHEMDABAD': 'AHMEDABAD',
    'NEW DELHI': 'DELHI',
}

CITY_TO_STATE = {
    'MUMBAI': 'Maharashtra', 'PUNE': 'Maharashtra', 'NAGPUR': 'Maharashtra',
    'THANE': 'Maharashtra', 'NASHIK': 'Maharashtra', 'PALGHAR': 'Maharashtra',
    'SANGLI': 'Maharashtra', 'BHIWANDI': 'Maharashtra', 'JALNA': 'Maharashtra',
    'DELHI': 'Delhi', 'CHENNAI': 'Tamil Nadu', 'COIMBATORE': 'Tamil Nadu',
    'SALEM': 'Tamil Nadu', 'TRICHY': 'Tamil Nadu', 'VELLORE': 'Tamil Nadu',
    'BANGALORE': 'Karnataka', 'BELGAUM': 'Karnataka', 'MANGALORE': 'Karnataka',
    'HYDERABAD': 'Telangana', 'KOLKATA': 'West Bengal', 'HOWRAH': 'West Bengal',
    'AHMEDABAD': 'Gujarat', 'SURAT': 'Gujarat', 'RAJKOT': 'Gujarat',
    'VADODARA': 'Gujarat', 'JAIPUR': 'Rajasthan', 'JODHPUR': 'Rajasthan',
    'UDAIPUR': 'Rajasthan', 'LUCKNOW': 'Uttar Pradesh',
    'MUZAFFARNAGAR': 'Uttar Pradesh', 'RAIPUR': 'Chhattisgarh',
    'INDORE': 'Madhya Pradesh', 'BHOPAL': 'Madhya Pradesh',
    'CHANDIGARH': 'Chandigarh', 'AMRITSAR': 'Punjab', 'KOCHI': 'Kerala',
    'KERALA': 'Kerala', 'THRISSUR': 'Kerala', 'GUWAHATI': 'Assam',
    'DHENKANAL': 'Odisha', 'NELLORE': 'Andhra Pradesh',
    'VIJAYAWADA': 'Andhra Pradesh', 'VISAKHAPATNAM': 'Andhra Pradesh',
    'SARAN': 'Bihar',
}


def is_city(text):
    """Check if a text line is a known city."""
    t = text.strip().rstrip(',').upper()
    return t in KNOWN_CITIES


def norm_city(city):
    c = city.strip().rstrip(',').upper()
    return CITY_NORMALIZE.get(c, c)


# ── 1. Parse the PDF ──────────────────────────────────────────────────
def parse_pdf(pdf_path):
    """Extract structured records from the IBJA Platinum Members Directory PDF."""
    import fitz
    doc = fitz.open(pdf_path)

    all_lines = []
    for page in doc:
        text = page.get_text()
        for line in text.split('\n'):
            stripped = line.strip()
            if stripped:
                all_lines.append(stripped)
    doc.close()

    # Skip header
    start = 0
    for i, line in enumerate(all_lines):
        if line == 'CITY' or re.match(r'^1$', line):
            start = i
            break
    if all_lines[start] == 'CITY':
        start += 1

    records = []
    i = start

    while i < len(all_lines):
        line = all_lines[i]

        # Pattern A: standalone number "123"
        m_standalone = re.match(r'^(\d+)$', line)
        # Pattern B: "123 PERSON NAME..."
        m_inline = re.match(r'^(\d{1,4})\s+([A-Z].+)$', line)

        if m_standalone:
            sr_no = int(m_standalone.group(1))
            i += 1
            # Collect subsequent non-number lines
            parts = []
            while i < len(all_lines):
                nxt = all_lines[i]
                if re.match(r'^(\d+)$', nxt) or re.match(r'^(\d{1,4})\s+[A-Z]', nxt):
                    break
                parts.append(nxt.strip())
                i += 1

            person, company, city = _extract_fields(parts)
            records.append({'sr_no': sr_no, 'person_name': person,
                           'company_name': company, 'city': norm_city(city)})

        elif m_inline:
            sr_no = int(m_inline.group(1))
            first_text = m_inline.group(2).strip()
            i += 1

            parts = [first_text]
            while i < len(all_lines):
                nxt = all_lines[i]
                if re.match(r'^(\d+)$', nxt) or re.match(r'^(\d{1,4})\s+[A-Z]', nxt):
                    break
                parts.append(nxt.strip())
                i += 1

            person, company, city = _extract_fields(parts)
            records.append({'sr_no': sr_no, 'person_name': person,
                           'company_name': company, 'city': norm_city(city)})
        else:
            i += 1

    return records


def _extract_fields(parts):
    """From a list of text parts, extract (person_name, company_name, city)."""
    if not parts:
        return '', '', ''

    # Find city (check from end)
    city_idx = -1
    for ci in range(len(parts) - 1, -1, -1):
        if is_city(parts[ci]):
            city_idx = ci
            break

    if city_idx >= 0:
        city = parts[city_idx]
        remaining = parts[:city_idx]
    else:
        city = ''
        remaining = parts[:]

    if len(remaining) == 0:
        return '', '', city
    elif len(remaining) == 1:
        return remaining[0], '', city
    elif len(remaining) == 2:
        return remaining[0], remaining[1], city
    else:
        # More than 2 remaining: first is person, rest is company
        return remaining[0], ' '.join(remaining[1:]), city


# ── 2. Load CSV sources ───────────────────────────────────────────────
def load_platinum_csv(path):
    records = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append({
                'sr_no': int(row['sr_no']),
                'person_name': row['person_name'].strip(),
                'company_name': row['company_name'].strip(),
                'city': norm_city(row['city'].strip()),
                'category': row['category'].strip(),
            })
    return records


def load_dealers_csv(path):
    records = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append({
                'dealer_name': row['dealer_name'].strip(),
                'city': norm_city(row['city'].strip()),
                'url': row.get('url', '').strip(),
                'status': row.get('status', '').strip(),
                'notes': row.get('notes', '').strip(),
            })
    return records


def load_db_metadata(path):
    records = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                emails = json.loads(row.get('emails', '[]') or '[]')
            except:
                emails = []
            try:
                phones = json.loads(row.get('phones', '[]') or '[]')
            except:
                phones = []
            records.append({
                'dealer_id': row['dealer_id'].strip(),
                'name': row['name'].strip(),
                'website': row.get('website', '').strip(),
                'city': row.get('city', '').strip(),
                'state': row.get('state', '').strip(),
                'address': row.get('address', '').strip(),
                'emails': emails,
                'phones': phones,
                'whatsapp': row.get('whatsapp', '').strip(),
            })
    return records


# ── 3. Normalize for matching ─────────────────────────────────────────
def normalize_name(name):
    if not name:
        return ""
    n = name.upper().strip()
    for suffix in [' PVT. LTD.', ' PVT LTD', ' PRIVATE LIMITED', ' LIMITED', ' LTD.',
                   ' LTD', ' LLP', ' (I)', ' CO.', '& CO', ' HUF', 'M/S.', 'M/S ']:
        n = n.replace(suffix, '')
    n = re.sub(r'[^A-Z0-9 ]', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def compact_name(name):
    """Remove ALL spaces and special chars for fuzzy matching."""
    return re.sub(r'[^A-Z0-9]', '', name.upper())


# ── 4. Merge ──────────────────────────────────────────────────────────
def build_master(pdf_records, csv_records, dealer_records, db_records):
    # Build lookups
    db_by_id = {r['dealer_id']: r for r in db_records}
    db_by_name = {}
    db_by_compact = {}
    for r in db_records:
        key = normalize_name(r['name'])
        if key:
            db_by_name[key] = r
        ck = compact_name(r['name'])
        if ck:
            db_by_compact[ck] = r
        # Also index by dealer_id uppercased (since dealer_ids match company slugs)
        db_by_compact[r['dealer_id'].upper()] = r

    dealer_by_name = {}
    dealer_by_compact = {}
    dealer_by_id = {}
    dealer_by_url = {}
    for r in dealer_records:
        key = normalize_name(r['dealer_name'])
        if key:
            dealer_by_name[key] = r
        ck = compact_name(r['dealer_name'])
        if ck:
            dealer_by_compact[ck] = r
        # Extract dealer_id from notes
        m = re.search(r'scraper:\s*(\w+)', r.get('notes', ''))
        if m:
            dealer_by_id[m.group(1)] = r
        if r.get('url'):
            dealer_by_url[r['url']] = r

    # Build a bridge: dealer_research clean_name → scraper_id → db record
    # This handles cases where DB names are page titles, not company names
    bridge_name_to_db = {}
    for drec in dealer_records:
        notes = drec.get('notes', '')
        m = re.search(r'scraper:\s*(\w+)', notes)
        if m:
            scraper_id = m.group(1)
            if scraper_id in db_by_id:
                # Map the clean dealer name to the DB record
                key = normalize_name(drec['dealer_name'])
                if key:
                    bridge_name_to_db[key] = db_by_id[scraper_id]
                ck = compact_name(drec['dealer_name'])
                if ck:
                    bridge_name_to_db[ck] = db_by_id[scraper_id]

    csv_by_sr = {r['sr_no']: r for r in csv_records}

    master = []
    seen_norms = set()

    def find_db_match(name):
        """Try multiple strategies to find DB match."""
        if not name:
            return None
        # 1. Exact normalized
        norm = normalize_name(name)
        if norm in db_by_name:
            return db_by_name[norm]
        # 2. Bridge: dealer_research clean name → scraper_id → DB
        if norm in bridge_name_to_db:
            return bridge_name_to_db[norm]
        # 3. Compact (no spaces)
        ck = compact_name(name)
        if ck in db_by_compact:
            return db_by_compact[ck]
        if ck in bridge_name_to_db:
            return bridge_name_to_db[ck]
        # 4. Partial: check if any DB compact name contains this or vice versa
        for db_ck, db_rec in db_by_compact.items():
            if len(ck) >= 6 and len(db_ck) >= 6:
                if ck in db_ck or db_ck in ck:
                    return db_rec
        return None

    def find_dealer_match(name):
        """Try multiple strategies to find dealer research match."""
        if not name:
            return None
        norm = normalize_name(name)
        if norm in dealer_by_name:
            return dealer_by_name[norm]
        ck = compact_name(name)
        if ck in dealer_by_compact:
            return dealer_by_compact[ck]
        for d_ck, d_rec in dealer_by_compact.items():
            if len(ck) >= 6 and len(d_ck) >= 6:
                if ck in d_ck or d_ck in ck:
                    return d_rec
        return None

    # Phase 1: PDF platinum members (master)
    for rec in pdf_records:
        sr_no = rec['sr_no']
        person = rec['person_name']
        company = rec['company_name']
        city = rec['city']

        csv_rec = csv_by_sr.get(sr_no, {})
        category = csv_rec.get('category', '')
        if not category:
            category = 'individual' if not company else 'jeweller'

        norm_co = normalize_name(company)
        norm_per = normalize_name(person)
        firm = company if company else person

        # Try DB match (fuzzy)
        db_match = find_db_match(company)
        if not db_match:
            db_match = find_db_match(person)

        # Try dealer match (fuzzy)
        dealer_match = find_dealer_match(company)

        entry_type = category
        if dealer_match and dealer_match.get('status') in ('onboarded', 'already_onboarded'):
            entry_type = 'both' if category == 'jeweller' else 'dealer'

        row = {
            'firm_name': firm,
            'contact_person': person if company else '',
            'emails': '', 'phone': '', 'whatsapp': '',
            'type': entry_type,
            'address': '', 'city': city,
            'state': CITY_TO_STATE.get(city, ''),
            'website': '', 'source': 'ibja_platinum',
        }

        if db_match:
            _enrich(row, db_match)
        if dealer_match and not row['website']:
            row['website'] = dealer_match.get('url', '')

        norm_key = normalize_name(firm)
        seen_norms.add(norm_key)
        if norm_per:
            seen_norms.add(norm_per)
        master.append(row)

    # Phase 2: Dealers not already included
    for drec in dealer_records:
        if drec['status'] in ('skipped', 'jeweller_only'):
            continue
        norm = normalize_name(drec['dealer_name'])
        compact = compact_name(drec['dealer_name'])
        if norm in seen_norms or compact in {compact_name(n) for n in seen_norms}:
            continue

        city = drec['city']
        db_match = None
        m = re.search(r'scraper:\s*(\w+)', drec.get('notes', ''))
        if m:
            db_match = db_by_id.get(m.group(1))
        if not db_match:
            db_match = find_db_match(drec['dealer_name'])

        row = {
            'firm_name': drec['dealer_name'],
            'contact_person': '', 'emails': '', 'phone': '', 'whatsapp': '',
            'type': 'dealer', 'address': '', 'city': city,
            'state': CITY_TO_STATE.get(city, ''),
            'website': drec.get('url', ''), 'source': 'dealer_research',
        }
        if db_match:
            _enrich(row, db_match)

        seen_norms.add(norm)
        master.append(row)

    # Phase 3: DB records not yet included
    for dbrec in db_records:
        norm = normalize_name(dbrec['name'])
        if norm in seen_norms:
            continue

        city_upper = dbrec['city'].upper() if dbrec['city'] else ''
        row = {
            'firm_name': dbrec['name'],
            'contact_person': '', 'emails': '; '.join(dbrec['emails']) if dbrec['emails'] else '',
            'phone': '; '.join(dbrec['phones']) if dbrec['phones'] else '',
            'whatsapp': dbrec['whatsapp'],
            'type': 'dealer', 'address': dbrec['address'],
            'city': norm_city(city_upper), 'state': dbrec['state'],
            'website': dbrec['website'], 'source': 'db_metadata',
        }
        seen_norms.add(norm)
        master.append(row)

    return master


def _enrich(row, db):
    if db.get('emails'):
        row['emails'] = '; '.join(db['emails'])
    if db.get('phones'):
        row['phone'] = '; '.join(db['phones'])
    if db.get('whatsapp'):
        row['whatsapp'] = db['whatsapp']
    if db.get('address'):
        row['address'] = db['address']
    if db.get('state') and not row.get('state'):
        row['state'] = db['state']
    if db.get('website'):
        row['website'] = db['website']


# ── 5. Main ──────────────────────────────────────────────────────────
def main():
    base = '/Users/kamal/comp-intel'
    pdf_path = '/Users/kamal/Downloads/Pdf_5161_20260304115303466_PLATINUM MEMBERS DIRECTORY.pdf'

    print("Parsing PDF...")
    pdf_records = parse_pdf(pdf_path)
    print(f"  PDF: {len(pdf_records)} records")

    # Sanity: show first/last sr_no
    if pdf_records:
        print(f"  SR range: {pdf_records[0]['sr_no']} to {pdf_records[-1]['sr_no']}")

    print("Loading CSVs...")
    csv_records = load_platinum_csv(os.path.join(base, 'platinum_members_jewellers.csv'))
    print(f"  Platinum CSV: {len(csv_records)} records")
    dealer_records = load_dealers_csv(os.path.join(base, 'bullion_dealers_research.csv'))
    print(f"  Dealer research: {len(dealer_records)} records")

    print("Loading DB metadata...")
    db_records = load_db_metadata('/tmp/dealer_metadata_export.csv')
    print(f"  DB metadata: {len(db_records)} records")

    print("\nMerging...")
    master = build_master(pdf_records, csv_records, dealer_records, db_records)
    print(f"  Total master: {len(master)} records")

    enriched = sum(1 for r in master if r['emails'] or r['phone'])
    print(f"  With contact info: {enriched}")
    needs = sum(1 for r in master if not r['emails'] and not r['phone'])
    print(f"  Missing contact info: {needs}")

    # Type breakdown
    from collections import Counter
    types = Counter(r['type'] for r in master)
    print(f"  Type breakdown: {dict(types)}")

    # Write output
    output_path = os.path.join(base, 'master_contacts.csv')
    fields = ['firm_name', 'contact_person', 'emails', 'phone', 'whatsapp',
              'type', 'address', 'city', 'state', 'website', 'source']
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in master:
            writer.writerow({k: row.get(k, '') for k in fields})
    print(f"\nWritten: {output_path}")

    # Enrichment list
    needs_list = [r for r in master if not r['emails'] and not r['phone'] and r['firm_name']]
    enrich_path = os.path.join(base, 'needs_enrichment.csv')
    efields = ['firm_name', 'contact_person', 'city', 'type', 'website']
    with open(enrich_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=efields)
        writer.writeheader()
        for row in needs_list:
            writer.writerow({k: row.get(k, '') for k in efields})
    print(f"Enrichment needed: {enrich_path} ({len(needs_list)} entries)")


if __name__ == '__main__':
    main()
