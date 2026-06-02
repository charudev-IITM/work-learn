export interface DealerMetadataItem {
  dealerId: string;
  name: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
}

export interface DealerMetadataResponse {
  dealers: DealerMetadataItem[];
  cities: string[];
}

export interface DealerRequestData {
  dealerName: string;
  dealerUrl: string;
  notes?: string;
}
