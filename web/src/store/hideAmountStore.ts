import { create } from 'zustand';

interface HideAmountState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
}

// 读取持久化的「隐藏金额」偏好，若 localStorage 不可用（如隐私模式）则回退为不隐藏。
function getInitialHidden(): boolean {
  try {
    return localStorage.getItem('hide_amount') === 'true';
  } catch {
    return false;
  }
}

// 写入偏好，localStorage 不可用时静默忽略，避免整个 store 崩溃
function persistHidden(hidden: boolean): void {
  try {
    localStorage.setItem('hide_amount', String(hidden));
  } catch {
    /* 隐私模式等场景下忽略写入失败 */
  }
}

export const useHideAmountStore = create<HideAmountState>((set) => ({
  hidden: getInitialHidden(),

  setHidden: (hidden: boolean) => {
    persistHidden(hidden);
    set({ hidden });
  },

  toggle: () => {
    set((state) => {
      const newHidden = !state.hidden;
      persistHidden(newHidden);
      return { hidden: newHidden };
    });
  },
}));
