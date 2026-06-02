#!/usr/bin/env python3
"""
Scrape metadata (logo, name, city, address, email, phone, whatsapp, website)
from onboarded bullion dealer websites.

Usage:
    python scrape_dealer_metadata.py                    # All dealers
    python scrape_dealer_metadata.py kjbullion ronakgold  # Specific dealers
    python scrape_dealer_metadata.py --output results.json
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from typing import Optional
from pathlib import Path

# ─── HTML metadata extractor ─────────────────────────────────────────────────

class MetadataExtractor(HTMLParser):
    """Extract metadata from HTML by parsing tags, links, and text content."""

    def __init__(self):
        super().__init__()
        self.emails = set()
        self.phones = set()
        self.whatsapp_numbers = set()
        self.logo_urls = []
        self.addresses = []
        self.social_links = {}
        self.page_title = ""

        # State tracking
        self._in_title = False
        self._in_address_section = False
        self._address_depth = 0
        self._address_text_parts = []
        self._current_text = []
        self._all_text_blocks = []
        self._img_tags = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        # Title tag
        if tag == "title":
            self._in_title = True

        # Links — extract mailto, tel, whatsapp
        if tag == "a":
            href = attrs_dict.get("href", "")
            if href.startswith("mailto:"):
                email = href[7:].split("?")[0].strip().lower()
                if "@" in email and "." in email:
                    self.emails.add(email)
            elif href.startswith("tel:"):
                phone = href[4:].strip()
                phone = re.sub(r'[^\d+]', '', phone)
                if len(phone) >= 7:
                    self.phones.add(phone)
            elif "whatsapp.com" in href or "wa.me" in href:
                m = re.search(r'phone=(\d+)', href)
                if m:
                    self.whatsapp_numbers.add(m.group(1))
                else:
                    m = re.search(r'wa\.me/(\d+)', href)
                    if m:
                        self.whatsapp_numbers.add(m.group(1))
            # Social links
            for platform in ["facebook", "instagram", "twitter", "youtube", "linkedin"]:
                if platform in href.lower():
                    self.social_links[platform] = href

        # Images — look for logos
        if tag == "img":
            alt = attrs_dict.get("alt", "").lower()
            src = attrs_dict.get("src", "")
            cls = attrs_dict.get("class", "").lower()
            if src and any(k in alt or k in cls or k in src.lower() for k in ["logo", "brand"]):
                self._img_tags.append({"src": src, "alt": attrs_dict.get("alt", ""), "class": cls})

        # Address sections — look for headings with address keywords
        if tag in ("h2", "h3", "h4", "h5", "p", "div", "span", "address"):
            self._current_text = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

        if tag in ("h2", "h3", "h4", "h5", "p", "div", "span", "address"):
            text = " ".join(self._current_text).strip()
            if text:
                self._all_text_blocks.append(text)
            self._current_text = []

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return

        if self._in_title:
            self.page_title += data

        self._current_text.append(data)

    def get_logo_url(self, base_url: str) -> Optional[str]:
        if self._img_tags:
            src = self._img_tags[0]["src"]
            if src.startswith("http"):
                # Always upgrade to https to avoid mixed-content blocking
                url = src.replace("http://", "https://", 1) if src.startswith("http://") else src
            elif src.startswith("//"):
                url = "https:" + src
            elif src.startswith("/"):
                url = base_url.rstrip("/") + src
            else:
                url = base_url.rstrip("/") + "/" + src
            # Ensure final URL uses https
            return url.replace("http://", "https://", 1) if url.startswith("http://") else url
        return None


# ─── Extraction helpers ──────────────────────────────────────────────────────

def normalize_phone(phone: str) -> str:
    """Normalize an Indian phone number to a consistent format."""
    digits = re.sub(r'[^\d]', '', phone)
    # If starts with 91 and has 12 digits, it's +91XXXXXXXXXX
    if digits.startswith("91") and len(digits) == 12:
        return "+91" + digits[2:]
    # If 10 digits starting with 6-9, it's a mobile number
    if len(digits) == 10 and digits[0] in "6789":
        return "+91" + digits
    # If 10-11 digits starting with 0, it's a landline
    if len(digits) >= 10 and digits[0] == "0":
        return digits
    return digits


def is_valid_indian_phone(digits: str) -> bool:
    """Check if a digit string looks like a valid Indian phone number."""
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    # Mobile: 10 digits starting with 6-9
    if len(digits) == 10 and digits[0] in "6789":
        return True
    # Landline with STD code: starts with 0, 10-11 digits total
    if digits.startswith("0") and 10 <= len(digits) <= 11:
        return True
    return False


def deduplicate_phones(phones: set) -> list:
    """Deduplicate phones where +91XXXXXXXXXX and XXXXXXXXXX are the same."""
    normalized = {}
    for p in phones:
        if not is_valid_indian_phone(p):
            continue
        norm = normalize_phone(p)
        # Use the most informative version (with +91 prefix)
        if norm not in normalized or len(p) > len(normalized[norm]):
            normalized[norm] = p
    # Return the normalized keys (consistent format)
    return sorted(normalized.keys())


def extract_phones_from_text(text: str) -> set:
    """Extract phone numbers from raw text using regex."""
    phones = set()
    # Indian phone patterns: +91-XXXX-XXXXXX, 022-XXXXXXXX, etc.
    patterns = [
        r'\+91[\s-]?\d[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{0,4}',
        r'\b0\d{2,4}[\s-]\d{6,8}\b',
        r'\b\d{10}\b',
        r'\+91\d{10}',
    ]
    for pat in patterns:
        for m in re.finditer(pat, text):
            phone = re.sub(r'[^\d+]', '', m.group())
            if len(phone) >= 10:
                phones.add(phone)
    return phones


def extract_address_from_text(text_blocks: list) -> Optional[str]:
    """Find address from text blocks using heuristics."""
    # FIX: Expanded keyword list with common Indian address terms and punctuation variants
    address_keywords = [
        # Building/location identifiers
        "shop no", "shop number", "door no", "plot no", "flat no",
        "floor", "complex", "building", "bldg", "tower", "arcade",
        # Street/area identifiers
        "road", "street", "nagar", "colony", "market", "bazar", "bazaar",
        "lane", "alley", "gali", "chowk", "cross", "main ",
        # Relative location
        "opposite", "opp.", "opp ", "near ", "behind", "beside", "adjacent",
        "next to",
        # Cities — Tier 1
        "mumbai", "chennai", "delhi", "bangalore", "bengaluru",
        "hyderabad", "kolkata", "ahmedabad", "surat", "jaipur",
        "pune", "lucknow",
        # Cities — Tier 2/3 (commonly missed)
        "rajkot", "jodhpur", "coimbatore", "salem", "trichy",
        "vijayawada", "thane", "indore", "meerut", "ernakulam",
        "howrah", "katni", "visakhapatnam", "secunderabad", "vadodara",
        "bhiwandi", "solapur", "solapur", "panvel", "navi mumbai",
        "vellore", "madurai", "tiruppur", "nagpur", "agra",
        "mangalore", "mysore", "mysuru", "cuttack", "kolhapur",
        "barmer", "palanpur", "bhinmal", "ludhiana", "nellore",
        "tenali", "buldana", "kakinada", "gandhidham", "hubli",
        "belgaum", "belagavi", "ranchi", "patna", "bhopal",
        "jabalpur", "gwalior", "kanpur", "varanasi", "udaipur",
        "bikaner", "kota", "ajmer", "bhilwara", "nashik",
        "aurangabad", "sangli", "satara", "thrissur", "kozhikode",
        "calicut", "thiruvananthapuram", "bellary", "davangere",
        "raipur",
        # States
        "tamil nadu", "maharashtra", "karnataka", "telangana",
        "kerala", "gujarat", "rajasthan", "west bengal",
        "andhra pradesh", "madhya pradesh", "uttar pradesh",
        "odisha", "chhattisgarh", "jharkhand", "punjab", "haryana",
    ]

    pincode_re = re.compile(r'\b\d{6}\b')
    # Patterns that indicate JS/JSON noise, not real addresses
    # Substring noise indicators — fast check to skip obvious JS/CSS blocks
    noise_substrings = ['":"', "{", "}", "\\", "comid",
                        "mcxcontract", "sellrate", "buyrate", "bcontract",
                        "localstorage", "document.", "window.", "console.",
                        "jquery", "webpack", "module.exports", "$(", ".find(",
                        ".css(", ".length",
                        "color:", "#ffffff", "#008000",
                        "buying_rate", "selling_rate",
                        # CSS noise
                        "margin:", "padding:", "position:", "z-index",
                        "display:", "font-size", "text-align",
                        # Google Maps embed noise
                        "!2d", "!3d", "!2m", "!3m",
                        # Mission statement / non-address prose
                        "integrity and to provide", "help protect the planet"]
    # Word-boundary noise — these common words appear in addresses too
    # (e.g., "Ravivar Peth" contains "var ", "Elsehwere" contains "else")
    # so we require them at word boundaries via regex
    noise_word_re = re.compile(
        r'\bvar\s+\w+\s*=|'       # "var x =" (JS variable declaration)
        r'\bfunction\s*\(|'       # "function(" (JS function)
        r'\bif\s*\(|'             # "if(" (JS conditional)
        r'\breturn\s+\w|'         # "return x" (JS return)
        r'\belse\s*\{|'           # "else {" (JS else block)
        r'<script'                # HTML script tag
    )
    candidates = []

    for block in text_blocks:
        lower = block.lower()
        # Skip JS/JSON noise
        if any(n in lower for n in noise_substrings):
            continue
        if noise_word_re.search(lower):
            continue
        # Score the block
        score = 0
        for kw in address_keywords:
            if kw in lower:
                score += 1
        if pincode_re.search(block):
            score += 3
        # FIX: Bonus for comma-separated segments (addresses have many commas)
        comma_count = block.count(',')
        if comma_count >= 3:
            score += 1
        # FIX: Lower threshold from 2 to 1 when text is address-shaped
        # (20-300 chars, mixed case, has commas)
        min_score = 1 if (comma_count >= 2 and 20 < len(block) < 300) else 2
        if 15 < len(block) < 400 and score >= min_score:
            candidates.append((score, block))

    if candidates:
        candidates.sort(key=lambda x: -x[0])
        return candidates[0][1]
    return None


def extract_city_from_address(address: str) -> Optional[str]:
    """Extract city name from address string."""
    # Sorted longest-first so "Navi Mumbai" matches before "Mumbai"
    cities = sorted([
        # Tier 1
        "Mumbai", "Chennai", "Delhi", "New Delhi", "Bangalore", "Bengaluru", "Bangaluru",
        "Hyderabad", "Hyderadad", "Kolkata", "Ahmedabad", "Surat", "Jaipur",
        "Pune", "Lucknow",
        # Tier 2
        "Rajkot", "Jodhpur", "Coimbatore", "Salem", "Trichy",
        "Vijayawada", "Thane", "Navi Mumbai", "Indore", "Meerut",
        "Ernakulam", "Howrah", "Katni", "Visakhapatnam", "Vishakhapatnam",
        "Secunderabad", "Vadodara", "Vellore", "Nagpur", "Agra",
        "Mangalore", "Mangaluru", "Madurai", "Raipur",
        # Tier 3 — commonly found in bullion dealer addresses
        "Ludhiana", "Nellore", "Mysuru", "Mysore", "Cuttack",
        "Kolhapur", "Solapur", "Barmer", "Palanpur", "Bhinmal",
        "Tenali", "Buldana", "Kalbadevi", "Kakinada", "Gandhidham",
        "Tiruppur", "Hubli", "Belgaum", "Belagavi", "Ranchi",
        "Patna", "Bhopal", "Jabalpur", "Gwalior", "Kanpur",
        "Varanasi", "Allahabad", "Prayagraj", "Udaipur",
        "Bikaner", "Kota", "Ajmer", "Bhilwara",
        "Nashik", "Aurangabad", "Sangli", "Satara",
        "Thrissur", "Kozhikode", "Calicut", "Thiruvananthapuram",
        "Vijayanagar", "Bellary", "Ballari", "Davangere",
        "Jubilee Hills",
        # Tier 4 — smaller towns where bullion dealers operate
        "Bhiwandi", "Panvel", "Vasai", "Virar", "Dombivli", "Kalyan",
        "Palghar", "Bhayander", "Mira Road",
        "Tirunelveli", "Erode", "Karur", "Thanjavur", "Dindigul",
        "Kumbakonam", "Sivakasi", "Rajapalayam",
        "Raichur", "Bidar", "Gulbarga", "Kalaburagi", "Shimoga",
        "Nanded", "Latur", "Jalgaon", "Dhule", "Amravati",
        "Akola", "Yavatmal", "Chandrapur", "Wardha",
        "Guntur", "Kurnool", "Rajahmundry", "Eluru", "Ongole",
        "Tirupati", "Anantapur", "Kadapa",
        "Hisar", "Karnal", "Panipat", "Rohtak", "Sonipat",
        "Amritsar", "Jalandhar", "Patiala", "Bathinda",
        "Dehradun", "Haridwar", "Roorkee",
        "Bhubaneswar", "Berhampur", "Sambalpur",
        "Siliguri", "Asansol", "Durgapur", "Burdwan",
        "Jamshedpur", "Dhanbad", "Bokaro",
        "Guwahati", "Dibrugarh",
        "Jammu", "Srinagar",
        "Goa", "Panaji", "Margao",
    ], key=len, reverse=True)
    for city in cities:
        if city.lower() in address.lower():
            return city
    return None


def extract_state_from_address(address: str) -> Optional[str]:
    """Extract state name from address string.

    Strategy: infer from city FIRST (more reliable than raw state name matching,
    because "Punjab National Bank" contains "Punjab" but doesn't mean the
    address is in Punjab).
    """
    # Infer state from city FIRST — more reliable than raw state name matching
    # ("Punjab National Bank" in Pune ≠ state Punjab)
    city_to_state = {
        # Maharashtra
        "mumbai": "Maharashtra", "pune": "Maharashtra", "thane": "Maharashtra",
        "navi mumbai": "Maharashtra", "nagpur": "Maharashtra", "kolhapur": "Maharashtra",
        "solapur": "Maharashtra", "nashik": "Maharashtra", "aurangabad": "Maharashtra",
        "sangli": "Maharashtra", "satara": "Maharashtra", "kalbadevi": "Maharashtra",
        "bhiwandi": "Maharashtra", "panvel": "Maharashtra", "vasai": "Maharashtra",
        "virar": "Maharashtra", "dombivli": "Maharashtra", "kalyan": "Maharashtra",
        "palghar": "Maharashtra", "bhayander": "Maharashtra", "mira road": "Maharashtra",
        "nanded": "Maharashtra", "latur": "Maharashtra", "jalgaon": "Maharashtra",
        "dhule": "Maharashtra", "amravati": "Maharashtra", "akola": "Maharashtra",
        "yavatmal": "Maharashtra", "chandrapur": "Maharashtra", "wardha": "Maharashtra",
        "buldana": "Maharashtra",
        # Tamil Nadu
        "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "salem": "Tamil Nadu",
        "trichy": "Tamil Nadu", "madurai": "Tamil Nadu", "vellore": "Tamil Nadu",
        "tiruppur": "Tamil Nadu", "tirunelveli": "Tamil Nadu", "erode": "Tamil Nadu",
        "karur": "Tamil Nadu", "thanjavur": "Tamil Nadu", "dindigul": "Tamil Nadu",
        "kumbakonam": "Tamil Nadu", "sivakasi": "Tamil Nadu", "rajapalayam": "Tamil Nadu",
        # Karnataka
        "bangalore": "Karnataka", "bengaluru": "Karnataka", "bangaluru": "Karnataka",
        "mangalore": "Karnataka", "mangaluru": "Karnataka",
        "mysuru": "Karnataka", "mysore": "Karnataka",
        "hubli": "Karnataka", "belgaum": "Karnataka", "belagavi": "Karnataka",
        "bellary": "Karnataka", "ballari": "Karnataka", "davangere": "Karnataka",
        "raichur": "Karnataka", "bidar": "Karnataka",
        "gulbarga": "Karnataka", "kalaburagi": "Karnataka", "shimoga": "Karnataka",
        # Telangana
        "hyderabad": "Telangana", "hyderadad": "Telangana",
        "secunderabad": "Telangana", "jubilee hills": "Telangana",
        # West Bengal
        "kolkata": "West Bengal", "howrah": "West Bengal",
        "siliguri": "West Bengal", "asansol": "West Bengal",
        "durgapur": "West Bengal", "burdwan": "West Bengal",
        # Gujarat
        "ahmedabad": "Gujarat", "surat": "Gujarat", "rajkot": "Gujarat",
        "vadodara": "Gujarat", "palanpur": "Gujarat", "gandhidham": "Gujarat",
        # Rajasthan
        "jaipur": "Rajasthan", "jodhpur": "Rajasthan", "udaipur": "Rajasthan",
        "barmer": "Rajasthan", "bikaner": "Rajasthan", "kota": "Rajasthan",
        "ajmer": "Rajasthan", "bhilwara": "Rajasthan", "bhinmal": "Rajasthan",
        # Delhi
        "delhi": "Delhi", "new delhi": "Delhi",
        # Uttar Pradesh
        "lucknow": "Uttar Pradesh", "meerut": "Uttar Pradesh",
        "agra": "Uttar Pradesh", "kanpur": "Uttar Pradesh",
        "varanasi": "Uttar Pradesh", "allahabad": "Uttar Pradesh",
        "prayagraj": "Uttar Pradesh",
        # Andhra Pradesh
        "vijayawada": "Andhra Pradesh", "visakhapatnam": "Andhra Pradesh",
        "vishakhapatnam": "Andhra Pradesh", "nellore": "Andhra Pradesh",
        "kakinada": "Andhra Pradesh", "tenali": "Andhra Pradesh",
        "guntur": "Andhra Pradesh", "kurnool": "Andhra Pradesh",
        "rajahmundry": "Andhra Pradesh", "eluru": "Andhra Pradesh",
        "ongole": "Andhra Pradesh", "tirupati": "Andhra Pradesh",
        "anantapur": "Andhra Pradesh", "kadapa": "Andhra Pradesh",
        # Kerala
        "ernakulam": "Kerala", "thrissur": "Kerala", "kozhikode": "Kerala",
        "calicut": "Kerala", "thiruvananthapuram": "Kerala",
        # Madhya Pradesh
        "indore": "Madhya Pradesh", "bhopal": "Madhya Pradesh",
        "jabalpur": "Madhya Pradesh", "gwalior": "Madhya Pradesh",
        "katni": "Madhya Pradesh",
        # Others
        "ludhiana": "Punjab", "amritsar": "Punjab", "jalandhar": "Punjab",
        "patiala": "Punjab", "bathinda": "Punjab",
        "cuttack": "Odisha", "bhubaneswar": "Odisha",
        "berhampur": "Odisha", "sambalpur": "Odisha",
        "ranchi": "Jharkhand", "jamshedpur": "Jharkhand",
        "dhanbad": "Jharkhand", "bokaro": "Jharkhand",
        "patna": "Bihar",
        "raipur": "Chhattisgarh",
        "dehradun": "Uttarakhand", "haridwar": "Uttarakhand",
        "roorkee": "Uttarakhand",
        "hisar": "Haryana", "karnal": "Haryana", "panipat": "Haryana",
        "rohtak": "Haryana", "sonipat": "Haryana",
        "guwahati": "Assam", "dibrugarh": "Assam",
        "jammu": "Jammu and Kashmir", "srinagar": "Jammu and Kashmir",
        "goa": "Goa", "panaji": "Goa", "margao": "Goa",
    }
    for city, state in city_to_state.items():
        if city in address.lower():
            return state

    # Fallback: raw state name matching (less reliable — "Punjab National Bank" ≠ Punjab)
    states = [
        "Tamil Nadu", "Maharashtra", "Karnataka", "Telangana",
        "Kerala", "Gujarat", "Rajasthan", "West Bengal",
        "Andhra Pradesh", "Madhya Pradesh", "Uttar Pradesh",
        "Odisha", "Chhattisgarh", "Jharkhand", "Delhi",
        "Haryana", "Punjab", "Goa",
    ]
    for state in states:
        if state.lower() in address.lower():
            return state

    return None


# ─── Main scraper ────────────────────────────────────────────────────────────

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

CONTACT_PATHS = [
    # With .html extension
    "contact-us.html", "ContactUs.html", "Contact_Details.html",
    "contact.html", "Contact.html", "contactus.html",
    "about-us.html", "AboutUs.html", "About_us.html",
    # Without extension (common in modern sites)
    "contact", "contact-us", "contactus",
    "about", "about-us", "aboutus",
    # PHP/ASP variants
    "contact.php", "contact-us.php", "about.php",
    "contact.aspx", "Contact.aspx",
]


def fetch_page(url: str, timeout: int = 10) -> Optional[str]:
    """Fetch a page and return HTML content."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        })
        resp = urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX)
        return resp.read(200_000).decode("utf-8", errors="ignore")
    except Exception:
        return None


