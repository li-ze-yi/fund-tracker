import api from './api';

export const statsService = {
  getDailyStats: (params?: { year?: number; month?: number }) => {
    const query = params && params.year && params.month
      ? `?year=${params.year}&month=${params.month}`
      : '';
    return api.get(`/stats/daily${query}`).then((r) => r.data);
  },

  getMonthlyStats: (params?: { year?: number }) => {
    const query = params && params.year ? `?year=${params.year}` : '';
    return api.get(`/stats/monthly${query}`).then((r) => r.data);
  },

  getYearlyStats: () => api.get('/stats/yearly').then((r) => r.data),
};