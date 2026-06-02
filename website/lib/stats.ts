/** Fallback stats used when the API is unavailable or for static content (metadata, SEO). */
export const FALLBACK_STATS = {
  dealers: 147,
  cities: 42,
  scripts: 50,
  uptime: 99.9,
} as const;

export interface PlatformStats {
  dealers: number;
  cities: number;
  scripts: number;
  uptime: number;
}

const API_URL = "https://app.spotcompare.com/api/stats";

/**
 * Fetch live stats from the public API.
 * Falls back to hardcoded defaults if the API is unreachable.
 */
export async function fetchStats(): Promise<PlatformStats> {
  try {
    const res = await fetch(API_URL, {
      next: { revalidate: 3600 }, // cache for 1 hour in SSR
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      dealers: data.dealers ?? data.dealer_count ?? data.total_dealers ?? FALLBACK_STATS.dealers,
      cities: data.cities ?? data.city_count ?? data.total_cities ?? FALLBACK_STATS.cities,
      scripts: data.scripts ?? data.script_count ?? data.total_scripts ?? FALLBACK_STATS.scripts,
      uptime: data.uptime ?? FALLBACK_STATS.uptime,
    };
  } catch {
    return { ...FALLBACK_STATS };
  }
}

/**
 * Client-side fetch for use in React components.
 */
export async function fetchStatsClient(): Promise<PlatformStats> {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      dealers: data.dealers ?? data.dealer_count ?? data.total_dealers ?? FALLBACK_STATS.dealers,
      cities: data.cities ?? data.city_count ?? data.total_cities ?? FALLBACK_STATS.cities,
      scripts: data.scripts ?? data.script_count ?? data.total_scripts ?? FALLBACK_STATS.scripts,
      uptime: data.uptime ?? FALLBACK_STATS.uptime,
    };
  } catch {
    return { ...FALLBACK_STATS };
  }
}

/** Format a stat as "100+" style string */
export function formatStat(value: number): string {
  return `${value}+`;
}
