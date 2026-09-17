import { create } from 'zustand';
import api from '../services/api';

interface AdminUser {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
  restoreSession: () => void;
}

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

function isValidAdmin(user: AdminUser | null): user is AdminUser {
  return !!user && user.role === 'admin';
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isInitialized: true });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
  },

  restoreSession: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (isValidAdmin(user)) {
          set({ token, user, isAuthenticated: true, isInitialized: true });
          return;
        }
      } catch {
        /* 解析失败按未登录处理 */
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
  },
}));

// 登录：复用用户端认证接口，登录后校验角色必须是 admin
export async function loginAdmin(username: string, password: string) {
  const { data } = await api.post<{ token: string; user: AdminUser }>('/auth/login', {
    username,
    password,
  });
  if (!isValidAdmin(data.user)) {
    throw new Error('该账号没有管理员权限');
  }
  useAuthStore.getState().login(data.token, data.user);
  return data.user;
}
