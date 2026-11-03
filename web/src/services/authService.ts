import api from './api';

export interface AuthResponse {
  token: string;
  user: { id: number; username: string; created_at: string };
}

export const authService = {
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }).then((r) => r.data),

  register: (username: string, password: string, confirmPassword: string) =>
    api.post<AuthResponse>('/auth/register', { username, password, confirmPassword }).then((r) => r.data),

  getMe: () => api.get('/auth/me').then((r) => r.data),

  // 登出：通知服务端把当前 token 加入撤销名单（限时 3s，网络异常不阻塞本地登出）
  logout: () => api.post('/auth/logout', null, { timeout: 3000 }).then((r) => r.data),
};