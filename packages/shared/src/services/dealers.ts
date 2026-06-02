import { getApiClient } from './apiClient';
import type { DealerMetadataResponse } from '../types/dealers';

export const dealerService = {
  async getMetadata(): Promise<DealerMetadataResponse> {
    const api = getApiClient();
    const response = await api.get('/api/dealers/metadata');
    const data = response.data;
    return {
      dealers: (data.dealers || []).map((d: any) => ({
        dealerId: d.dealer_id,
        name: d.name,
        city: d.city,
        state: d.state,
        logoUrl: d.logo_url,
      })),
      cities: data.cities || [],
    };
  },
};
