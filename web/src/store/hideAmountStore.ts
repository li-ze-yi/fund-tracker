import { create } from 'zustand';

interface HideAmountState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
}

export const useHideAmountStore = create<HideAmountState>((set) => ({
  hidden: localStorage.getItem('hide_amount') === 'true',

  setHidden: (hidden: boolean) => {
    localStorage.setItem('hide_amount', String(hidden));
    set({ hidden });
  },

  toggle: () => {
    set((state) => {
      const newHidden = !state.hidden;
      localStorage.setItem('hide_amount', String(newHidden));
      return { hidden: newHidden };
    });
  },
}));
