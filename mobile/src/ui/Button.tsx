import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { useFontScale } from '../hooks/useFontScale';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

/** 글자가 이 배율보다 크면 버튼의 장식 아이콘을 뺀다 */
const LARGE_TEXT_SCALE = 1.5;

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** false 면 내용 크기만큼만 차지한다 */
  fullWidth?: boolean;
  accessibilityHint?: string;
  /** 라벨 글자 배율 상한. 화면 높이가 빠듯한 주행 화면처럼 레이아웃 보호가 필요할 때 낮춘다 */
  maxFontScale?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PALETTE: Record<
  ButtonVariant,
  { bg: string; pressed: string; fg: string; border: string }
> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, pressed: colors.primarySoft, fg: colors.primary, border: colors.primary },
  tertiary: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, pressed: colors.dangerBg, fg: colors.danger, border: colors.danger },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityHint,
  maxFontScale,
  style,
  testID,
}: ButtonProps) {
  const fontScale = useFontScale();
  const iconSize = Math.round(20 * Math.min(Math.max(fontScale, 1), 1.5));
  // 아주 큰 글자에서는 장식용 아이콘이 라벨 공간을 빼앗아 글자가 쪼개지므로 아이콘을 뺀다
  const showIcon = icon !== undefined && fontScale <= LARGE_TEXT_SCALE;
  const palette = PALETTE[variant];
  const inactive = disabled || loading;
  const compact = variant === 'tertiary';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        fullWidth ? styles.full : styles.auto,
        {
          backgroundColor: disabled ? colors.surfaceMuted : pressed ? palette.pressed : palette.bg,
          borderColor: disabled ? colors.surfaceMuted : palette.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {showIcon && icon ? <Icon name={icon} size={iconSize} color={disabled ? colors.textDisabled : palette.fg} /> : null}
          <Text
            variant="bodyStrong"
            color={disabled ? colors.textDisabled : palette.fg}
            align="center"
            style={styles.label}
            maxFontSizeMultiplier={maxFontScale}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  regular: { minHeight: layout.buttonHeight, paddingVertical: space.sm },
  compact: { minHeight: layout.minTouch, paddingHorizontal: space.lg },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  label: { flexShrink: 1 },
});
