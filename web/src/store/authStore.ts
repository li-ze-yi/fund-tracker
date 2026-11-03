import { create } from 'zustand';
import { resetSession } from '../services/sessionGuard';

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  restoreSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  login: (token, user) => {
    // 先切换到新会话：中止上一账号仍在途的请求，避免其迟到响应污染新会话
    resetSession();
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isInitialized: true });
  },

  setToken: (token) => {
    localStorage.setItem('token', token);
    set({ token });
  },

  // 以服务端返回的身份覆盖本地缓存（应用启动时的身份校准，或令牌身份更新时使用）
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
    // 中止本会话的在途请求：否则其响应可能带回旧 token 或旧账号数据
    resetSession();
  },

  restoreSession: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        // 这里只做本地快速恢复，不在此处校验身份一致性：
        // 本地缓存的 user 仅作为首屏占位，真正的身份以 App 启动后调用 /auth/me
        // 返回的结果为准（见 App.tsx 的身份校准），避免因历史脏数据把用户踢下线。
        set({ token, user, isAuthenticated: true, isInitialized: true });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
      }
    } else {
      set({ isInitialized: true });
    }
  },
}));
