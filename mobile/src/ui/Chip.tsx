import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  /** 없으면 누를 수 없는 표시용 칩이다 */
  onPress?: () => void;
  icon?: IconName;
  /** true 면 여러 개를 고를 수 있는 칩(체크박스), 아니면 하나만 고르는 칩(라디오) */
  multi?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 선택 칩. 선택되면 체크 표시와 색이 함께 바뀐다. */
export function Chip({ label, selected = false, onPress, icon, multi = false, style, testID }: ChipProps) {
  const lead = selected ? (
    <Icon name="check" size={16} color={colors.primary} strokeWidth={3} />
  ) : icon ? (
    <Icon name={icon} size={16} color={colors.textSecondary} />
  ) : null;
  const content = (
    <>
      {lead}
      <Text variant="captionStrong" color={selected ? colors.primary : colors.text} style={styles.label}>
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.chip, styles.idle, style]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      aria-checked={selected}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [styles.chip, selected ? styles.selected : styles.idle, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.chip,
    borderWidth: 1.5,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { backgroundColor: colors.surfaceMuted },
  label: { flexShrink: 1 },
});
