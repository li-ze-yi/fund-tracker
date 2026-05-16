import api from './api';

export const settingService = {
  getSettings: () => api.get('/settings').then((r) => r.data),

  updateSettings: (data: { refreshFrequency: number }) =>
    api.put('/settings', data).then((r) => r.data),
};