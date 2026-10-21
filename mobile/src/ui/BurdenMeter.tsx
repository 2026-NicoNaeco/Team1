import { StyleSheet, View } from 'react-native';
import type { BurdenLevel } from '../domain/types';
import { colors, radius, space } from '../design/tokens';
import { Text } from './Text';

const LEVEL_LABEL: Record<BurdenLevel, string> = { low: '낮음', medium: '보통', high: '높음' };
const LEVEL_COUNT: Record<BurdenLevel, number> = { low: 1, medium: 2, high: 3 };
/**
 * 낮음·보통·높음을 부드러운 초록·노랑·주황으로 구분하고, 칸 수와 글자로도 함께 알린다.
 * 높음도 붉은색이 아닌 주황이라 불안을 키우지 않는다. (색만으로 구분하지 않는다)
 */
const LEVEL_TONE: Record<BurdenLevel, { fg: string; bg: string }> = {
  low: { fg: colors.success, bg: colors.successBg },
  medium: { fg: colors.caution, bg: colors.cautionBg },
  high: { fg: colors.warn, bg: colors.warnBg },
};

export function burdenLabel(level: BurdenLevel): string {
  return LEVEL_LABEL[level];
}

export function BurdenMeter({ level, compact = false }: { level: BurdenLevel; compact?: boolean }) {
  const count = LEVEL_COUNT[level];
  const tone = LEVEL_TONE[level];
  return (
    <View accessible accessibilityLabel={`예상 운전 부담 ${LEVEL_LABEL[level]}`} style={[styles.pill, { backgroundColor: tone.bg }]}>
      <View style={styles.bars}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.bar, { backgroundColor: n <= count ? tone.fg : 'rgba(25, 31, 40, 0.14)' }]} />
        ))}
      </View>
      {compact ? null : (
        <Text variant="captionStrong" color={tone.fg}>
          예상 운전 부담
        </Text>
      )}
      <Text variant="captionStrong" color={tone.fg}>
        {LEVEL_LABEL[level]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.round,
  },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { width: 14, height: 7, borderRadius: 3.5 },
});
