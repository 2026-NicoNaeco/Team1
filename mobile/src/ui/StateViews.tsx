import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface Action {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary';
}

interface StateProps {
  icon: IconName;
  title: string;
  message?: string;
  actions?: Action[];
  tone?: 'neutral' | 'error';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 빈 화면·오류 화면. 어떤 경우든 사용자가 다음에 할 수 있는 행동(actions)을 함께 준다.
 * 빈 상태는 중립, 오류는 오류 색으로 구분한다.
 */
export function StateView({ icon, title, message, actions = [], tone = 'neutral', style, testID }: StateProps) {
  const error = tone === 'error';
  return (
    <View testID={testID} style={[styles.wrap, style]} accessibilityRole={error ? 'alert' : undefined}>
      <View style={[styles.iconBox, error ? styles.iconError : styles.iconNeutral]}>
        <Icon name={icon} size={28} color={error ? colors.danger : colors.textSecondary} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={colors.textSecondary} align="center">
          {message}
        </Text>
      ) : null}
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Button key={a.label} title={a.label} onPress={a.onPress} variant={a.variant ?? (i === 0 ? 'primary' : 'secondary')} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 진행 중임을 알리는 로딩 표시. 실제로 하지 않는 분석을 연출하지 않고 하는 일만 적는다. */
export function LoadingView({ message, style }: { message: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loading, style]} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="caption" color={colors.textSecondary}>
        {message}
      </Text>
    </View>
  );
}

/** 자리만 잡아 주는 정적 스켈레톤 (움직이지 않는다) */
export function SkeletonBlock({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeleton, { height }, style]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenX, paddingVertical: space.xl },
  iconBox: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  iconNeutral: { backgroundColor: colors.surfaceMuted },
  iconError: { backgroundColor: colors.dangerBg },
  actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
  skeleton: { backgroundColor: colors.surfaceMuted, borderRadius: radius.card },
});
