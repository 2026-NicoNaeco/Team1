import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius } from '../design/tokens';
import { PressableScale } from './PressableScale';

type CardTone = 'default' | 'muted' | 'tint' | 'caution';

const TONE_BG: Record<CardTone, string> = {
  default: colors.surface,
  muted: colors.surfaceMuted,
  tint: colors.primarySofter,
  caution: colors.cautionBg,
};

interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  /** 안쪽 여백을 없애면 목록처럼 가장자리까지 채운다 */
  padded?: boolean;
  /** 있으면 눌러서 쓰는 카드가 된다 */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 흰 바탕의 둥근 카드. 그림자 없이 회색 배경과의 색 차이로만 구분한다. */
export function Card({ children, tone = 'default', padded = true, onPress, accessibilityLabel, accessibilityHint, style, testID }: CardProps) {
  const base = [styles.card, { backgroundColor: TONE_BG[tone] }, padded && styles.padded];
  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      pressedScale={0.985}
      style={style}
      contentStyle={({ pressed }) => [base, pressed && styles.pressed]}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden' },
  padded: { padding: layout.cardPad },
  pressed: { backgroundColor: colors.surfaceMuted },
});
