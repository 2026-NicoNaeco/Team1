import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface UiState {
  toast: Toast | null;
  showToast: (text: string, tone?: ToastTone) => void;
  dismissToast: () => void;
  /** 개발용: 글자 크기 배율을 강제로 키워 큰 글자에서의 레이아웃을 확인한다 (웹에는 시스템 배율이 없다) */
  devFontScale: number;
  setDevFontScale: (scale: number) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>()((set) => ({
  toast: null,
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastId, text, tone } }),
  dismissToast: () => set({ toast: null }),
  devFontScale: 1,
  setDevFontScale: (scale) => set({ devFontScale: scale }),
}));
