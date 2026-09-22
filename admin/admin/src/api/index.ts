import axios from 'axios';
import { message as staticMessage } from 'antd';
import { appMessage } from '../utils/appFeedback';

const showError = (content: string) => {
  const msg = appMessage();
  if (msg) msg.error(content);
  else staticMessage.error(content);
};

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    } else if (err.response?.status === 403) {
      showError('需要管理员权限');
    } else {
      showError(err.response?.data?.message || '请求失败');
    }
    return Promise.reject(err);
  }
);

export default api;

export const adminApi = {
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data).then((r) => r.data),
  dashboard: () => api.get('/admin/dashboard').then((r) => r.data),
  listUsers: (params: { page: number; pageSize: number; keyword?: string }) =>
    api.get('/admin/users', { params }).then((r) => r.data),
  createUser: (data: { username: string; password: string; role: string }) =>
    api.post('/admin/users', data).then((r) => r.data),
  updateUserRole: (id: number, role: string) =>
    api.put(`/admin/users/${id}/role`, { role }).then((r) => r.data),
  resetPassword: (id: number, password: string) =>
    api.put(`/admin/users/${id}/password`, { password }).then((r) => r.data),
  deleteUser: (id: number) =>
    api.delete(`/admin/users/${id}`).then((r) => r.data),
  listFunds: (params: { page: number; pageSize: number; keyword?: string; type?: string }) =>
    api.get('/admin/funds', { params }).then((r) => r.data),
  syncFunds: () => api.post('/admin/funds/sync').then((r) => r.data),
  deleteFund: (code: string) =>
    api.delete(`/admin/funds/${code}`).then((r) => r.data),
  cacheStats: () => api.get('/admin/cache/stats').then((r) => r.data),
  cacheCheck: (key: string) =>
    api.get('/admin/cache/check', { params: { key } }).then((r) => r.data),
  cacheClear: (key?: string) =>
    api.post('/admin/cache/clear', { key }).then((r) => r.data),
  // 公告管理
  listAnnouncements: (params: { page: number; pageSize: number; keyword?: string; status?: string }) =>
    api.get('/announcements', { params }).then((r) => r.data),
  createAnnouncement: (data: { title: string; content: string; type: string; status: string; startDate?: string | null; endDate?: string | null }) =>
    api.post('/announcements', data).then((r) => r.data),
  updateAnnouncement: (id: number, data: { title: string; content: string; type: string; status: string; startDate?: string | null; endDate?: string | null }) =>
    api.put(`/announcements/${id}`, data).then((r) => r.data),
  deleteAnnouncement: (id: number) =>
    api.delete(`/announcements/${id}`).then((r) => r.data),
  republishAnnouncement: (id: number) =>
    api.post(`/announcements/${id}/republish`).then((r) => r.data),
  // 反馈管理
  listFeedbacks: (params: { page: number; pageSize: number; keyword?: string }) =>
    api.get('/admin/feedbacks', { params }).then((r) => r.data),
  deleteFeedback: (id: number) =>
    api.delete(`/admin/feedbacks/${id}`).then((r) => r.data),
  // 数据趋势
  transactionTrend: (days = 30) =>
    api.get('/admin/stats/transaction-trend', { params: { days } }).then((r) => r.data),
  userGrowth: (days = 7) =>
    api.get('/admin/stats/user-growth', { params: { days } }).then((r) => r.data),
  dailyActive: (days = 30) =>
    api.get('/admin/stats/daily-active', { params: { days } }).then((r) => r.data),
  // 系统监控
  systemMetrics: () => api.get('/admin/system/metrics').then((r) => r.data),
};
