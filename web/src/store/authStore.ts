import { create } from 'zustand';
import { resetSession } from '../services/sessionGuard';

interface AuthUser {
  id: number;
  username: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  logout: () => void;
  restoreSession: () => void;
}

/**
 * 解码 JWT 载荷（仅取 payload 做客户端身份一致性校验，不做签名校验）。
 * 解码失败返回 null，交由调用方按「无法校验」处理，避免误清合法会话。
 */
function decodeTokenPayload(token: string): { id?: number } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
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
        // 身份一致性校验：token 与 user 必须属于同一账号。
        // 若不一致，说明本地会话曾被上一账号的迟到续期覆盖，清空强制重新登录，
        // 避免出现「用户名是用户二、数据却是用户一」的混合状态。
        const payload = decodeTokenPayload(token);
        if (payload?.id && user?.id && payload.id !== user.id) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
          return;
        }
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
