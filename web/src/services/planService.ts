import api from './api';

export const planService = {
  getPlans: () => api.get('/plans').then((r) => r.data),

  createPlan: (data: {
    fundCode: string;
    amount: number;
    frequency: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  }) => api.post('/plans', data).then((r) => r.data),

  updatePlanStatus: (id: number, status: string) =>
    api.put(`/plans/${id}/status`, { status }).then((r) => r.data),

  updatePlan: (id: number, data: {
    amount?: number;
    frequency?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  }) => api.put(`/plans/${id}`, data).then((r) => r.data),

  deletePlan: (id: number) =>
    api.delete(`/plans/${id}`).then((r) => r.data),
};