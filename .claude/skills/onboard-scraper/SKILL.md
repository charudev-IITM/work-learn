---
name: onboard-scraper
description: Auto-detect dealer API type, generate scraper, register, test, and deploy
user_invocable: true
---

# Scraper Onboarding Skill

You are onboarding a new bullion dealer scraper. The user has provided a dealer website URL.
Follow these steps precisely.

## Step 1: Extract Dealer Info

- Extract the domain from the URL (e.g., `golddealer.com` from `https://golddealer.com/live-rates`)
- Derive a short name for the scraper (e.g., `golddealer`) — lowercase, no special characters
- Do NOT ask the user to confirm the name — just proceed

## Step 2: Probe for API Type

Run these probes using curl to detect the dealer's API type. Run probes in parallel where possible.

### Probe A: VOTS Broadcast Streaming API
Check common VOTS subdomains, ports, and **alternate TLDs** (some dealers use `.in` bcast with `.com` origin):
```bash
# Extract base name and TLD variations
BASE="${SHORT_NAME}"
TLD="${DOMAIN##*.}"  # e.g., "com" from "dealer.com"
DOMAIN_NO_TLD="${DOMAIN%.*}"  # e.g., "dealer" from "dealer.com"
ALT_TLDS=("com" "in" "net" "co.in")

for sub in bcast adminapi statewisebcast; do
  # Try the exact domain first
  for port in 7768 7767; do
    curl -sk --max-time 5 "https://${sub}.${DOMAIN}:${port}/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/${SHORT_NAME}" 2>/dev/null | head -c 200
  done
  curl -sk --max-time 5 "https://${sub}.${DOMAIN}/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/${SHORT_NAME}" 2>/dev/null | head -c 200
  # Try alternate TLDs (e.g., bcast.smdbullion.in for smdbullion.com)
  for alt in "${ALT_TLDS[@]}"; do
    [[ "$alt" == "$TLD" ]] && continue
    curl -sk --max-time 5 "https://${sub}.${DOMAIN_NO_TLD}.${alt}:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/${SHORT_NAME}" 2>/dev/null | head -c 200
  done
done
# Also try HTTP (port 7767 is common for HTTP-only dealers like suswanibullion)
for sub in bcast adminapi statewisebcast; do
  curl -sk --max-time 5 "http://${sub}.${DOMAIN}:7767/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/${SHORT_NAME}" 2>/dev/null | head -c 200
done
```
**Detection**: If response contains tab-delimited data with rate numbers, it's a VOTS dealer.
**Cross-TLD note**: If bcast is on a different TLD than the origin (e.g., `bcast.smdbullion.in` for `smdbullion.com`), add `"sec_fetch_site": "cross-site"` to the config.

### Probe B: Socket.IO (CSV Bullion / Vasant Bullion type)
```bash
# Try both HTTPS and HTTP on common Socket.IO ports — on the domain itself
for proto in https http; do
  for port in 10001 10000; do
    curl -sk --max-time 5 "${proto}://${DOMAIN}:${port}/socket.io/?EIO=4&transport=polling" 2>/dev/null | head -c 200
  done
done
```
**Detection**: Response starts with `0{"sid":"` — note the `0` prefix before JSON.
**Important**: The Socket.IO server is often NOT on the dealer's domain. It may be on a separate infrastructure domain (e.g., `starlinetechno.in:10001`, `starlinebuild.in:10001`, `vickygold.co.in:10001`). You MUST extract the actual URL from the dealer's JS files (see Probe C).

### Probe C: Page Source Analysis
```bash
# Check both HTTPS and HTTP for page source
for proto in https http; do
  curl -sk --max-time 10 "${proto}://${DOMAIN}" 2>/dev/null | grep -ioE '(socket\.io|socket\.io\.js|lightstreamer|firebase|websocket|VOTSBroadcast|lmxtrade|winbull)' | sort -u
done
```
**⚠️ Lightstreamer detection**: If `lightstreamer` appears in the page source, this does NOT mean the dealer is unsupported. Some dealers have both Lightstreamer AND VOTS (e.g., karunabullion.com). **Always continue probing** — check for VOTS config variables in the page source (Probe C2) before skipping.

