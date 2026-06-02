import type { AxiosInstance } from 'axios';

let _api: AxiosInstance | null = null;

export function initApiClient(api: AxiosInstance): void {
  _api = api;
}

export function getApiClient(): AxiosInstance {
  if (!_api) {
    throw new Error(
      'API client not initialized. Call initApiClient() in your app entry point before using any service.'
    );
  }
  return _api;
}
