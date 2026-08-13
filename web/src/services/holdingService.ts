import api from './api';

export interface HoldingData {
  fund_code: string;
  shares: number;
  cost_price: number;
  group_id?: number;
}

export const holdingService = {
  getHoldings: (forceRefresh = false) =>
    api.get('/holdings', { params: { forceRefresh: forceRefresh ? 1 : 0 } }).then((r) => r.data),

  addHolding: (data: { fundCode: string; amount: number; totalReturn: number; groupId?: number }) =>
    api.post('/holdings', data).then((r) => r.data),

  // 新购基金：带上购买日期、15:00前/后标志、买入费率，由后端按净值入库
  purchaseFund: (data: { fundCode: string; amount: number; purchaseDate: string; after3pm: boolean; feeRate?: number; groupId?: number }) =>
    api.post('/holdings/purchase', data).then((r) => r.data),

  updateHoldingGroup: (id: number, groupId: number) =>
    api.put(`/holdings/${id}`, { groupId }).then((r) => r.data),

  updateHolding: (id: number, data: { fundCode: string; amount: number; totalReturn: number }) =>
    api.put(`/holdings/${id}`, data).then((r) => r.data),

  deleteHolding: (id: number) =>
    api.delete(`/holdings/${id}`).then((r) => r.data),
};