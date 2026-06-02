import { getApiClient } from './apiClient';
import type { Formula, FormulaCreateRequest, FormulaUpdateRequest } from '../types/calculator';

function convertApiFormula(raw: any): Formula {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    ast: raw.ast,
    orderIndex: raw.order_index,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export const calculatorService = {
  async getFormulas(): Promise<Formula[]> {
    try {
      const api = getApiClient();
      const response = await api.get('/api/formulas');
      return response.data.map(convertApiFormula);
    } catch (error: any) {
      console.error('Failed to fetch formulas:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to fetch formulas');
    }
  },

  async createFormula(data: FormulaCreateRequest): Promise<Formula> {
    try {
      const api = getApiClient();
      const response = await api.post('/api/formulas', {
        name: data.name,
        description: data.description,
        ast: data.ast,
      });
      return convertApiFormula(response.data);
    } catch (error: any) {
      console.error('Failed to create formula:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to create formula');
    }
  },

  async updateFormula(id: string, data: FormulaUpdateRequest): Promise<Formula> {
    try {
      const api = getApiClient();
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (data.ast !== undefined) payload.ast = data.ast;
      if (data.orderIndex !== undefined) payload.order_index = data.orderIndex;

      const response = await api.put(`/api/formulas/${id}`, payload);
      return convertApiFormula(response.data);
    } catch (error: any) {
      console.error('Failed to update formula:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to update formula');
    }
  },

  async deleteFormula(id: string): Promise<void> {
    try {
      const api = getApiClient();
      await api.delete(`/api/formulas/${id}`);
    } catch (error: any) {
      console.error('Failed to delete formula:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to delete formula');
    }
  },
};
