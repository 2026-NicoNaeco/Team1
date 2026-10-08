import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, shadow, space } from '../design/tokens';
import { useUiStore } from '../state/uiStore';
import { Icon } from './Icon';
import { Text } from './Text';

/** 글자 수에 비례해 읽을 시간을 준다 (최소 3초, 최대 7초) */
function durationFor(text: string): number {
  return Math.min(7000, 3000 + text.length * 50);
}

/**
 * 화면 위쪽에 잠깐 떠서 결과를 알려주는 어두운 알림.
 * 터치를 가로채지 않는다(아래의 뒤로 가기·검색창이 그대로 눌린다). 스크린리더에는 live region 으로 읽어준다.
 */
export function ToastHost() {
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, durationFor(toast.text));
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <View style={[styles.host, { top: insets.top + space.sm }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={toast.text}
        style={[styles.toast, shadow.floating]}
        testID="toast"
      >
        <Icon
          name={error ? 'alert-circle' : toast.tone === 'success' ? 'check-circle' : 'info'}
          size={20}
          color={error ? '#FF9A93' : '#7FDCCB'}
        />
        <Text variant="captionStrong" style={styles.text} color={colors.onInverse}>
          {toast.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    zIndex: 100,
    pointerEvents: 'none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.minTouch,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.field,
    backgroundColor: colors.inverse,
    maxWidth: 480,
  },
  text: { flexShrink: 1 },
});
