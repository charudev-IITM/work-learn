import { getApiClient } from './apiClient';
import { PriceAlert, AlertCreateRequest, AlertUpdateRequest } from '../types/alerts';

function convertApiAlert(apiAlert: any): PriceAlert {
  return {
    id: apiAlert.id,
    userId: apiAlert.user_id,
    dealerName: apiAlert.dealer_name,
    scriptName: apiAlert.script_name,
    condition: apiAlert.condition,
    rateType: apiAlert.rate_type,
    threshold: apiAlert.threshold,
    isActive: apiAlert.is_active,
    triggerMode: apiAlert.trigger_mode,
    cooldownMinutes: apiAlert.cooldown_minutes,
    lastTriggeredAt: apiAlert.last_triggered_at,
    createdAt: apiAlert.created_at,
    updatedAt: apiAlert.updated_at,
  };
}

export const alertService = {
  async getAlerts(): Promise<PriceAlert[]> {
    try {
      const api = getApiClient();
      const response = await api.get('/api/alerts');
      return response.data.map(convertApiAlert);
    } catch (error: any) {
      console.error('Failed to fetch alerts:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to fetch alerts');
    }
  },

  async createAlert(data: AlertCreateRequest): Promise<PriceAlert> {
    try {
      const api = getApiClient();
      const response = await api.post('/api/alerts', {
        dealer_name: data.dealerName,
        script_name: data.scriptName,
        condition: data.condition,
        rate_type: data.rateType,
        threshold: data.threshold,
        trigger_mode: data.triggerMode || 'one_shot',
        cooldown_minutes: data.cooldownMinutes || 30,
      });
      return convertApiAlert(response.data);
    } catch (error: any) {
      console.error('Failed to create alert:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to create alert');
    }
  },

  async updateAlert(alertId: string, data: AlertUpdateRequest): Promise<PriceAlert> {
    try {
      const api = getApiClient();
      const payload: any = {};
      if (data.threshold !== undefined) payload.threshold = data.threshold;
      if (data.condition !== undefined) payload.condition = data.condition;
      if (data.rateType !== undefined) payload.rate_type = data.rateType;
      if (data.isActive !== undefined) payload.is_active = data.isActive;
      if (data.triggerMode !== undefined) payload.trigger_mode = data.triggerMode;
      if (data.cooldownMinutes !== undefined) payload.cooldown_minutes = data.cooldownMinutes;

      const response = await api.put(`/api/alerts/${alertId}`, payload);
      return convertApiAlert(response.data);
    } catch (error: any) {
      console.error('Failed to update alert:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to update alert');
    }
  },

  async deleteAlert(alertId: string): Promise<void> {
    try {
      const api = getApiClient();
      await api.delete(`/api/alerts/${alertId}`);
    } catch (error: any) {
      console.error('Failed to delete alert:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to delete alert');
    }
  },
};

export default alertService;