def scrape_dealer_metadata(dealer_name: str, website: str) -> dict:
    """Scrape metadata from a dealer website."""
    result = {
        "dealer_id": dealer_name,
        "name": None,
        "website": website,
        "logo_url": None,
        "city": None,
        "state": None,
        "address": None,
        "emails": [],
        "phones": [],
        "whatsapp": None,
        "social_links": {},
    }

    # Normalize URL — always try HTTPS first, fall back to HTTP
    if not website.startswith("http"):
        website = "https://" + website
    base_url = website.rstrip("/")
    if base_url.startswith("http://"):
        # Upgrade to HTTPS first
        https_url = "https://" + base_url[7:]
        homepage_html = fetch_page(https_url)
        if homepage_html:
            base_url = https_url
        else:
            homepage_html = fetch_page(base_url)
    else:
        # Already HTTPS
        homepage_html = fetch_page(base_url)
        if not homepage_html:
            base_url = "http://" + base_url[8:]
            homepage_html = fetch_page(base_url)
    if not homepage_html:
        return result

    result["website"] = base_url

    # Parse homepage
    hp = MetadataExtractor()
    try:
        hp.feed(homepage_html)
    except Exception:
        pass

    # Also try to find phones/emails in raw HTML via regex (catches JS-rendered text)
    raw_emails = set(re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', homepage_html))
    raw_phones = extract_phones_from_text(homepage_html)
    raw_whatsapp = set()
    for m in re.finditer(r'(?:whatsapp\.com/send\?phone=|wa\.me/)(\d+)', homepage_html):
        raw_whatsapp.add(m.group(1))

    # Fetch contact pages
    contact_html = None
    for path in CONTACT_PATHS:
        html = fetch_page(f"{base_url}/{path}")
        if html and len(html) > 500:
            contact_html = html
            break

    cp = MetadataExtractor()
    if contact_html:
        try:
            cp.feed(contact_html)
        except Exception:
            pass
        # Also raw regex on contact page
        raw_emails |= set(re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', contact_html))
        raw_phones |= extract_phones_from_text(contact_html)
        for m in re.finditer(r'(?:whatsapp\.com/send\?phone=|wa\.me/)(\d+)', contact_html):
            raw_whatsapp.add(m.group(1))

    # ─── Assemble results ────────────────────────────────────────────────

    # Name: from page title, clean up common suffixes
    title = hp.page_title.strip()
    if title:
        # Remove common suffixes like "| Live Rates", "- Home", etc.
        title = re.sub(r'\s*[|–-]\s*(Live\s*Rates?|Home|Index|Welcome).*$', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*(Live\s*Rates?|Bullion\s*Live)$', '', title, flags=re.IGNORECASE)
        title = title.strip()
        # If title is too generic ("Home", "Index", "Liverate"), use dealer_id
        generic_titles = {"home", "index", "liverate", "live rate", "contacts", "contact us", ""}
        if title.lower() in generic_titles:
            title = dealer_name
        result["name"] = title

    # Logo
    logo = hp.get_logo_url(base_url) or cp.get_logo_url(base_url)
    result["logo_url"] = logo

    # Emails — merge parsed + regex, filter noise
    all_emails = hp.emails | cp.emails | raw_emails
    noise_patterns = ["example.com", "sentry", "wixpress", "your-email", "email@",
                      "test@", "noreply", "no-reply", "firebaseio", "gstatic",
                      "googleapis", "cloudflare", "schema.org", "w3.org",
                      "jquery", ".js", ".css", ".png", ".jpg", "webpack"]
    filtered_emails = sorted(e for e in all_emails
                             if not any(n in e.lower() for n in noise_patterns)
                             and len(e) < 60)
    result["emails"] = filtered_emails

    # Phones — merge parsed + regex, then normalize and dedup
    all_phones = hp.phones | cp.phones | raw_phones
    result["phones"] = deduplicate_phones(all_phones)

    # WhatsApp
    all_wa = hp.whatsapp_numbers | cp.whatsapp_numbers | raw_whatsapp
    if all_wa:
        result["whatsapp"] = sorted(all_wa)[0]

    # Address — prefer contact page, fallback to homepage
    all_text = cp._all_text_blocks + hp._all_text_blocks
    address = extract_address_from_text(all_text)
    if not address:
        # Try raw regex on HTML for address-like patterns
        combined = (contact_html or "") + homepage_html
        # Look for text near pincode, but not inside JS/JSON
        # Exclude hex color codes like #008000 by requiring pincode not preceded by #
        for m in re.finditer(r'([^<>"{]{20,200}(?<!#)\b\d{6}\b[^<>"{]{0,50})', combined):
            addr_text = re.sub(r'<[^>]+>', ' ', m.group(1)).strip()
            addr_text = re.sub(r'\s+', ' ', addr_text)
            addr_lower = addr_text.lower()
            # Reject if it looks like JS/JSON/CSS
            js_noise = ['":"', "var ", "function", "$(", ".find(", ".css(",
                        "if(", "if (", "else", "return ", "buying_rate",
                        "selling_rate", "#ffffff", "#008000", "script"]
            if len(addr_text) > 20 and not any(n in addr_lower for n in js_noise):
                address = addr_text
                break

    # Clean up address whitespace
    if address:
        address = re.sub(r'[\r\n\t]+', ' ', address)
        address = re.sub(r'\s{2,}', ' ', address).strip()
    result["address"] = address

    # FIX: Try extracting city from Google Maps embed URL when address extraction fails
    if not address or not extract_city_from_address(address or ""):
        combined_html = (contact_html or "") + homepage_html
        # Google Maps embed: look for "place/CityName" or "q=CityName" patterns
        maps_matches = re.findall(
            r'google\.com/maps[^"]*(?:place/|q=)([^&"/@]+)', combined_html
        )
        for maps_text in maps_matches:
            maps_text = urllib.parse.unquote(maps_text).replace('+', ' ')
            city = extract_city_from_address(maps_text)
            if city:
                if not result.get("city"):
                    result["city"] = city
                if not address:
                    result["address"] = maps_text
                break

    # City and State
    if address and not result.get("city"):
        result["city"] = extract_city_from_address(address)
    if address and not result.get("state"):
        result["state"] = extract_state_from_address(address)
    # Infer state from city if we have city but no state
    if result.get("city") and not result.get("state"):
        result["state"] = extract_state_from_address(result["city"])

    # Social links
    result["social_links"] = {**hp.social_links, **cp.social_links}

    return result


def get_dealer_websites() -> dict:
    """Build dealer name -> website URL mapping from scraper configs and CSV."""
    websites = {}

    # From VOTS config
    script_dir = Path(__file__).parent.parent
    vots_file = script_dir / "scrapers" / "vots" / "vots_scraper.py"
    if vots_file.exists():
        content = vots_file.read_text()
        # Extract origin URLs from VOTS_DEALERS
        for m in re.finditer(r'"(\w+)":\s*\{[^}]*"origin":\s*"([^"]+)"', content):
            name, origin = m.group(1), m.group(2)
            websites[name] = origin

    # From Socket.IO config
    socketio_file = script_dir / "scrapers" / "socketio" / "socketio_scraper.py"
    if socketio_file.exists():
        content = socketio_file.read_text()
        for m in re.finditer(r'"(\w+)":\s*\{[^}]*"origin":\s*"([^"]+)"', content):
            name, origin = m.group(1), m.group(2)
            websites[name] = origin

    # From WinBull config
    winbull_file = script_dir / "scrapers" / "winbull" / "winbull_scraper.py"
    if winbull_file.exists():
        content = winbull_file.read_text()
        for m in re.finditer(r'"(\w+)":\s*\{[^}]*"origin":\s*"([^"]+)"', content):
            name, origin = m.group(1), m.group(2)
            websites[name] = origin

    # Hardcoded custom scrapers
    websites.setdefault("csvbullion", "https://csvbullion.com")
    websites.setdefault("rsbl", "https://www.rsbl.in")
    websites.setdefault("vasantbullion", "https://vasantbullion.com")

    return websites


# ─── Playwright fallback ──────────────────────────────────────────────────────

def needs_playwright(result: dict) -> bool:
    """Check if a result has poor metadata that might improve with JS rendering."""
    has_addr = bool(result.get("address"))
    has_phones = len(result.get("phones", [])) > 0
    has_logo = bool(result.get("logo_url"))
    # If missing address AND phones, likely a JS-rendered site
    return not has_addr and not has_phones


def scrape_with_playwright(dealer_name: str, website: str, existing: dict) -> dict:
    """Scrape a dealer site using Playwright for JS-rendered content."""
    from playwright.sync_api import sync_playwright

    result = dict(existing)  # Start with existing urllib results

    if not website.startswith("http"):
        website = "http://" + website
    base_url = website.rstrip("/")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_default_timeout(15000)

            # Navigate and wait for network to settle
            try:
                page.goto(base_url, wait_until="networkidle", timeout=20000)
            except Exception:
                try:
                    page.goto(base_url, wait_until="load", timeout=15000)
                except Exception:
                    return result

            # Give JS a moment to render
            page.wait_for_timeout(2000)

            # Extract all rendered text, links, images via JS
            data = page.evaluate("""() => {
                const data = {
                    title: document.title || '',
                    emails: [],
                    phones: [],
                    whatsapp: [],
                    logos: [],
                    texts: [],
                    socialLinks: {},
                };

                // All links
                document.querySelectorAll('a[href]').forEach(a => {
                    const href = a.href || '';
                    if (href.startsWith('mailto:')) {
                        const email = href.slice(7).split('?')[0].trim().toLowerCase();
                        if (email.includes('@') && email.includes('.')) data.emails.push(email);
                    } else if (href.startsWith('tel:')) {
                        data.phones.push(href.slice(4).replace(/[^\\d+]/g, ''));
                    } else if (href.includes('whatsapp.com') || href.includes('wa.me')) {
                        const m = href.match(/phone=(\\d+)/) || href.match(/wa\\.me\\/(\\d+)/);
                        if (m) data.whatsapp.push(m[1]);
                    }
                    ['facebook','instagram','twitter','youtube','linkedin'].forEach(p => {
                        if (href.toLowerCase().includes(p)) data.socialLinks[p] = href;
                    });
                });

                // All images — look for logos
                document.querySelectorAll('img').forEach(img => {
                    const src = img.src || '';
                    const alt = (img.alt || '').toLowerCase();
                    const cls = (img.className || '').toLowerCase();
                    if (src && (alt.includes('logo') || cls.includes('logo') ||
                                src.toLowerCase().includes('logo'))) {
                        data.logos.push(src);
                    }
                });

                // All visible text blocks (for address extraction)
                const walker = document.createTreeWalker(
                    document.body, NodeFilter.SHOW_TEXT, null, false
                );
                let node;
                const seenTexts = new Set();
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    if (text.length > 15 && text.length < 500 && !seenTexts.has(text)) {
                        seenTexts.add(text);
                        // Skip script/style content
                        const parent = node.parentElement;
                        if (parent && !['SCRIPT','STYLE','NOSCRIPT'].includes(parent.tagName)) {
                            data.texts.push(text);
                        }
                    }
                }

                // Also extract phone-like patterns from full body text
                const bodyText = document.body.innerText || '';
                const phoneMatches = bodyText.match(/(?:\\+91[\\s-]?)?\\d[\\s-]?\\d{3,4}[\\s-]?\\d{3,4}[\\s-]?\\d{0,4}/g) || [];
                phoneMatches.forEach(p => {
                    const clean = p.replace(/[^\\d+]/g, '');
                    if (clean.length >= 10) data.phones.push(clean);
                });

                // Extract emails from body text too
                const emailMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];
                emailMatches.forEach(e => data.emails.push(e.toLowerCase()));

                return data;
            }""")

            # Also try contact page
            contact_data = None
            for path in ["contact.html", "contact-us.html", "ContactUs.html",
                          "Contact_Details.html", "about.html"]:
                try:
                    page.goto(f"{base_url}/{path}", wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(1500)
                    contact_data = page.evaluate("""() => {
                        const d = { texts: [], phones: [], emails: [] };
                        const bodyText = document.body.innerText || '';
                        const pm = bodyText.match(/(?:\\+91[\\s-]?)?\\d[\\s-]?\\d{3,4}[\\s-]?\\d{3,4}[\\s-]?\\d{0,4}/g) || [];
                        pm.forEach(p => { const c = p.replace(/[^\\d+]/g, ''); if (c.length >= 10) d.phones.push(c); });
                        const em = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];
                        em.forEach(e => d.emails.push(e.toLowerCase()));
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                        let node;
                        while (node = walker.nextNode()) {
                            const t = node.textContent.trim();
                            const par = node.parentElement;
                            if (t.length > 15 && t.length < 500 && par && !['SCRIPT','STYLE','NOSCRIPT'].includes(par.tagName))
                                d.texts.push(t);
                        }
                        return d;
                    }""")
                    break
                except Exception:
                    continue

        finally:
            browser.close()

    # ─── Merge Playwright data into result ────────────────────────────
    if not data:
        return result

    # Name
    if not result.get("name") or result["name"] == dealer_name:
        title = data.get("title", "").strip()
        if title:
            title = re.sub(r'\s*[|–-]\s*(Live\s*Rates?|Home|Index|Welcome).*$', '', title, flags=re.IGNORECASE)
            generic = {"home", "index", "liverate", "live rate", "contacts", "contact us", ""}
            if title.lower() not in generic:
                result["name"] = title

    # Logo
    if not result.get("logo_url") and data.get("logos"):
        result["logo_url"] = data["logos"][0]

    # Emails
    noise_patterns = ["example.com", "sentry", "wixpress", "your-email", "email@",
                      "test@", "noreply", "no-reply", "firebaseio", "gstatic",
                      "googleapis", "cloudflare", "schema.org", "w3.org",
                      "jquery", ".js", ".css", ".png", ".jpg", "webpack"]
    all_emails = set(result.get("emails", []))
    all_emails |= set(data.get("emails", []))
    if contact_data:
        all_emails |= set(contact_data.get("emails", []))
    result["emails"] = sorted(e for e in all_emails
                              if not any(n in e.lower() for n in noise_patterns)
                              and len(e) < 60)

    # Phones
    all_phones = set(result.get("phones", []))
    all_phones |= set(data.get("phones", []))
    if contact_data:
        all_phones |= set(contact_data.get("phones", []))
    result["phones"] = deduplicate_phones(all_phones)

    # WhatsApp
    if not result.get("whatsapp") and data.get("whatsapp"):
        result["whatsapp"] = sorted(data["whatsapp"])[0]

    # Address
    if not result.get("address"):
        all_texts = data.get("texts", [])
        if contact_data:
            all_texts = contact_data.get("texts", []) + all_texts
        address = extract_address_from_text(all_texts)
        if address:
            address = re.sub(r'[\r\n\t]+', ' ', address)
            address = re.sub(r'\s{2,}', ' ', address).strip()
            result["address"] = address

    # City & State
    if result.get("address") and not result.get("city"):
        result["city"] = extract_city_from_address(result["address"])
    if result.get("address") and not result.get("state"):
        result["state"] = extract_state_from_address(result["address"])

    # Social links
    if data.get("socialLinks"):
        result["social_links"] = {**result.get("social_links", {}), **data["socialLinks"]}

    return result


def run_playwright_fallback(results: list) -> list:
    """Run Playwright on dealers with poor urllib results."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  Playwright not installed, skipping fallback", file=sys.stderr)
        return results

    # Find dealers that need Playwright
    needs_pw = [(i, r) for i, r in enumerate(results)
                if not r.get("error") and needs_playwright(r)]

    if not needs_pw:
        print("  No dealers need Playwright fallback", file=sys.stderr)
        return results

    print(f"\nPlaywright fallback for {len(needs_pw)} dealers...", file=sys.stderr)

    for idx, (i, r) in enumerate(needs_pw):
        dealer_id = r["dealer_id"]
        website = r.get("website", "")
        try:
            improved = scrape_with_playwright(dealer_id, website, r)
            results[i] = improved
            email_count = len(improved.get("emails", []))
            phone_count = len(improved.get("phones", []))
            has_addr = "addr" if improved.get("address") else "no-addr"
            has_wa = "wa" if improved.get("whatsapp") else "no-wa"
            improved_fields = []
            if improved.get("address") and not r.get("address"):
                improved_fields.append("addr")
            if len(improved.get("phones", [])) > len(r.get("phones", [])):
                improved_fields.append("phones")
            if len(improved.get("emails", [])) > len(r.get("emails", [])):
                improved_fields.append("emails")
            if improved.get("logo_url") and not r.get("logo_url"):
                improved_fields.append("logo")
            delta = f" +{','.join(improved_fields)}" if improved_fields else " (no change)"
            print(f"  [{idx+1}/{len(needs_pw)}] {dealer_id}: "
                  f"{email_count} emails, {phone_count} phones, {has_addr}, {has_wa}{delta}",
                  file=sys.stderr)
        except Exception as e:
            print(f"  [{idx+1}/{len(needs_pw)}] {dealer_id}: FAIL {e}", file=sys.stderr)

    return results


# ─── Storage ──────────────────────────────────────────────────────────────────

def store_to_postgres(results: list) -> int:
    """Store dealer metadata in PostgreSQL using SQLAlchemy (async)."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5454/bullion_intel"
    )
    # Convert to async driver URL
    if "postgresql://" in db_url:
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")

    async def _store():
        engine = create_async_engine(db_url)
        try:
            async with engine.begin() as conn:
                # Create table if not exists
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS dealer_metadata (
                        dealer_id VARCHAR(100) PRIMARY KEY,
                        name VARCHAR(200),
                        website VARCHAR(500),
                        logo_url TEXT,
                        city VARCHAR(100),
                        state VARCHAR(100),
                        address TEXT,
                        emails JSONB NOT NULL DEFAULT CAST('[]' AS jsonb),
                        phones JSONB NOT NULL DEFAULT CAST('[]' AS jsonb),
                        whatsapp VARCHAR(20),
                        social_links JSONB NOT NULL DEFAULT CAST('{}' AS jsonb),
                        scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                """))

                upserted = 0
                for r in results:
                    if r.get("error"):
                        continue

                    emails_j = json.dumps(r.get("emails", []))
                    phones_j = json.dumps(r.get("phones", []))
                    social_j = json.dumps(r.get("social_links", {}))

                    await conn.execute(text("""
                        INSERT INTO dealer_metadata
                            (dealer_id, name, website, logo_url, city, state, address,
                             emails, phones, whatsapp, social_links, scraped_at, updated_at)
                        VALUES
                            (:dealer_id, :name, :website, :logo_url, :city, :state, :address,
                             CAST(:emails AS jsonb), CAST(:phones AS jsonb), :whatsapp,
                             CAST(:social_links AS jsonb), NOW(), NOW())
                        ON CONFLICT (dealer_id) DO UPDATE SET
                            name = COALESCE(EXCLUDED.name, dealer_metadata.name),
                            website = COALESCE(EXCLUDED.website, dealer_metadata.website),
                            logo_url = COALESCE(EXCLUDED.logo_url, dealer_metadata.logo_url),
                            city = COALESCE(EXCLUDED.city, dealer_metadata.city),
                            state = COALESCE(EXCLUDED.state, dealer_metadata.state),
                            address = COALESCE(EXCLUDED.address, dealer_metadata.address),
                            emails = CASE WHEN jsonb_array_length(CAST(EXCLUDED.emails AS jsonb)) > 0
                                     THEN EXCLUDED.emails ELSE dealer_metadata.emails END,
                            phones = CASE WHEN jsonb_array_length(CAST(EXCLUDED.phones AS jsonb)) > 0
                                     THEN EXCLUDED.phones ELSE dealer_metadata.phones END,
                            whatsapp = COALESCE(EXCLUDED.whatsapp, dealer_metadata.whatsapp),
                            social_links = CASE WHEN CAST(EXCLUDED.social_links AS jsonb) != CAST('{}' AS jsonb)
                                           THEN EXCLUDED.social_links ELSE dealer_metadata.social_links END,
                            scraped_at = NOW(),
                            updated_at = NOW();
                    """), {
                        "dealer_id": r["dealer_id"],
                        "name": r.get("name"),
                        "website": r.get("website"),
                        "logo_url": r.get("logo_url"),
                        "city": r.get("city"),
                        "state": r.get("state"),
                        "address": r.get("address"),
                        "emails": emails_j,
                        "phones": phones_j,
                        "whatsapp": r.get("whatsapp"),
                        "social_links": social_j,
                    })
                    upserted += 1

            return upserted
        finally:
            await engine.dispose()

    return asyncio.run(_store())


def store_to_redis(results: list) -> int:
    """Cache dealer metadata in Redis hashes for fast API access."""
    import redis as redis_lib

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6666/0")
    r = redis_lib.from_url(redis_url, decode_responses=True)

    stored = 0
    dealer_ids = []
    pipe = r.pipeline()

    for result in results:
        if result.get("error"):
            continue
        did = result["dealer_id"]
        key = f"dealer:metadata:{did}"
        fields = {
            "dealer_id": did,
            "name": result.get("name") or "",
            "website": result.get("website") or "",
            "logo_url": result.get("logo_url") or "",
            "city": result.get("city") or "",
            "state": result.get("state") or "",
            "address": result.get("address") or "",
            "emails": json.dumps(result.get("emails", [])),
            "phones": json.dumps(result.get("phones", [])),
            "whatsapp": result.get("whatsapp") or "",
            "social_links": json.dumps(result.get("social_links", {})),
        }
        pipe.hset(key, mapping=fields)
        dealer_ids.append(did)
        stored += 1

    if dealer_ids:
        pipe.sadd("dealer:metadata:all", *dealer_ids)

    pipe.execute()
    r.close()

    return stored


def store_results(results: list):
    """Store results in both PostgreSQL and Redis."""
    pg_count = 0
    redis_count = 0

    try:
        pg_count = store_to_postgres(results)
        print(f"  PostgreSQL: upserted {pg_count} dealers", file=sys.stderr)
    except Exception as e:
        print(f"  PostgreSQL error: {e}", file=sys.stderr)

    try:
        redis_count = store_to_redis(results)
        print(f"  Redis: cached {redis_count} dealers", file=sys.stderr)
    except Exception as e:
        print(f"  Redis error: {e}", file=sys.stderr)

    return pg_count, redis_count


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape dealer metadata")
    parser.add_argument("dealers", nargs="*", help="Specific dealer names to scrape (default: all)")
    parser.add_argument("--output", "-o", default=None, help="Output JSON file path")
    parser.add_argument("--workers", "-w", type=int, default=10, help="Concurrent workers")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    parser.add_argument("--store", action="store_true", help="Store results in PostgreSQL and Redis")
    parser.add_argument("--import-json", type=str, default=None,
                        help="Import pre-scraped JSON file (skip scraping, just store)")
    parser.add_argument("--no-print", action="store_true", help="Suppress JSON output (use with --store)")
    parser.add_argument("--no-playwright", action="store_true",
                        help="Skip Playwright fallback (faster, but misses JS-rendered sites)")
    # Keep --playwright for backwards compat (now a no-op since it's default)
    parser.add_argument("--playwright", action="store_true",
                        help=argparse.SUPPRESS)
    args = parser.parse_args()

    # Import mode: load pre-scraped JSON and store it
    if args.import_json:
        results = json.loads(Path(args.import_json).read_text())
        print(f"Imported {len(results)} results from {args.import_json}", file=sys.stderr)
        print("\nStoring results...", file=sys.stderr)
        store_results(results)
        return

    all_websites = get_dealer_websites()

    if args.dealers:
        websites = {k: v for k, v in all_websites.items() if k in args.dealers}
        missing = set(args.dealers) - set(websites.keys())
        if missing:
            print(f"Warning: Unknown dealers: {', '.join(missing)}", file=sys.stderr)
    else:
        websites = all_websites

    print(f"Scraping metadata for {len(websites)} dealers...", file=sys.stderr)

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(scrape_dealer_metadata, name, url): name
            for name, url in websites.items()
        }
        done = 0
        for future in as_completed(futures):
            name = futures[future]
            done += 1
            try:
                result = future.result()
                results.append(result)
                status = "OK" if result.get("name") else "PARTIAL"
                email_count = len(result.get("emails", []))
                phone_count = len(result.get("phones", []))
                has_addr = "addr" if result.get("address") else "no-addr"
                has_wa = "wa" if result.get("whatsapp") else "no-wa"
                print(f"  [{done}/{len(websites)}] {status} {name}: "
                      f"{email_count} emails, {phone_count} phones, {has_addr}, {has_wa}",
                      file=sys.stderr)
            except Exception as e:
                print(f"  [{done}/{len(websites)}] FAIL {name}: {e}", file=sys.stderr)
                results.append({"dealer_id": name, "error": str(e)})

    # Sort by dealer_id
    results.sort(key=lambda x: x.get("dealer_id", ""))

    # Playwright fallback for JS-rendered sites (default ON)
    if not args.no_playwright:
        results = run_playwright_fallback(results)
        results.sort(key=lambda x: x.get("dealer_id", ""))

    # Store to PostgreSQL + Redis
    if args.store:
        print("\nStoring results...", file=sys.stderr)
        store_results(results)

    # Output JSON
    if not args.no_print:
        output = json.dumps(results, indent=2 if args.pretty else None, ensure_ascii=False)
        if args.output:
            Path(args.output).write_text(output)
            print(f"\nSaved {len(results)} results to {args.output}", file=sys.stderr)
        else:
            print(output)


if __name__ == "__main__":
    main()
