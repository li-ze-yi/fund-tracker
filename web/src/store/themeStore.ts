import { create } from 'zustand';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

// 以用户持久化的偏好（localStorage）为唯一来源，保证图标始终反映用户选择的主题。
// 若读取失败（如隐私模式/localStorage 不可用）则回退到深色。
// 初始化时同步把 data-theme 应用到 <html>，即使 index.html 的内联脚本被缓存/未生效，
// 也能保证界面主题与图标（store.mode）一致。
function getInitialMode(): ThemeMode {
  let mode: ThemeMode = 'dark';
  try {
    const stored = localStorage.getItem('theme_mode');
    mode = stored === 'light' ? 'light' : 'dark';
  } catch {
    mode = 'dark';
  }
  document.documentElement.setAttribute('data-theme', mode);
  return mode;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: getInitialMode(),

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
