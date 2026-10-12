import { create } from 'zustand';
import { flushSync } from 'react-dom';

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

type DocumentWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };

/**
 * 应用主题并保证切换过程平滑：
 * 1) 支持 View Transitions 的浏览器：整体交叉淡入（渐变背景、毛玻璃等无法用 CSS 过渡的属性也能平滑切换）。
 *    必须用 flushSync 把 React 的更新（antd 主题令牌来自 store.mode）一起挤进过渡回调里同步提交，
 *    否则 antd 相关样式会在过渡结束之后才突变。
 * 2) 不支持时兜底：给 <html> 挂 .theme-switching，靠 CSS 逐属性过渡（见 App.css），过渡结束后移除。
 */
function commitTheme(mode: ThemeMode, set: (partial: Pick<ThemeState, 'mode'>) => void) {
  const root = document.documentElement;
  const doc = document as DocumentWithVT;
  const apply = () => {
    root.setAttribute('data-theme', mode);
    set({ mode });
  };

  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      flushSync(apply);
    });
  } else {
    root.classList.add('theme-switching');
    apply();
    window.setTimeout(() => root.classList.remove('theme-switching'), 420);
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: getInitialMode(),

  setMode: (mode) => {
    localStorage.setItem('theme_mode', mode);
    commitTheme(mode, set);
  },

  toggleMode: () => {
    const newMode: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme_mode', newMode);
    commitTheme(newMode, set);
  },
}));