import api from './api';

export const statsService = {
  getDailyStats: () => api.get('/stats/daily').then((r) => r.data),

  getMonthlyStats: () => api.get('/stats/monthly').then((r) => r.data),

  getYearlyStats: () => api.get('/stats/yearly').then((r) => r.data),
};