import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
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
 * 빈 상태는 브랜드색, 오류는 오류 색의 동그라미 아이콘으로 구분한다.
 */
export function StateView({ icon, title, message, actions = [], tone = 'neutral', style, testID }: StateProps) {
  const error = tone === 'error';
  return (
    <View testID={testID} style={[styles.wrap, style]} accessibilityRole={error ? 'alert' : undefined}>
      <View style={[styles.ring, error ? styles.ringError : styles.ringNeutral]}>
        <View style={[styles.iconBox, error ? styles.iconError : styles.iconNeutral]}>
          <Icon name={icon} size={30} color={error ? colors.dangerText : colors.primaryStrong} />
        </View>
      </View>
      <View style={styles.texts}>
        <Text variant="title2" align="center">
          {title}
        </Text>
        {message ? (
          <Text variant="body" color={colors.textSecondary} align="center">
            {message}
          </Text>
        ) : null}
      </View>
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

/** 목표 지점(0~1)까지 감속하며 채우는 로딩 막대. 모션 줄이기를 켜면 바로 그 지점으로 옮긴다. */
export function LoadingBar({ message, progress, durationMs, style }: { message: string; progress: number; durationMs: number; style?: StyleProp<ViewStyle> }) {
  const reducedMotion = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(value, { toValue: progress, duration: reducedMotion ? 0 : durationMs, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [value, progress, durationMs, reducedMotion]);
  const width = value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.bar, style]} accessibilityRole="progressbar" accessibilityLabel={message}>
      <Text variant="caption" color={colors.textSecondary} align="center">
        {message}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width }]} />
      </View>
    </View>
  );
}

/** 자리를 잡아 주는 스켈레톤. 천천히 깜빡이며, 모션 줄이기를 켜면 멈춘다. */
export function SkeletonBlock({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);
  return <Animated.View aria-hidden style={[styles.skeleton, { height, opacity }, style]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xl, paddingHorizontal: layout.screenX, paddingVertical: space.xxl },
  ring: { width: 108, height: 108, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  ringNeutral: { backgroundColor: colors.primarySofter },
  ringError: { backgroundColor: colors.dangerBg },
  iconBox: { width: 72, height: 72, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  iconNeutral: { backgroundColor: colors.primarySoft },
  iconError: { backgroundColor: '#FBD9D6' },
  texts: { gap: space.sm, alignItems: 'center' },
  actions: { alignSelf: 'stretch', gap: space.sm },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
  bar: { gap: space.sm },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  skeleton: { backgroundColor: colors.surfaceStrong, borderRadius: radius.card },
});
