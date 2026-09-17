import api from './api';

// ─── 类型定义 ───

export interface DashboardData {
  userStats: { total: number; todayNew: number; activeCount: number };
  fundStats: { total: number; byType: { type: string; count: number }[] };
  transactionStats: { total: number; buyCount: number; sellCount: number; totalAmount: number };
  holdingStats: { total: number; avgPerUser: number };
  holdingUserStats: { fund_code: string; fund_name: string; user_count: number }[];
}

export interface DbHealthData {
  connectionPool: {
    configuredLimit: number;
    allConnections: number;
    freeConnections: number;
    activeConnections: number;
    queuedRequests: number;
    utilizationPercent: number;
  };
  mysqlThreadsConnected: number | null;
  timestamp: string;
}

export interface UserRow {
  id: number;
  username: string;
  role: 'user' | 'admin';
  created_at: string;
  holding_count: number;
}

export interface FundRow {
  code: string;
  name: string;
  type: string;
}

export interface AnnouncementRow {
  id: number;
  title: string;
  content: string;
  type: 'popup' | 'banner';
  status: 'active' | 'inactive';
  publish_version: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackRow {
  id: number;
  user_id: number;
  username: string;
  content: string;
  screenshot_url: string | null;
  created_at: string;
}

export interface CacheEntry {
  key: string;
  type: string;
  ageSeconds: number;
  ttlSeconds: number;
  remainingSeconds: number;
  expired: boolean;
}

export interface CacheStats {
  stats: {
    hits: number;
    misses: number;
    totalRequests: number;
    hitRate: string;
    size: number;
    maxSize: number;
    evictions: number;
    [k: string]: unknown;
  };
  entries: CacheEntry[];
  typeBreakdown: Record<string, number>;
  recentMisses: { key: string; timestamp: number }[];
}

export interface Paginated<T> { list: T[]; total: number; }

// ─── 接口封装 ───

export const adminService = {
  // 仪表盘
  getDashboard: () => api.get<DashboardData>('/admin/dashboard').then((r) => r.data),
  getDbHealth: () => api.get<DbHealthData>('/admin/health/db').then((r) => r.data),

  // 用户
  listUsers: (params: { page: number; pageSize: number; keyword?: string }) =>
    api.get<Paginated<UserRow>>('/admin/users', { params }).then((r) => r.data),
  createUser: (body: { username: string; password: string; role?: 'user' | 'admin' }) =>
    api.post<{ message: string; id: number }>('/admin/users', body).then((r) => r.data),
  updateUserRole: (id: number, role: 'user' | 'admin') =>
    api.put<{ message: string }>(`/admin/users/${id}/role`, { role }).then((r) => r.data),
  resetPassword: (id: number, password: string) =>
    api.put<{ message: string }>(`/admin/users/${id}/password`, { password }).then((r) => r.data),
  deleteUser: (id: number) =>
    api.delete<{ message: string }>(`/admin/users/${id}`).then((r) => r.data),

  // 基金
  listFunds: (params: { page: number; pageSize: number; keyword?: string; type?: string }) =>
    api.get<Paginated<FundRow>>('/admin/funds', { params }).then((r) => r.data),
  syncFunds: () =>
    api.post<{ total: number; inserted: number }>('/admin/funds/sync').then((r) => r.data),
  deleteFund: (code: string) =>
    api.delete<{ message: string }>(`/admin/funds/${code}`).then((r) => r.data),

  // 公告
  listAnnouncements: (params: { page: number; pageSize: number; keyword?: string; status?: string }) =>
    api.get<Paginated<AnnouncementRow>>('/announcements', { params }).then((r) => r.data),
  createAnnouncement: (body: Partial<AnnouncementRow>) =>
    api.post<{ id: number; message: string }>('/announcements', body).then((r) => r.data),
  updateAnnouncement: (id: number, body: Partial<AnnouncementRow>) =>
    api.put<{ message: string }>(`/announcements/${id}`, body).then((r) => r.data),
  deleteAnnouncement: (id: number) =>
    api.delete<{ message: string }>(`/announcements/${id}`).then((r) => r.data),
  republishAnnouncement: (id: number) =>
    api.post<{ message: string }>(`/announcements/${id}/republish`).then((r) => r.data),

  // 缓存
  getCacheStats: (params: { limit?: number; keyword?: string }) =>
    api.get<CacheStats>('/admin/cache/stats', { params }).then((r) => r.data),
  checkCacheKey: (key: string) =>
    api.get('/admin/cache/check', { params: { key } }).then((r) => r.data),
  clearCache: (key?: string) =>
    api.post<{ message: string }>('/admin/cache/clear', { key }).then((r) => r.data),

  // 反馈
  listFeedbacks: (params: { page: number; pageSize: number; keyword?: string }) =>
    api.get<Paginated<FeedbackRow>>('/admin/feedbacks', { params }).then((r) => r.data),
  deleteFeedback: (id: number) =>
    api.delete<{ message: string }>(`/admin/feedbacks/${id}`).then((r) => r.data),
};
