import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { getSessionEpoch, getSessionSignal } from './sessionGuard';

/** 附加到请求配置上的会话标记，非 axios 标准字段 */
interface SessionMeta {
  __sessionEpoch: number;
  __authToken: string | null;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 记录本次请求所属的会话代际与所用 token，供响应续期时校验身份归属
  const meta = config as typeof config & SessionMeta;
  meta.__sessionEpoch = getSessionEpoch();
  meta.__authToken = token;
  // 绑定当前会话的中止信号：登出/切换账号时旧会话的在途请求会被中止
  if (!config.signal) {
    config.signal = getSessionSignal();
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // 滑动续期：后端在 token 剩余有效期不足时，通过 X-Auth-Token 下发新 token
    const renewed = response.headers['x-auth-token'];
    if (renewed) {
      const meta = response.config as typeof response.config & SessionMeta;
      // 仅接受「同一会话内、且本地 token 未被替换」的续期结果。
      // 切换账号后本地 token 已变（或会话代际已递增），此时迟到的续期头属于
      // 上一个账号，必须丢弃，否则会把当前账号的 token 覆盖成上一个账号的。
      const sameSession = meta.__sessionEpoch === getSessionEpoch();
      const tokenUnchanged = Boolean(meta.__authToken) && localStorage.getItem('token') === meta.__authToken;
      if (sameSession && tokenUnchanged) {
        const { setToken } = useAuthStore.getState();
        setToken(renewed);
      }
    }
    return response;
  },
  (error) => {
    // 会话切换导致的中止请求：不做 401 处理，交由调用方按取消处理
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const cfg = error.config as (typeof error.config & SessionMeta) | undefined;
      const url = cfg?.url || '';
      const currentToken = localStorage.getItem('token');

      // 登录/登出接口自身的 401 不参与会话清理：
      // 登出时 token 可能已失效，若在这里清会话会把刚登录的新会话一并带走
      if (url.includes('/auth/login') || url.includes('/auth/logout')) {
        return Promise.reject(error);
      }

      if (!currentToken) {
        // 本地已无 token：会话本就不存在，引导到登录页即可（避免在登录页重复整页跳转）
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // 仅当「发出该请求时所用的 token 仍是当前 token」才判定为当前会话失效。
      // 否则这是上一会话的迟到响应（其 token 已被服务端撤销），必须忽略——
      // 否则一条旧 token 的 401 就会把刚登录成功的新会话杀掉并弹回登录页。
      const isCurrentSession = Boolean(cfg?.__authToken) && cfg!.__authToken === currentToken;
      if (!isCurrentSession) {
        console.warn('[auth] 已忽略陈旧会话的 401 响应:', url);
        return Promise.reject(error);
      }

      // 同时重置 authStore 状态（仅清 localStorage 会残留 isAuthenticated，UI 仍显示已登录）
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