### Probe C2: VOTS Config Extraction (CRITICAL — run for ALL dealers, not just VOTS-detected ones)
Many VOTS dealers embed their bcast configuration directly in the HTML page. This is the **most reliable** way to find the API URL, especially when the bcast domain differs from the dealer domain.
```bash
# Extract VOTS config variables from page source
for proto in https http; do
  curl -sk --max-time 10 "${proto}://${DOMAIN}" 2>/dev/null | grep -ioE "(ipAddressBCast|defaultScripTemplateId|coinsScripTemplateId|step3StreamingPort|miniadminAPI|webPanel)\s*=\s*\"[^\"]*\"" | head -10
done
```
**Key variables**:
- `ipAddressBCast` → The bcast hostname (e.g., `bcast.arhambullion.in`, `ronakgold.noip.us`, or an IP like `192.111.142.146`). Can be a completely different domain from the dealer!
- `defaultScripTemplateId` → The VOTS template ID to use in the API URL
- `step3StreamingPort` → The port (defaults to `7768` for HTTPS, but some dealers use `7666`, `7767`, or others)

**If `ipAddressBCast` is found**: Use it to construct the VOTS API URL directly:
```bash
BCAST_HOST="<ipAddressBCast value>"  # e.g., "bcast.arhambullion.in" or "ronakgold.noip.us"
TEMPLATE_ID="<defaultScripTemplateId value>"  # e.g., "arham" or "goldbarmumbai"
PORT="<step3StreamingPort value>"  # e.g., "7768" or "7666", default 7768

# Construct and test the URL
# If BCAST_HOST already starts with "bcast." or contains no dots, add appropriate prefix
for proto in https http; do
  curl -sk --max-time 5 "${proto}://${BCAST_HOST}:${PORT}/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/${TEMPLATE_ID}" 2>/dev/null | head -c 200
done
```
**Cross-domain note**: If the bcast domain is a different domain from the dealer's origin (e.g., `bcast.arhambullion.in` for `karunabullion.com`, or `ronakgold.noip.us` for `ronakgold.com`), add `"sec_fetch_site": "cross-site"` to the config.

**Dynamic DNS note**: Some dealers use dynamic DNS like `noip.us` or raw IPs for their bcast server. These are valid — use them as-is.

**If socket.io.js detected**: Extract connection details from JS files:
```bash
# Find the Socket.IO connection URL and project name from JS files
# Try multiple common JS paths and filenames
for proto in https http; do
  for jsdir in js JS assets/js scripts; do
    for jsfile in custom.js Liverate1.js liverate.js main.js app.js index.js bundle.js; do
      curl -sk --max-time 5 "${proto}://${DOMAIN}/${jsdir}/${jsfile}" 2>/dev/null | grep -iE '(adminsocketurl|socketurl|prjName|clientId|io\(|starline)' | head -5
    done
  done
done
```
**Key variables to find**:
- `adminsocketurl` / `socketurl` → WebSocket server URL (e.g., `https://starlinetechno.in:10001`)
- `prjName` → client registration name used in `emit('client', prjName)` (e.g., `nakodabullion`, `pritam`)
- Common Socket.IO infrastructure providers: `starlinetechno.in`, `starlinebuild.in`, `starlinebuild.co.in`, `starlinesupport.co.in` — dealers hosted on these share the Starline platform

### Probe D: LMX Trade / WinBull API (Shiv Sahai type)
```bash
# Check for LMX Trade POST endpoint
curl -sk --max-time 5 -X POST "http://${DOMAIN}/lmxtrade/winbullliteapi/api/v1/broadcastrates" \
  -H "Content-Type: application/json" \
  -d '{"client":"test"}' 2>/dev/null | head -c 200
```
**Detection**: Response contains tab-delimited lines starting with record type codes (1, 2, 3).

### Probe E: Firebase REST API
```bash
# Check if there's a Firebase endpoint (look at page source first)
curl -sk --max-time 5 "https://${DOMAIN}-live-rates.firebaseio.com/.json" 2>/dev/null | head -c 200
```

## Step 3: Generate Scraper

Based on probe results, take the appropriate action:

### If VOTS Detected (most common)
1. Add an entry to `backend/scrapers/vots/vots_scraper.py` in the `VOTS_DEALERS` dict:
```python
"newdealer": {
    "api_url": "<detected API URL>",
    "origin": "https://newdealer.com",
    # Only add sec_fetch_site if "cross-site" (default is "same-site")
},
```
2. No other files need updating — the unified registry auto-discovers VOTS dealers.
3. Determine `sec_fetch_site`:
   - If the API subdomain is on a different domain than the origin → `"cross-site"`
   - If the API subdomain matches the origin domain → omit (defaults to `"same-site"`)

