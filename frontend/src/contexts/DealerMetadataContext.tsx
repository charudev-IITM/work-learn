import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { dealerService } from '@comp-intel/shared/services/dealers';
import type { DealerMetadataItem } from '@comp-intel/shared/types/dealers';

interface DealerMetadataContextType {
  dealers: Map<string, DealerMetadataItem>;
  cities: string[];
  getDealerName: (dealerId: string) => string;
  getDealerCity: (dealerId: string) => string | null;
  getDealerLogo: (dealerId: string) => string | null;
  isLoading: boolean;
}

const DealerMetadataContext = createContext<DealerMetadataContextType | null>(null);

export function DealerMetadataProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [dealers, setDealers] = useState<Map<string, DealerMetadataItem>>(new Map());
  const [cities, setCities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setDealers(new Map());
      setCities([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    dealerService.getMetadata()
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, DealerMetadataItem>();
        for (const d of data.dealers) {
          map.set(d.dealerId, d);
        }
        setDealers(map);
        setCities(data.cities);
      })
      .catch((err) => {
        if (!cancelled) console.warn('Failed to load dealer metadata:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const getDealerName = useCallback((dealerId: string) => {
    return dealers.get(dealerId)?.name || dealerId;
  }, [dealers]);

  const getDealerCity = useCallback((dealerId: string) => {
    return dealers.get(dealerId)?.city || null;
  }, [dealers]);

  const getDealerLogo = useCallback((dealerId: string) => {
    return dealers.get(dealerId)?.logoUrl || null;
  }, [dealers]);

  const value = useMemo<DealerMetadataContextType>(() => ({
    dealers,
    cities,
    getDealerName,
    getDealerCity,
    getDealerLogo,
    isLoading,
  }), [dealers, cities, getDealerName, getDealerCity, getDealerLogo, isLoading]);

  return (
    <DealerMetadataContext.Provider value={value}>
      {children}
    </DealerMetadataContext.Provider>
  );
}

export function useDealerMetadata() {
  const context = useContext(DealerMetadataContext);
  if (!context) {
    throw new Error('useDealerMetadata must be used within a DealerMetadataProvider');
  }
  return context;
}
