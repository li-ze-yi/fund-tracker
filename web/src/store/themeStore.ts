import { create } from 'zustand';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (localStorage.getItem('theme_mode') as ThemeMode) || 'light',

  setMode: (mode: ThemeMode) => {
    localStorage.setItem('theme_mode', mode);
    document.documentElement.setAttribute('data-theme', mode);
    set({ mode });
  },

  toggleMode: () => {
    set((state) => {
      const newMode = state.mode === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme_mode', newMode);
      document.documentElement.setAttribute('data-theme', newMode);
      return { mode: newMode };
    });
  },
}));