### If Socket.IO Detected
Socket.IO scrapers are now **config-driven** like VOTS and WinBull. Do NOT create individual scraper files.

1. Extract connection details from the dealer's JS files:
   - `adminsocketurl` / `socketurl` → WebSocket server URL (e.g., `https://starlinetechno.in:10001`)
   - `prjName` → client registration name (e.g., `nakodabullion`) — used in `emit('client', prjName)`
2. Add an entry to `backend/scrapers/socketio/socketio_scraper.py` in the `SOCKETIO_DEALERS` dict:
```python
"newdealer": {
    "server_url": "https://starlinetechno.in:10001",  # from adminsocketurl
    "client_name": "newdealer",                         # from prjName
    "origin": "http://newdealer.com",                   # the dealer website
},
```
3. No other files need updating — the unified registry auto-discovers SOCKETIO_DEALERS entries, and `cached_rate_service.py` dynamically creates Redis readers for all SOCKETIO_DEALERS.

**Socket.IO event names**: Different infrastructure providers use different event names:
- **csvbullion/dashboard pattern**: `mainProduct`, `refProduct` (Bid/Ask/High/Low keys)
- **Starline-tech pattern**: `Liverate` (same Bid/Ask/High/Low format as refProduct)
- **vickygold pattern**: `clientDetails`, `coinDetails` (bid/ask/high/low lowercase keys)
The `SocketIOScraper` handles all these automatically.

**Common Socket.IO infrastructure providers**:
- `dashboard.ambicaaspot.com:10001` — ambicaaspot's own server
- `starlinetechno.in:10001` — Starline Tech (nakodabullion)
- `starlinesupport.co.in:10001` — Starline Support (lawatjewellers)
- `starlinebuild.in:10001` — Starline Build (sohanbullion)
- `starlinebuild.co.in:10001` — Starline Build alt domain (pritamspot)
- `vickygold.co.in:10001` — vickygold's own server
- `www.bullionnerve.com:10000` — bullionnerve (note: port 10000, client_name is `4sbullion`)

### If LMX Trade / WinBull Detected
WinBull scrapers are now **config-driven**. Do NOT create individual scraper files.

1. Extract the client name from the dealer's JS files or by testing with the WinBull API endpoint.
2. Add an entry to `backend/scrapers/winbull/winbull_scraper.py` in the `WINBULL_DEALERS` dict:
```python
"newdealer": {
    "api_url": "http://www.newdealer.com/lmxtrade/winbullliteapi/api/v1/broadcastrates",
    "client_id": "newdealer",  # the client identifier sent in POST body
    "origin": "http://www.newdealer.com",
},
```
3. No other files need updating — the unified registry auto-discovers WINBULL_DEALERS.
4. **URL note**: Prefer domain-based URLs over IP-based URLs. IP-based URLs may not be accessible from Docker containers.
5. To find the correct `client_id`, check the dealer's JS files for the POST body or try the short dealer name.

### If Firebase Detected
1. Create `backend/scrapers/{name}/{name}_scraper.py` using `rsbl_scraper.py` as template
2. Update the Firebase URLs
3. Add import and entry in `backend/scrapers/__init__.py`

### If Unknown
Report all probe findings to the user and ask for guidance. Include the raw curl outputs.

## Step 4: Test Locally

Run a quick test to verify the scraper works. Use Docker since local env lacks dependencies:

### For VOTS / API scrapers:
```bash
docker compose -f docker-compose.dev.yml run --rm --no-deps backend python -c "
import asyncio
from scrapers import get_scraper

async def test():
    scraper = get_scraper('${NAME}')
    await scraper.start()
    try:
        rates = await scraper.scrape_rates()
        print(f'Got {len(rates)} rates:')
        for r in rates[:5]:
            print(f'  {r.script_name}: buy={r.buy_rate}, sell={r.sell_rate}')
        if not rates:
            print('WARNING: No rates returned!')
    finally:
        await scraper.stop()

asyncio.run(test())
"
```

