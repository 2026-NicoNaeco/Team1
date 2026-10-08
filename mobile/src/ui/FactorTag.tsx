import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { FACTORS } from '../domain/factors';
import { factorSummary, type FactorState } from '../domain/format';
import type { FactorCode, Measurement } from '../domain/types';
import { colors, radius, space } from '../design/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface FactorTagProps {
  code: FactorCode;
  measurement: Measurement;
  style?: StyleProp<ViewStyle>;
}

/**
 * 운전 요소 한 항목. 상태를 색뿐 아니라 모양과 문구로도 구분한다.
 * - 있음: 회색 면 + 요소 아이콘 / 없음(확인함): 연한 초록 + 체크 / 일부 확인·정보 없음: 점선 + 물음표
 */
export function FactorTag({ code, measurement, style }: FactorTagProps) {
  const { text, state } = factorSummary(code, measurement);
  const icon: IconName =
    state === 'none' ? 'check' : state === 'unknown' || state === 'partial' ? 'help' : (FACTORS[code].icon as IconName);
  const fg = state === 'none' ? colors.success : state === 'present' ? colors.text : colors.textSecondary;
  return (
    <View accessible accessibilityLabel={text} style={[styles.tag, STATE_STYLE[state], style]}>
      <Icon name={icon} size={16} color={fg} strokeWidth={state === 'none' ? 3 : 2} />
      <Text variant="caption" color={fg} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const STATE_STYLE: Record<FactorState, ViewStyle> = {
  present: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  none: { backgroundColor: colors.successBg, borderColor: colors.successBg },
  partial: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  unknown: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderStyle: 'dashed' },
};

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 3,
    borderRadius: radius.round,
    borderWidth: 1,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  text: { flexShrink: 1 },
});
