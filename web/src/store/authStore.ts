import { create } from 'zustand';

interface AuthState {
  token: string | null;
  user: { id: number; username: string; created_at: string } | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (token: string, user: { id: number; username: string; created_at: string }) => void;
  logout: () => void;
  restoreSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isInitialized: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false, isInitialized: true });
  },

  restoreSession: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
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