### For Socket.IO scrapers (event-driven, scrape_rates() returns empty):
```bash
docker compose -f docker-compose.dev.yml run --rm --no-deps backend python -c "
import asyncio, time
from scrapers import get_scraper

async def test():
    scraper = get_scraper('${NAME}')
    await scraper.start()
    try:
        rates_collected = []
        start = time.time()
        while time.time() - start < 15 and not rates_collected:
            try:
                message = await asyncio.wait_for(scraper.websocket.recv(), timeout=5)
                if isinstance(message, str):
                    # Handle Socket.IO ping (message '2') with pong ('3')
                    if message == '2':
                        await scraper.websocket.send('3')
                        continue
                    rates = await scraper._parse_socketio_message(message)
                    if rates: rates_collected.extend(rates)
                elif isinstance(message, bytes):
                    try:
                        rates = await scraper._parse_socketio_message(message.decode('utf-8'))
                        if rates: rates_collected.extend(rates)
                    except UnicodeDecodeError: pass
            except asyncio.TimeoutError: continue
        print(f'Got {len(rates_collected)} rates:')
        for r in rates_collected[:10]:
            print(f'  {r.script_name}: buy={r.buy_rate}, sell={r.sell_rate}')
        if not rates_collected:
            print('WARNING: No rates returned (may be outside market hours)')
    finally:
        await scraper.stop()

asyncio.run(test())
"
```
**Note**: Socket.IO servers send ping messages (`2`) that must be answered with pong (`3`), otherwise the connection drops. The test above handles this. Zero rates outside Indian market hours (Mon-Sat ~10am-7pm IST) is normal.

If the test fails, debug and fix before proceeding.

## Step 5: Commit & Push

After successful testing, use `/commit-commands:commit-push-pr` to commit, push, and optionally open a PR. Do NOT deploy to production unless the user explicitly asks you to.

## Important Notes

### VOTS (most common)
- VOTS dealers are by far the most common — always check for VOTS first
- **Always run Probe C2** to extract `ipAddressBCast` and `defaultScripTemplateId` from the page — this is the most reliable detection method
- The VOTS template ID in the URL path often differs from the domain name (e.g., `arihant` vs `arihantspot.com`). Try both the short name and variations.
- Some dealers use HTTP instead of HTTPS (e.g., suswanibullion uses `http://` on port 7767)
- When probing, try multiple template IDs: the short name, the full domain prefix, common abbreviations
- **Cross-TLD bcast**: Some dealers have bcast on a different TLD than their website (e.g., `bcast.smdbullion.in` for `smdbullion.com`, `bcast.svbcgold.in` for `svbcgold.com`). Always try `.in`, `.net`, `.co.in` variants. If cross-TLD, add `sec_fetch_site: "cross-site"`.
- **Cross-domain bcast**: Some dealers use a completely different company's bcast domain (e.g., `karunabullion.com` uses `bcast.arhambullion.in`). Probe A won't find these — only Probe C2 will.
- **Non-standard ports**: Some dealers use custom ports like `7666` instead of `7768`/`7767` (e.g., `ronakgold.noip.us:7666`). Extract `step3StreamingPort` from Probe C2.
- **Dynamic DNS**: Some dealers use `noip.us`, `ddns.net`, or raw IPs for bcast (e.g., `ronakgold.noip.us`). These are valid bcast hostnames.

### Socket.IO
- Socket.IO server URL is almost never on the dealer's own domain — it's on infrastructure providers like `starlinetechno.in`, `starlinebuild.in`, etc.
- The `prjName` / client registration name is often but not always the dealer's short name
- Some dealers use port 10000 instead of 10001 (e.g., bullionnerve)
- **Lightstreamer ≠ Socket.IO**: A page may import `socket.io.js` but actually use Lightstreamer. However, do NOT auto-skip Lightstreamer dealers — some also have VOTS (e.g., `karunabullion.com` has Lightstreamer + VOTS via `bcast.arhambullion.in`). Always run Probe C2 to check for VOTS config before skipping.
- Socket.IO scrapers may return 0 rates outside Indian market hours (Mon-Sat ~10am-7pm IST). This is normal — test during market hours if possible.

### WinBull
- Use domain-based URLs, not IP-based — Docker containers may not resolve IP-based URLs
- The `client_id` is sent as `{"client": "<id>"}` in the POST body

### General
- Always test before deploying — a broken scraper can crash-loop and consume resources
- Do NOT deploy to production without explicit user approval
- All three scraper types (VOTS, WinBull, Socket.IO) are config-driven — adding a new dealer is just a dict entry, no new files needed
