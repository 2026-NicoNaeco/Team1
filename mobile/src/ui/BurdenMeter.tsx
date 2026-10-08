import { StyleSheet, View } from 'react-native';
import type { BurdenLevel } from '../domain/types';
import { colors, space } from '../design/tokens';
import { Text } from './Text';

const LEVEL_LABEL: Record<BurdenLevel, string> = { low: '낮음', medium: '보통', high: '높음' };
const LEVEL_COUNT: Record<BurdenLevel, number> = { low: 1, medium: 2, high: 3 };
/** 낮음·보통·높음을 같은 색으로 칸 수만 다르게 표시한다. 높음을 붉게 칠해 불안을 키우지 않는다. */
const PIP_ON = '#3F5361';

export function burdenLabel(level: BurdenLevel): string {
  return LEVEL_LABEL[level];
}

export function BurdenMeter({ level }: { level: BurdenLevel }) {
  const count = LEVEL_COUNT[level];
  return (
    <View accessible accessibilityLabel={`예상 운전 부담 ${LEVEL_LABEL[level]}`} style={styles.row}>
      <View style={styles.pips}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.pip, n <= count ? styles.on : styles.off]} />
        ))}
      </View>
      <Text variant="captionStrong" color={colors.textSecondary}>
        예상 운전 부담
      </Text>
      <Text variant="bodyStrong">{LEVEL_LABEL[level]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 16, height: 8, borderRadius: 3 },
  on: { backgroundColor: PIP_ON },
  off: { backgroundColor: colors.border },
});
