import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

/**
 * primary: 가장 중요한 행동(화면에 하나) / secondary: 연한 브랜드색 면 / neutral: 회색 면
 * tertiary: 글자만 있는 링크형 / danger: 되돌릴 수 없는 행동의 확정 / dangerSoft: 위험하지만 덜 강조할 행동
 */
export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'tertiary' | 'danger' | 'dangerSoft';
export type ButtonSize = 'large' | 'medium' | 'small';

/** 글자가 이 배율보다 크면 버튼의 장식 아이콘을 뺀다 */
const LARGE_TEXT_SCALE = 1.5;

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** false 면 내용 크기만큼만 차지한다 */
  fullWidth?: boolean;
  /** 보이는 글자보다 자세한 이름이 필요할 때 (보이는 글자를 포함해야 한다). 기본은 title */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** 라벨 글자 배율 상한. 화면 높이가 빠듯한 주행 화면처럼 레이아웃 보호가 필요할 때 낮춘다 */
  maxFontScale?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PALETTE: Record<ButtonVariant, { bg: string; pressed: string; fg: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary },
  secondary: { bg: colors.primarySoft, pressed: '#D3EDE7', fg: colors.primaryStrong },
  neutral: { bg: colors.surfaceStrong, pressed: '#D8DCE0', fg: colors.text },
  tertiary: { bg: 'transparent', pressed: 'rgba(25, 31, 40, 0.06)', fg: colors.primaryStrong },
  danger: { bg: colors.danger, pressed: colors.dangerText, fg: colors.onPrimary },
  dangerSoft: { bg: colors.dangerBg, pressed: '#FBD9D6', fg: colors.dangerText },
};

const SIZE: Record<ButtonSize, { minHeight: number; radius: number; px: number; text: 'lead' | 'bodyStrong' | 'captionStrong'; icon: number }> = {
  large: { minHeight: layout.buttonHeight, radius: radius.button, px: space.lg + 4, text: 'lead', icon: 22 },
  medium: { minHeight: layout.minTouch, radius: 14, px: space.lg + 4, text: 'bodyStrong', icon: 20 },
  small: { minHeight: 40, radius: radius.control, px: space.lg, text: 'captionStrong', icon: 18 },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
  maxFontScale,
  style,
  testID,
}: ButtonProps) {
  const fontScale = useFontScale();
  const dims = SIZE[size];
  const iconSize = Math.round(dims.icon * Math.min(Math.max(fontScale, 1), 1.5));
  // 아주 큰 글자에서는 장식용 아이콘이 라벨 공간을 빼앗아 글자가 쪼개지므로 아이콘을 뺀다
  const showIcon = icon !== undefined && fontScale <= LARGE_TEXT_SCALE;
  const palette = PALETTE[variant];
  const inactive = disabled || loading;
  const link = variant === 'tertiary';
  const fg = disabled ? colors.textDisabled : palette.fg;
  // 링크형은 글자 크기를 한 단계 줄이되 누를 영역(48)은 지킨다
  const textVariant = link && size === 'large' ? 'bodyStrong' : dims.text;

  const handlePress = () => {
    if (variant === 'primary' || variant === 'danger') haptics.tap();
    onPress();
  };

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={handlePress}
      pressedScale={link ? 0.98 : 0.97}
      style={[fullWidth ? styles.full : styles.auto, style]}
      contentStyle={({ pressed }) => [
        styles.base,
        {
          minHeight: link ? layout.minTouch : dims.minHeight,
          borderRadius: dims.radius,
          paddingHorizontal: link ? space.lg : dims.px,
          backgroundColor: disabled ? colors.surfaceStrong : pressed ? palette.pressed : palette.bg,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {showIcon && icon ? <Icon name={icon} size={iconSize} color={fg} /> : null}
          <Text variant={textVariant} color={fg} align="center" style={styles.label} maxFontSizeMultiplier={maxFontScale}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  label: { flexShrink: 1 },
});
