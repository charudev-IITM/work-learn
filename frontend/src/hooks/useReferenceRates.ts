import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { authenticatedApi } from '../services/auth'
import { getRate, type RateEntry } from '@comp-intel/shared/stores/rateStore'
import { useGlobalRateVersion } from './useRateVersion'

/** Mapping from backend: which dealer/symbol fills each slot */
interface SlotMapping {
  dealer_id: string
  symbol: string
}

interface BackendResponse {
  mcx_gold: SlotMapping | null
  mcx_silver: SlotMapping | null
  gold_spot: SlotMapping | null
  silver_spot: SlotMapping | null
  gold_am_fix: SlotMapping | null
  gold_pm_fix: SlotMapping | null
  silver_fix: SlotMapping | null
  inr_usd: SlotMapping | null
}

export interface ReferenceRates {
  // MCX (INR)
  mcxGold: RateEntry | null
  mcxSilver: RateEntry | null
  // COMEX (USD)
  goldSpot: RateEntry | null
  silverSpot: RateEntry | null
  // LBMA (USD)
  goldAmFix: RateEntry | null
  goldPmFix: RateEntry | null
  silverFix: RateEntry | null
  // Forex
  inrUsd: RateEntry | null
}

const EMPTY: ReferenceRates = {
  mcxGold: null, mcxSilver: null,
  goldSpot: null, silverSpot: null,
  goldAmFix: null, goldPmFix: null, silverFix: null,
  inrUsd: null,
}

// Mapping refreshes infrequently — taxonomy classification rarely changes
const MAPPING_POLL_INTERVAL = 60_000

function resolve(mapping: SlotMapping | null): RateEntry | null {
  if (!mapping) return null
  return getRate(mapping.dealer_id, mapping.symbol) ?? null
}

export function useReferenceRates(): ReferenceRates {
  const [mappings, setMappings] = useState<BackendResponse | null>(null)
  const mountedRef = useRef(true)

  // Fetch taxonomy mapping from backend (infrequent)
  const fetchMapping = useCallback(async () => {
    try {
      const { data } = await authenticatedApi.get('/api/rates/reference')
      if (!mountedRef.current) return
      setMappings(data)
    } catch {
      // Keep stale mapping — better than no data
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchMapping()
    const id = setInterval(fetchMapping, MAPPING_POLL_INTERVAL)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [fetchMapping])

  // Re-resolve live prices from rateStore on every WebSocket update
  const version = useGlobalRateVersion()

  return useMemo(() => {
    if (!mappings) return EMPTY
    return {
      mcxGold: resolve(mappings.mcx_gold),
      mcxSilver: resolve(mappings.mcx_silver),
      goldSpot: resolve(mappings.gold_spot),
      silverSpot: resolve(mappings.silver_spot),
      goldAmFix: resolve(mappings.gold_am_fix),
      goldPmFix: resolve(mappings.gold_pm_fix),
      silverFix: resolve(mappings.silver_fix),
      inrUsd: resolve(mappings.inr_usd),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappings, version])
}
