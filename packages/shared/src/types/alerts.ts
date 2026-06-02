export interface PriceAlert {
  id: string;
  userId: string;
  dealerName: string;
  scriptName: string;
  condition: 'above' | 'below';
  rateType: 'buy' | 'sell';
  threshold: number;
  isActive: boolean;
  triggerMode: 'one_shot' | 'persistent';
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCreateRequest {
  dealerName: string;
  scriptName: string;
  condition: 'above' | 'below';
  rateType: 'buy' | 'sell';
  threshold: number;
  triggerMode?: 'one_shot' | 'persistent';
  cooldownMinutes?: number;
}

export interface AlertUpdateRequest {
  threshold?: number;
  condition?: 'above' | 'below';
  rateType?: 'buy' | 'sell';
  isActive?: boolean;
  triggerMode?: 'one_shot' | 'persistent';
  cooldownMinutes?: number;
}
