import { getApiClient } from './apiClient';
import type { DealerRequestData } from '../types/dealers';

export async function submitDealerRequest(data: DealerRequestData): Promise<void> {
  try {
    const api = getApiClient();
    await api.post('/api/dealer-requests', {
      dealer_name: data.dealerName,
      dealer_url: data.dealerUrl,
      notes: data.notes || undefined,
    });
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Failed to submit dealer request');
  }
}
