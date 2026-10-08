import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

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
    <PressableScale
      testID={testID}
      accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
      accessibilityLabel={description ? `${title} ${description}` : title}
      aria-checked={selected}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      pressedScale={0.98}
      style={style}
      contentStyle={({ pressed }) => [styles.card, selected ? styles.selected : pressed ? styles.pressed : styles.idle]}
    >
      {leadingIcon ? (
        <View style={[styles.leading, selected && styles.leadingSelected]}>
          <Icon name={leadingIcon} size={22} color={selected ? colors.onPrimary : colors.primaryStrong} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="lead">{title}</Text>
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
        {selected ? <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3.2} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg + 4,
    borderRadius: radius.card,
    // 선택해도 크기가 흔들리지 않도록 테두리 두께를 항상 같게 둔다
    borderWidth: 2,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.surface },
  pressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  selected: { backgroundColor: colors.primarySofter, borderColor: colors.primary },
  leading: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingSelected: { backgroundColor: colors.primary },
  text: { flex: 1, gap: 2 },
  indicator: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  round: { borderRadius: radius.round },
  square: { borderRadius: 8 },
  indicatorOff: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  indicatorOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});
