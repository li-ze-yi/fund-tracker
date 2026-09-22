import { create } from 'zustand';

interface AdminUser {
  id: number;
  username: string;
  role: string;
}

interface AdminStore {
  user: AdminUser | null;
  token: string | null;
  isInitialized: boolean;
  setAuth: (user: AdminUser, token: string) => void;
  logout: () => void;
  restoreSession: () => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  user: null,
  token: null,
  isInitialized: false,
  setAuth: (user, token) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    set({ user, token, isInitialized: true });
  },
  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    set({ user: null, token: null, isInitialized: true });
  },
  restoreSession: () => {
    const token = localStorage.getItem('admin_token');
    const userStr = localStorage.getItem('admin_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          set({ user, token, isInitialized: true });
          return;
        }
      } catch {}
    }
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    set({ user: null, token: null, isInitialized: true });
  },
}));
