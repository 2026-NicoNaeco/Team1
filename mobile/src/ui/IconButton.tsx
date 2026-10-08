import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, shadow } from '../design/tokens';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  /** 아이콘만 있는 버튼이므로 동작을 설명하는 라벨이 반드시 필요하다 */
  label: string;
  onPress: () => void;
  /** floating: 지도 위에 떠 있는 흰 버튼 / filled: 약한 면 / plain: 배경 없음 */
  variant?: 'floating' | 'filled' | 'plain';
  size?: number;
  iconColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  size = layout.minTouch,
  iconColor = colors.text,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === 'floating' && [styles.floating, shadow.floating],
        variant === 'filled' && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={icon} size={24} color={disabled ? colors.textDisabled : iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  floating: { backgroundColor: colors.surface },
  filled: { backgroundColor: colors.surfaceMuted },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.6 },
});
