import { create } from 'zustand';
import { resetSession } from '../services/sessionGuard';

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
  created_at: string;
}

/**
 * 解析 JWT 载荷（不校验签名），仅用于读取 exp。
 * 解析失败返回 null —— 调用方应把「无法解析」当作「不做过期判定」，避免误清合法会话。
 */
function decodePayload(token: string): { exp?: number } | null {
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

/** 凭证过期时间（毫秒时间戳），无法解析返回 null */
export function getTokenExpiry(token: string | null): number | null {
  if (!token) return null;
  const payload = decodePayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
}

/** 凭证是否已过期（无法解析时返回 false，交给服务端判定） */
export function isTokenExpired(token: string | null): boolean {
  const expiry = getTokenExpiry(token);
  if (expiry === null) return false;
  return expiry <= Date.now();
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
    // 回读校验：WebView 存储偶发写入失败时能兜住并重写一次
    if (localStorage.getItem('token') !== token) {
      localStorage.removeItem('token');
      localStorage.setItem('token', token);
    }
    const expiry = getTokenExpiry(token);
    console.info('[auth] 登录成功，凭证过期时间:', expiry ? new Date(expiry).toLocaleString() : '未知');
    set({ token, user, isAuthenticated: true, isInitialized: true });
  },

  setToken: (token) => {
    localStorage.setItem('token', token);
    if (localStorage.getItem('token') !== token) {
      localStorage.removeItem('token');
      localStorage.setItem('token', token);
    }
    const expiry = getTokenExpiry(token);
    console.info('[auth] 凭证已续期，新过期时间:', expiry ? new Date(expiry).toLocaleString() : '未知');
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
      // 启动即校验过期：覆盖安装可能残留旧凭证，若已过期必须主动清掉，
      // 否则会带着它进入应用，直到某个认证接口返回 401 才被踢出。
      if (isTokenExpired(token)) {
        console.warn('[auth] 本地凭证已过期，已清除并回到登录页');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
        return;
      }
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
