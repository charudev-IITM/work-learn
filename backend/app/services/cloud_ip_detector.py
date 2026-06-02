"""
Cloud/datacenter IP detection — identifies requests from AWS, GCP, DigitalOcean, etc.

Fetches public IP range lists at startup, refreshes every 24h.
Sorted interval lists with O(log N) binary search lookup.
"""

import asyncio
import bisect
import logging
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network, ip_address, ip_network
from typing import Union

import aiohttp

logger = logging.getLogger(__name__)

NetworkType = Union[IPv4Network, IPv6Network]

# Sources for datacenter IP ranges
_SOURCES = {
    "AWS": "https://ip-ranges.amazonaws.com/ip-ranges.json",
    "GCP": "https://www.gstatic.com/ipranges/cloud.json",
    "DigitalOcean": "https://digitalocean.com/geo/google.csv",
    "OracleCloud": "https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json",
}

# Hetzner ranges (well-known /16 blocks — no public API)
_HETZNER_RANGES = [
    "5.9.0.0/16", "23.88.0.0/16", "46.4.0.0/16", "49.12.0.0/16",
    "65.21.0.0/16", "78.46.0.0/16", "88.99.0.0/16", "95.216.0.0/16",
    "116.202.0.0/16", "116.203.0.0/16", "128.140.0.0/16", "135.181.0.0/16",
    "136.243.0.0/16", "138.201.0.0/16", "144.76.0.0/16", "148.251.0.0/16",
    "157.90.0.0/16", "159.69.0.0/16", "162.55.0.0/16", "167.235.0.0/16",
    "168.119.0.0/16", "176.9.0.0/16", "178.63.0.0/16", "188.40.0.0/16",
    "195.201.0.0/16", "213.133.0.0/16", "213.239.0.0/16",
]

# Linode ranges
_LINODE_RANGES = [
    "45.33.0.0/16", "45.56.0.0/16", "45.79.0.0/16", "50.116.0.0/16",
    "66.175.208.0/20", "66.228.32.0/19", "69.164.192.0/18",
    "72.14.176.0/20", "74.207.224.0/19", "96.126.96.0/19",
    "97.107.128.0/17", "139.144.0.0/16", "139.162.0.0/16",
    "172.104.0.0/15", "173.230.128.0/17", "173.255.192.0/18",
    "176.58.0.0/16", "178.79.128.0/17", "192.155.192.0/18",
    "194.195.208.0/20", "198.58.96.0/19",
]

# Sorted interval lists for O(log N) binary search lookup
_ipv4_intervals: list[tuple[int, int, str]] = []  # (start, end, provider)
_ipv6_intervals: list[tuple[int, int, str]] = []
_ipv4_starts: list[int] = []  # parallel list for bisect
_ipv6_starts: list[int] = []
_refresh_task: asyncio.Task | None = None


async def _fetch_aws(session: aiohttp.ClientSession) -> list[tuple[str, NetworkType]]:
    """Fetch AWS IP ranges."""
    results = []
    try:
        async with session.get(_SOURCES["AWS"], timeout=aiohttp.ClientTimeout(total=30)) as resp:
            data = await resp.json()
        for prefix in data.get("prefixes", []):
            try:
                results.append(("AWS", ip_network(prefix["ip_prefix"])))
            except (ValueError, KeyError):
                pass
        for prefix in data.get("ipv6_prefixes", []):
            try:
                results.append(("AWS", ip_network(prefix["ipv6_prefix"])))
            except (ValueError, KeyError):
                pass
    except Exception as e:
        logger.warning(f"Failed to fetch AWS IP ranges: {e}")
    return results


async def _fetch_gcp(session: aiohttp.ClientSession) -> list[tuple[str, NetworkType]]:
    """Fetch GCP IP ranges."""
    results = []
    try:
        async with session.get(_SOURCES["GCP"], timeout=aiohttp.ClientTimeout(total=30)) as resp:
            data = await resp.json()
        for prefix in data.get("prefixes", []):
            for key in ("ipv4Prefix", "ipv6Prefix"):
                if key in prefix:
                    try:
                        results.append(("GCP", ip_network(prefix[key])))
                    except ValueError:
                        pass
    except Exception as e:
        logger.warning(f"Failed to fetch GCP IP ranges: {e}")
    return results


