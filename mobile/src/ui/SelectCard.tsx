import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface SelectCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** single: 라디오 / multi: 체크박스 */
  mode?: 'single' | 'multi';
  leadingIcon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 선택형 카드. 선택 상태는 색뿐 아니라 체크 표시, 굵은 테두리, 접근성 상태로 함께 전달한다.
 * 선택 전에도 라디오/체크박스의 진한 윤곽이 보여서 "고를 수 있는 항목"임을 알 수 있다.
 */
export function SelectCard({ title, description, selected, onPress, mode = 'single', leadingIcon, style, testID }: SelectCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
      accessibilityLabel={description ? `${title} ${description}` : title}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.selected : styles.idle,
        pressed && !selected && styles.pressed,
        style,
      ]}
    >
      {leadingIcon ? (
        <View style={[styles.leading, selected && styles.leadingSelected]}>
          <Icon name={leadingIcon} size={22} color={selected ? colors.primary : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        {description ? (
          <Text variant="caption" color={colors.textSecondary}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.indicator,
          mode === 'single' ? styles.round : styles.square,
          selected ? styles.indicatorOn : styles.indicatorOff,
        ]}
      >
        {selected ? <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    borderWidth: 1.5,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { backgroundColor: colors.surfaceMuted },
  leading: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingSelected: { backgroundColor: colors.surface },
  text: { flex: 1, gap: 2 },
  indicator: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  round: { borderRadius: radius.round },
  square: { borderRadius: 7 },
  indicatorOff: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  indicatorOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});

