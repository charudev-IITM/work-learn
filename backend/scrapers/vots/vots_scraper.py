"""
Config-driven VOTS Broadcast Streaming scraper.

All VOTS tab-delimited API dealers share identical logic — only the name,
API URL, origin, and occasionally sec-fetch-site differ. Adding a new VOTS
dealer is a 3-line entry in VOTS_DEALERS below.
"""

from ..base.api_scraper import TabDelimitedAPIScraper
from ..base.scraper import ScraperConfig, ScraperType
import logging

logger = logging.getLogger(__name__)

# ─── VOTS dealer registry ────────────────────────────────────────────────────
# Each entry only needs: api_url, origin.  Optional overrides: sec_fetch_site,
# poll_interval, extra headers.

VOTS_DEALERS = {
    "kjbullion": {
        "api_url": "https://bcast.kjbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kjbullion",
        "origin": "https://kjbullion.com",
    },
    "arihantspot": {
        "api_url": "https://bcast.arihantspot.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/arihant",
        "origin": "https://www.arihantspot.in",
        "sec_fetch_site": "cross-site",
    },
    "dpgold": {
        "api_url": "https://statewisebcast.dpgold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/dpgold",
        "origin": "https://dpgold.com",
        "sec_fetch_site": "cross-site",
    },
    "slnbullion": {
        "api_url": "https://bcast.slnbullion.com/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sln",
        "origin": "https://slnbullion.com",
    },
    "amsbullion": {
        "api_url": "https://adminapi.amsbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/amsbullion",
        "origin": "https://amsbullion.com",
    },
    "suswanibullion": {
        "api_url": "http://bcast.suswanibullion.com:7767/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/suswani",
        "origin": "http://www.suswanibullion.com",
    },
    "smsbullion": {
        "api_url": "https://bcast.smsbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/smsbullion",
        "origin": "https://www.smsbullion.com",
    },
    "ashtasiddhi": {
        "api_url": "https://bcast.ashtasiddhi.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/ashtasiddhi",
        "origin": "https://ashtasiddhi.co.in",
    },
    "shankheshwargold": {
        "api_url": "https://bcast.shankheshwargold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/shankheshwar",
        "origin": "https://www.shankheshwargold.com",
    },
    "srihariombullion": {
        "api_url": "https://bcast.srihariombullion.net:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/srihariom",
        "origin": "https://www.srihariombullion.com",
        "sec_fetch_site": "cross-site",
    },
    "roonwalbullion": {
        "api_url": "https://bcast.roonwalbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/roonwal",
        "origin": "http://www.roonwalbullion.com",
        "sec_fetch_site": "cross-site",
    },
    "sapnabullion": {
        "api_url": "https://bcast.sapnabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sapna",
        "origin": "http://www.sapnabullion.com",
        "sec_fetch_site": "cross-site",
    },
    "siddhbullionmart": {
        "api_url": "https://bcast.siddhbullionmart.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/siddhbullion",
        "origin": "https://siddhbullionmart.co.in",
        "sec_fetch_site": "cross-site",
    },
    "pjscommodities": {
        "api_url": "https://bcast.pjscommodities.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/pjs",
        "origin": "https://www.pjscommodities.com",
    },
    "kalingakawad": {
        "api_url": "https://bcast.kalingakawad.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kalingakawad",
        "origin": "https://kalingakawad.com",
    },
    "mbgold": {
        "api_url": "https://bcast.mbgold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mbgold",
        "origin": "https://mbgold.in",
    },
    "bpjewells": {
        "api_url": "https://bcast.bpjewells.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/bpjewells",
        "origin": "http://www.bpjewells.com",
    },
    "viombullion": {
        "api_url": "https://bcast.viombullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/viom",
        "origin": "https://viombullion.com",
    },
    "bombaybullion": {
        "api_url": "https://bcast.bombaybullion.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/bombay",
        "origin": "https://www.bombaybullion.co.in",
    },
    "rrtbullion": {
        "api_url": "https://bcast.rrtbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/rrtbullion",
        "origin": "https://rrtbullion.com",
    },
    "rdbullion": {
        "api_url": "https://bcast.rdbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/rdbullion",
        "origin": "https://rdbullion.com",
    },
    "ddbullions": {
        "api_url": "https://bcast.ddbullions.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/ddbullions",
        "origin": "https://ddbullions.com",
    },
    "rajeshwarbullion": {
        "api_url": "https://bcast.rajeshwarbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/rajeshwar",
        "origin": "http://www.rajeshwarbullion.com",
    },
    "kotharibullion": {
        "api_url": "https://bcast.kotharibullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kothari",
        "origin": "http://www.kotharibullion.com",
    },
    "maxisbullion": {
        "api_url": "https://bcast.maxisbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/maxis",
        "origin": "https://maxisbullion.com",
    },
    "shasanbullion": {
        "api_url": "https://bcast.shasanbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/shasan",
        "origin": "https://shasanbullion.com",
    },
    "lksbullion": {
        "api_url": "https://bcast.lksbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/lksbullion",
        "origin": "https://lksbullion.in",
    },
    "patelbullion": {
        "api_url": "https://bcast.patelbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/patel",
        "origin": "https://patelbullion.com",
    },
    "khandelwalbullion": {
        "api_url": "https://bcast.khandelwalbullion.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/khandelwal",
        "origin": "https://www.khandelwalbullion.co.in",
    },
    "believegold": {
        "api_url": "https://bcast.believegold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/believe",
        "origin": "http://www.believegold.com",
    },
    "mathashribullion": {
        "api_url": "https://bcast.mathashribullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mathashri",
        "origin": "http://www.mathashribullion.in",
    },
    "adityagold": {
        "api_url": "https://bcast.adityagold.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/adityagold",
        "origin": "https://adityagold.co.in",
    },
    "thebullionstore": {
        "api_url": "https://bcast.thebullionstore.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/thebullionstore",
        "origin": "https://thebullionstore.in",
    },
    "sahanabullion": {
        "api_url": "https://bcast.sahanabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sahana",
        "origin": "https://sahanabullion.com",
    },
    "nrjewellers": {
        "api_url": "https://bcast.nrjewellers.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/nrjewellers",
        "origin": "https://www.nrjewellers.com",
    },
    "mahimabullionspot": {
        "api_url": "https://bcast.mahimabullionspot.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mahima",
        "origin": "https://mahimabullionspot.com",
    },
    "navkargold": {
        "api_url": "https://bcast.navkargold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/navkar",
        "origin": "https://navkargold.com",
    },
    "airahbullion": {
        "api_url": "https://bcast.airahbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/airah",
        "origin": "https://www.airahbullion.com",
    },
    "abgold": {
        "api_url": "https://bcast.abgold.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/abgold",
        "origin": "https://abgold.co.in",
    },
    "jodhpurbullion": {
        "api_url": "https://bcast.jodhpurbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/jodhpur",
        "origin": "http://www.jodhpurbullion.com",
    },
    "banshreebullion": {
        "api_url": "https://bcast.banshreebullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/banshree",
        "origin": "https://banshreebullion.com",
    },
    "kalpjewels": {
        "api_url": "https://bcast.kalpjewels.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kalp",
        "origin": "http://www.kalpjewels.in",
    },
    "rkjewellers": {
        "api_url": "https://bcast.rkjewellers.info:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/rkbullion",
        "origin": "https://www.rkjewellers.info",
    },
    "karelbullions": {
        "api_url": "https://bcast.karelbullions.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/karel",
        "origin": "https://karelbullions.com",
    },
    "goldcorebullioner": {
        "api_url": "https://bcast.goldcorebullioner.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/goldcore",
        "origin": "https://goldcorebullioner.com",
    },
    "moonstarinc": {
        "api_url": "https://bcast.moonstarinc.net:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/moonstar",
        "origin": "https://moonstarinc.net",
    },
    "mahavirgold": {
        "api_url": "https://bcast.mahavirgold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mahavirgold",
        "origin": "https://www.mahavirgold.in",
    },
    "safaribullions": {
        "api_url": "https://bcast.safaribullions.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/safari",
        "origin": "https://www.safaribullions.com",
        "sec_fetch_site": "cross-site",
    },
    "smdbullion": {
        "api_url": "https://bcast.smdbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/smd",
        "origin": "https://www.smdbullion.com",
        "sec_fetch_site": "cross-site",
    },
    "svbcgold": {
        "api_url": "https://bcast.svbcgold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/svbc",
        "origin": "https://svbcgold.com",
        "sec_fetch_site": "cross-site",
    },
    "kalptarubullion": {
        "api_url": "https://bcast.kalptarubullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kalptaru",
        "origin": "http://www.kalptarubullion.com",
    },
    "nm1788": {
        "api_url": "https://bcast.nm1788.net:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/nm1788",
        "origin": "http://www.nm1788.com",
        "sec_fetch_site": "cross-site",
    },
    "choksivimal": {
        "api_url": "https://bcast.choksivimal.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/choksivimal",
        "origin": "https://choksivimal.com",
    },
    "srnbullion": {
        "api_url": "https://bcast.srnbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/srnbullion",
        "origin": "https://srnbullion.com",
    },
    "sbspot": {
        "api_url": "https://bcast.sbspot.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sbspot",
        "origin": "https://sbspot.in",
    },
    "aurousbullion": {
        "api_url": "https://bcast.aurousbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/aurous",
        "origin": "https://aurousbullion.in",
    },
    "gurukrupabullions": {
        "api_url": "https://bcast.gurukrupabullions.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/gurukrupa",
        "origin": "https://gurukrupabullions.com",
    },
    "hrdkbullion": {
        "api_url": "https://bcast.hrdkbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/hrdk",
        "origin": "https://hrdkbullion.in",
    },
    "jjgoldhouse": {
        "api_url": "https://bcast.jjgoldhouse.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/jjgold",
        "origin": "https://jjgoldhouse.in",
    },
    "pazbullion": {
        "api_url": "https://bcast.pazbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/paz",
        "origin": "https://pazbullion.com",
    },
    "rajharshbullion": {
        "api_url": "https://bcast.rajharshbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/rajharsh",
        "origin": "https://rajharshbullion.com",
    },
    "shreeshyambullion": {
        "api_url": "https://bcast.shreeshyambullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/shreeshyam",
        "origin": "https://shreeshyambullion.com",
    },
    "sridhikshaabullion": {
        "api_url": "https://bcast.sridhikshaabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sridhikshaa",
        "origin": "https://sridhikshaabullion.com",
    },
    "suvarnshreenathbullion": {
        "api_url": "http://bcast.suvarnshreenathbullion.com:7767/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/shreenath",
        "origin": "https://suvarnshreenathbullion.com",
        "sec_fetch_site": "cross-site",
    },
    "yhabgold": {
        "api_url": "https://bcast.yhabgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/yhab",
        "origin": "https://yhabgold.com",
    },
    "suvarnmayurbullion": {
        "api_url": "https://bcast.suvarnmayurbullion.co.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/suvarnmayur",
        "origin": "https://suvarnmayurbullion.co.in",
    },
    "nibrahca": {
        "api_url": "https://bcast.nibrhca.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/nibrahca",
        "origin": "https://nibrhca.info",
        "sec_fetch_site": "cross-site",
    },
    "auricbullion": {
        "api_url": "https://bcast.auricbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/auric",
        "origin": "https://auricbullion.com",
        "sec_fetch_site": "cross-site",
    },
    "mahrajabullion": {
        "api_url": "https://bcast.mahrajabullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mahraja",
        "origin": "http://mahrajabullion.in",
    },
    "jainbullion": {
        "api_url": "https://bcast.jainbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/jain",
        "origin": "http://www.jainbullion.in",
    },
    "mkbullion": {
        "api_url": "https://bcast.mkbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mkbullion",
        "origin": "http://mkbullion.in",
    },
    "acbullion": {
        "api_url": "https://bcast.acbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/acbullion",
        "origin": "http://www.acbullion.in",
    },
    "kkbullion": {
        "api_url": "https://bcast.kkbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kkbullion",
        "origin": "http://kkbullion.in",
    },
    "hbspot": {
        "api_url": "https://bcast.hbspot.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/hbspot",
        "origin": "https://hbspot.in",
    },
    "siddhibullion": {
        "api_url": "https://bcast.siddhibullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/siddhi",
        "origin": "http://siddhibullion.com",
    },
    "ksbullion": {
        "api_url": "https://bcast.ksbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/ksb",
        "origin": "http://www.ksbullion.in",
    },
    "swastikbullion": {
        "api_url": "https://bcast.swastikbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/swastik",
        "origin": "http://www.swastikbullion.com",
    },
    "msbullion": {
        "api_url": "https://bcast.msbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/msbullion",
        "origin": "http://msbullion.in",
    },
    "drbullion": {
        "api_url": "https://bcast.drbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/drbullion",
        "origin": "http://www.drbullion.in",
    },
    "sjbullion": {
        "api_url": "https://bcast.sjbullion.net:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sjbullion",
        "origin": "http://sjbullion.com",
        "sec_fetch_site": "cross-site",
    },
    "jayambebullion": {
        "api_url": "https://bcast.jayambebullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/jayambe",
        "origin": "http://jayambebullion.com",
    },
    "krishnabullion": {
        "api_url": "https://bcast.krishnabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/krishna",
        "origin": "http://krishnabullion.com",
    },
    "harikalabullion": {
        "api_url": "https://bcast.harikalabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/harikala",
        "origin": "http://harikalabullion.com",
    },
    "ikbullion": {
        "api_url": "https://bcast.ikbullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/ikbullion",
        "origin": "https://ikbullion.com",
    },
    "kakagold": {
        "api_url": "https://bcast.kakagold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kaka",
        "origin": "https://kakagold.in",
    },
    "kalashgold": {
        "api_url": "https://bcast.kalashgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kalashgold",
        "origin": "http://www.kalashgold.com",
    },
    "kartikeybullion": {
        "api_url": "https://bcast.kartikeybullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kartikey",
        "origin": "http://kartikeybullion.com",
    },
    "miragold": {
        "api_url": "https://bcast.miragold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/miragold",
        "origin": "http://miragold.in",
    },
    "rakshabullion": {
        "api_url": "https://bcast.rakshabullion.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/raksha",
        "origin": "http://rakshabullion.com",
    },
    "shashwatgold": {
        "api_url": "https://bcast.shashwatgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/shashwat",
        "origin": "http://www.shashwatgold.com",
    },
    "shethgold": {
        "api_url": "https://bcast.shethgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sheth",
        "origin": "http://www.shethgold.com",
    },
    "sjsgold": {
        "api_url": "https://bcast.sjsgold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sjsgold",
        "origin": "http://sjsgold.in",
    },
    "vipulgold": {
        "api_url": "https://bcast.vipulgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/vipulgold",
        "origin": "http://vipulgold.com",
    },
    "surabibullion": {
        "api_url": "http://bcast.surabibullion.in:7767/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/surabi",
        "origin": "http://surabibullion.com",
        "sec_fetch_site": "cross-site",
    },
    "ancgold": {
        "api_url": "https://bcast.ancgold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/ancgold",
        "origin": "https://ancgold.com",
    },
    "shreemandevbullion": {
        "api_url": "https://bcast.shreemandevbullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mandev",
        "origin": "https://shreemandevbullion.in",
    },
    "karunabullion": {
        "api_url": "https://bcast.arhambullion.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/arham",
        "origin": "https://karunabullion.com",
        "sec_fetch_site": "cross-site",
    },
    "ronakgold": {
        "api_url": "https://ronakgold.noip.us:7666/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/goldbarmumbai",
        "origin": "https://ronakgold.com",
        "sec_fetch_site": "cross-site",
    },
    "aartitraders": {
        "api_url": "https://bcast.aartitraders.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/aarti",
        "origin": "https://aartitraders.in",
    },
    "adinathinternational": {
        "api_url": "https://bcast.adinathinternational.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/adinathspot",
        "origin": "https://adinathinternational.com",
    },
    "arihanthjewellers": {
        "api_url": "https://bcast.arihanthjewellers.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/arihanthjewellers",
        "origin": "https://arihanthjewellers.com",
    },
    "dbrosjewels": {
        "api_url": "https://bcast.dbrosjewels.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/dbros",
        "origin": "https://dbrosjewels.com",
    },
    "manmandirjewellers": {
        "api_url": "https://bcast.manmandirjewellers.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/manmandir",
        "origin": "https://manmandirjewellers.com",
    },
    "mantrjewels": {
        "api_url": "https://bcast.mantrjewels.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/mantr",
        "origin": "https://mantrjewels.com",
    },
    "oropreciousmetals": {
        "api_url": "https://bcast.oropreciousmetals.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/oroprecious",
        "origin": "https://oropreciousmetals.com",
    },
    "parkerpreciousmetals": {
        "api_url": "https://bcast.parkerpreciousmetals.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/parker",
        "origin": "https://parkerpreciousmetals.com",
    },
    "sundaramchains": {
        "api_url": "https://bcast.sundaramchain.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundaram",
        "origin": "https://sundaramchains.com",
        "sec_fetch_site": "cross-site",
    },
    "suvidhijewelex": {
        "api_url": "https://bcast.suvidhigold.in:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/suvidhi",
        "origin": "http://suvidhijewelex.com",
        "sec_fetch_site": "cross-site",
    },
}


def _build_vots_headers(origin: str, sec_fetch_site: str = "same-site") -> dict:
    """Build standard VOTS request headers from origin."""
    return {
        'accept': 'text/plain, */*; q=0.01',
        'accept-language': 'en-US,en;q=0.9',
        'origin': origin,
        'referer': f'{origin}/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': sec_fetch_site,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    }


class VOTSScraper(TabDelimitedAPIScraper):
    """Config-driven scraper for all VOTS Broadcast Streaming dealers."""

    def __init__(self, name: str, api_url: str, origin: str, **overrides):
        config = ScraperConfig(
            competitor_name=name,
            base_url=api_url,
            scraper_type=ScraperType.API,
            poll_interval=overrides.get('poll_interval', 1),
            headers=_build_vots_headers(origin, overrides.get('sec_fetch_site', 'same-site')),
        )
        super().__init__(config)