async def _fetch_oracle(session: aiohttp.ClientSession) -> list[tuple[str, NetworkType]]:
    """Fetch Oracle Cloud IP ranges."""
    results = []
    try:
        async with session.get(
            _SOURCES["OracleCloud"], timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            data = await resp.json()
        for region in data.get("regions", []):
            for cidr_entry in region.get("cidrs", []):
                cidr = cidr_entry.get("cidr")
                if cidr:
                    try:
                        results.append(("OracleCloud", ip_network(cidr)))
                    except ValueError:
                        pass
    except Exception as e:
        logger.warning(f"Failed to fetch Oracle Cloud IP ranges: {e}")
    return results


async def _fetch_digitalocean(session: aiohttp.ClientSession) -> list[tuple[str, NetworkType]]:
    """Fetch DigitalOcean IP ranges from CSV."""
    results = []
    try:
        async with session.get(
            _SOURCES["DigitalOcean"], timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            text = await resp.text()
        for line in text.strip().split("\n"):
            parts = line.strip().split(",")
            if len(parts) >= 1 and "/" in parts[0]:
                try:
                    results.append(("DigitalOcean", ip_network(parts[0].strip())))
                except ValueError:
                    pass
    except Exception as e:
        logger.warning(f"Failed to fetch DigitalOcean IP ranges: {e}")
    return results


def _load_static_ranges() -> list[tuple[str, NetworkType]]:
    """Load hardcoded Hetzner and Linode ranges."""
    results = []
    for cidr in _HETZNER_RANGES:
        try:
            results.append(("Hetzner", ip_network(cidr)))
        except ValueError:
            pass
    for cidr in _LINODE_RANGES:
        try:
            results.append(("Linode", ip_network(cidr)))
        except ValueError:
            pass
    return results


def _merge_intervals(
    intervals: list[tuple[int, int, str]],
) -> tuple[list[tuple[int, int, str]], list[int]]:
    """Sort and merge overlapping/adjacent intervals. Returns (intervals, starts)."""
    if not intervals:
        return [], []

    intervals.sort(key=lambda x: x[0])
    merged: list[tuple[int, int, str]] = [intervals[0]]

    for start, end, provider in intervals[1:]:
        prev_start, prev_end, prev_provider = merged[-1]
        if start <= prev_end + 1:
            # Overlapping or adjacent — merge, keep the larger end
            merged[-1] = (prev_start, max(prev_end, end), prev_provider)
        else:
            merged.append((start, end, provider))

    starts = [iv[0] for iv in merged]
    return merged, starts


def _build_intervals(all_ranges: list[tuple[str, NetworkType]]) -> None:
    """Build sorted interval lists from CIDR ranges for O(log N) lookup."""
    global _ipv4_intervals, _ipv6_intervals, _ipv4_starts, _ipv6_starts

    ipv4_raw: list[tuple[int, int, str]] = []
    ipv6_raw: list[tuple[int, int, str]] = []

    for provider, network in all_ranges:
        start = int(network.network_address)
        end = int(network.broadcast_address)
        if network.version == 4:
            ipv4_raw.append((start, end, provider))
        else:
            ipv6_raw.append((start, end, provider))

    new_v4, new_v4_starts = _merge_intervals(ipv4_raw)
    new_v6, new_v6_starts = _merge_intervals(ipv6_raw)

    # Atomic swap
    _ipv4_intervals = new_v4
    _ipv4_starts = new_v4_starts
    _ipv6_intervals = new_v6
    _ipv6_starts = new_v6_starts


async def _refresh_ranges() -> None:
    """Fetch all provider ranges and build sorted interval lists."""
    all_ranges: list[tuple[str, NetworkType]] = []

    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(
            _fetch_aws(session),
            _fetch_gcp(session),
            _fetch_digitalocean(session),
            _fetch_oracle(session),
            return_exceptions=True,
        )

    for result in results:
        if isinstance(result, list):
            all_ranges.extend(result)
        elif isinstance(result, Exception):
            logger.warning(f"Provider fetch failed: {result}")

    all_ranges.extend(_load_static_ranges())

    if not all_ranges:
        logger.warning("No IP ranges fetched — keeping previous list")
        return

    _build_intervals(all_ranges)
    logger.info(
        f"Cloud IP detector loaded {len(all_ranges)} prefixes "
        f"({len(_ipv4_intervals)} IPv4 + {len(_ipv6_intervals)} IPv6 merged intervals)"
    )


async def _refresh_loop() -> None:
    """Background task: refresh every 24h, retry in 1h on failure."""
    while True:
        try:
            await _refresh_ranges()
            await asyncio.sleep(86400)  # 24h
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Cloud IP refresh error: {e}")
            await asyncio.sleep(3600)  # retry in 1h


async def start() -> None:
    """Start the cloud IP detector — call during app lifespan startup."""
    global _refresh_task
    await _refresh_ranges()
    _refresh_task = asyncio.create_task(_refresh_loop())


async def stop() -> None:
    """Stop the background refresh task."""
    global _refresh_task
    if _refresh_task and not _refresh_task.done():
        _refresh_task.cancel()
        try:
            await _refresh_task
        except asyncio.CancelledError:
            pass
    _refresh_task = None


def is_datacenter_ip(ip_str: str) -> tuple[bool, str]:
    """Check if an IP belongs to a known cloud provider.

    O(log N) via sorted interval binary search.
    Returns (is_datacenter, provider_name).
    """
    try:
        addr = ip_address(ip_str)
    except ValueError:
        return False, ""

    addr_int = int(addr)

    if isinstance(addr, IPv4Address):
        intervals, starts = _ipv4_intervals, _ipv4_starts
    else:
        intervals, starts = _ipv6_intervals, _ipv6_starts

    if not intervals:
        return False, ""

    # bisect_right: find the last interval whose start <= addr_int
    idx = bisect.bisect_right(starts, addr_int) - 1
    if idx < 0:
        return False, ""

    _start, end, provider = intervals[idx]
    if addr_int <= end:
        return True, provider

    return False, ""
