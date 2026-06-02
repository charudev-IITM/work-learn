/**
 * Preview timer API service.
 * Manages server-side 10-minute preview countdown with pause/resume.
 */

import { getApiClient } from './apiClient';
import type { PreviewTimerStatus } from '../types/onboarding';

/** Must match backend PREVIEW_DURATION_SECONDS in preview_timer_service.py */
export const PREVIEW_DURATION_SECONDS = 600;

export const previewTimerService = {
  async start(): Promise<PreviewTimerStatus> {
    const api = getApiClient();
    const { data } = await api.post('/api/onboarding/preview/start');
    return data;
  },

  async pause(): Promise<PreviewTimerStatus> {
    const api = getApiClient();
    const { data } = await api.post('/api/onboarding/preview/pause');
    return data;
  },

  async resume(): Promise<PreviewTimerStatus> {
    const api = getApiClient();
    const { data } = await api.post('/api/onboarding/preview/resume');
    return data;
  },

  async getStatus(): Promise<PreviewTimerStatus> {
    const api = getApiClient();
    const { data } = await api.get('/api/onboarding/preview/status');
    return data;
  },
};
