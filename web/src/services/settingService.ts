import api from './api';

export type ValuationMethod = 'tencent' | 'holdings';

export interface SettingsData {
  refresh_frequency: number;
  valuation_method: ValuationMethod;
  valuation_overrides: Record<string, ValuationMethod>;
}

export const settingService = {
  getSettings: (): Promise<SettingsData> => api.get('/settings').then((r) => r.data),

  updateSettings: (data: { refreshFrequency?: number; valuationMethod?: ValuationMethod }) =>
    api.put('/settings', data).then((r) => r.data),

  updateValuationMethod: (method: ValuationMethod) =>
    api.put('/settings/valuation-method', { method }).then((r) => r.data),

  setFundOverride: (fundCode: string, method: ValuationMethod | '') =>
    api.put('/settings/fund-override', { fundCode, method }).then((r) => r.data),
};