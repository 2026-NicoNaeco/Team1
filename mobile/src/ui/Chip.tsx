import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

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

/** 선택 칩. 선택되면 색이 채워지고 체크 표시가 붙는다. */
export function Chip({ label, selected = false, onPress, icon, multi = false, style, testID }: ChipProps) {
  const fg = selected ? colors.onPrimary : colors.text;
  const lead = selected ? (
    <Icon name="check" size={16} color={fg} strokeWidth={3} />
  ) : icon ? (
    <Icon name={icon} size={16} color={colors.textSecondary} />
  ) : null;
  const content = (
    <>
      {lead}
      <Text variant="captionStrong" color={fg} style={styles.label}>
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
    <PressableScale
      testID={testID}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      aria-checked={selected}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      pressedScale={0.95}
      hitSlop={{ top: 2, bottom: 2 }}
      style={style}
      contentStyle={({ pressed }) => [styles.chip, selected ? styles.selected : pressed ? styles.idlePressed : styles.idle]}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.round,
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  idlePressed: { backgroundColor: colors.surfaceStrong, borderColor: colors.border },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flexShrink: 1 },
});
