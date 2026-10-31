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
  /** 시연 안내를 이번 실행에서 확인했는지. 처음 안내를 시작할 때 한 번만 보여준다 */
  demoNoticeAcknowledged: boolean;
  acknowledgeDemoNotice: () => void;
  /** 개발용 시나리오 도구를 열어 두었는지 (설정의 앱 버전을 여러 번 눌러서 연다) */
  devToolsUnlocked: boolean;
  unlockDevTools: () => void;
}

let toastId = 0;

export const useUiStore = create<UiState>()((set) => ({
  toast: null,
  showToast: (text, tone = 'info') => set({ toast: { id: ++toastId, text, tone } }),
  dismissToast: () => set({ toast: null }),
  devFontScale: 1,
  setDevFontScale: (scale) => set({ devFontScale: scale }),
  demoNoticeAcknowledged: false,
  acknowledgeDemoNotice: () => set({ demoNoticeAcknowledged: true }),
  devToolsUnlocked: false,
  unlockDevTools: () => set({ devToolsUnlocked: true }),
}));
