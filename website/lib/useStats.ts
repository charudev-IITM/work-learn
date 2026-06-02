"use client";

import { useState, useEffect } from "react";
import { FALLBACK_STATS, fetchStatsClient, type PlatformStats } from "./stats";

export function useStats(): PlatformStats {
  const [stats, setStats] = useState<PlatformStats>({ ...FALLBACK_STATS });

  useEffect(() => {
    fetchStatsClient().then(setStats);
  }, []);

  return stats;
}
