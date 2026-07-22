import api from './api';

export interface FundInfo {
  code: string;
  name: string;
  type: string;
}

export const fundService = {
  searchFunds: (keyword: string) =>
    api.get('/funds/search', { params: { keyword } }).then((r) => r.data),

  getFundInfo: (code: string) =>
    api.get(`/funds/${code}`).then((r) => r.data),

  getAllFunds: () =>
    api.get('/funds/all').then((r) => r.data),

  getHistoryNav: (code: string, startDate: string, endDate: string, timestamp?: number) =>
    api.get('/funds/nav-history', {
      params: {
        code,
        startDate,
        endDate,
        ...(timestamp && { _t: timestamp }),
      },
    }).then((r) => r.data),

  // 批量获取基金实时信息（1次请求替代N次，大幅加速自选页）
  batchGetFundInfo: (codes: string[]) =>
    api.post('/funds/batch', { codes }).then((r) => r.data),
};