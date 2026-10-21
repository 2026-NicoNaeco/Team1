import { StyleSheet, View } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

interface PlaceRowProps {
  name: string;
  /** 이름 아래의 한 줄 설명 (분류·거리 등) */
  subtitle?: string;
  address?: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  /** card: 회색 바탕 위의 흰 카드 / plain: 흰 시트 위에 바로 놓는 가벼운 줄 */
  variant?: 'card' | 'plain';
  accessibilityHint?: string;
  testID?: string;
}

/** 장소 한 줄. 홈의 추천 장소와 검색 결과가 같은 모양을 쓴다. */
export function PlaceRow({ name, subtitle, address, icon = 'pin', onPress, disabled = false, variant = 'card', accessibilityHint, testID }: PlaceRowProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      aria-disabled={disabled}
      accessibilityHint={disabled ? undefined : accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.98}
      contentStyle={({ pressed }) => [styles.row, variant === 'plain' ? styles.plain : styles.card, pressed && (variant === 'plain' ? styles.plainPressed : styles.pressed), disabled && styles.disabled]}
    >
      <View style={[styles.icon, disabled && styles.iconDisabled]}>
        <Icon name={icon} size={20} color={disabled ? colors.textDisabled : colors.primaryStrong} />
      </View>
      <View style={styles.text}>
        <Text variant="lead" numberOfLines={2} color={disabled ? colors.textDisabled : colors.text}>
          {name}
        </Text>
        {address ? (
          <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color={colors.textTertiary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {disabled ? null : <Icon name="chevron-right" size={20} color={colors.textTertiary} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingVertical: space.md,
    paddingHorizontal: layout.cardPad - 4,
    borderRadius: radius.card,
  },
  card: { backgroundColor: colors.surface },
  plain: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  plainPressed: { backgroundColor: colors.surfaceMuted },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { backgroundColor: colors.surfaceMuted },
  icon: { width: 44, height: 44, borderRadius: radius.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  iconDisabled: { backgroundColor: colors.surfaceStrong },
  text: { flex: 1, gap: 2 },
});
