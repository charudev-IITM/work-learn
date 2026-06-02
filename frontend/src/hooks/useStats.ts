import { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

interface Stats {
  dealers: number;
  cities: number;
}

const FALLBACK: Stats = { dealers: 147, cities: 42 };

let cached: Stats | null = null;
let pending: Promise<Stats> | null = null;

function doFetch(): Promise<Stats> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch(`${API_BASE_URL}/api/stats`, { signal: AbortSignal.timeout(3000) })
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((data) => {
      cached = {
        dealers: data.dealers ?? FALLBACK.dealers,
        cities: data.cities ?? FALLBACK.cities,
      };
      return cached;
    })
    .catch(() => {
      cached = FALLBACK;
      return cached;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useStats(): Stats {
  const [stats, setStats] = useState<Stats>(cached ?? FALLBACK);

  useEffect(() => {
    if (cached) {
      setStats(cached);
      return;
    }
    doFetch().then(setStats);
  }, []);

  return stats;
}
