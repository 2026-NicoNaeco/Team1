import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 손끝 반응(햅틱). 선택·확인 같은 순간에만 아주 약하게 쓴다. 웹에서는 아무 일도 하지 않고, 실패해도 조용히 넘어간다.
 */
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

const safely = (run: () => Promise<void>) => {
  if (!supported) return;
  run().catch(() => undefined);
};

export const haptics = {
  /** 항목을 고르거나 바꿀 때 */
  selection: () => safely(() => Haptics.selectionAsync()),
  /** 주요 버튼을 누를 때 */
  tap: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** 저장·완료처럼 끝났음을 알릴 때 */
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
