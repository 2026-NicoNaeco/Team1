import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, space } from '../design/tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface ScreenProps {
  children: ReactNode;
  /** 상단 상태바 영역을 비워 둘지 (지도처럼 화면 끝까지 그리는 경우 false) */
  topInset?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({ children, topInset = true, background = colors.bg, style, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.screen, { backgroundColor: background, paddingTop: topInset ? insets.top : 0 }, style]}>
      {children}
    </View>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  /** large: 탭 첫 화면의 큰 제목 / compact: 이동한 화면의 상단 바 */
  size?: 'large' | 'compact';
}

export function ScreenHeader({ title, subtitle, onBack, backLabel = '뒤로 가기', right, size = 'compact' }: ScreenHeaderProps) {
  const large = size === 'large';
  return (
    <View style={[styles.header, large && styles.headerLarge]}>
      {!large || onBack || right ? (
      <View style={styles.headerRow}>
        {onBack ? <IconButton icon="back" label={backLabel} onPress={onBack} style={styles.back} /> : null}
        {!large ? (
          <Text variant="heading" style={styles.title} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={styles.title} />
        )}
        {right}
      </View>
      ) : null}
      {large ? (
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="caption" color={colors.textSecondary}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** 화면 아래에 고정되는 행동 영역. 본문과 겹치지 않도록 열(column) 배치의 마지막 요소로 둔다. */
export function ActionBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, space.md) }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: layout.screenX - 8, paddingBottom: space.sm, gap: space.xs },
  headerLarge: { paddingHorizontal: layout.screenX, paddingTop: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: layout.minTouch },
  back: { marginRight: space.xs },
  title: { flex: 1 },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.md,
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
});
