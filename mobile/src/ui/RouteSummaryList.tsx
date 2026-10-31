import { StyleSheet, View } from 'react-native';
import { formatMinutes } from '../domain/format';
import type { BurdenLevel } from '../domain/types';
import { colors, radius, space } from '../design/tokens';
import { LetterBadge, RecommendBadge, StatusPill } from './Badges';
import { BurdenMeter, burdenLabel } from './BurdenMeter';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { haptics } from './haptics';

export interface RouteSummaryItem {
  id: string;
  /** 경로 글자 (A, B, C) */
  label: string;
  durationMinutes: number;
  extraMinutes: number;
  burdenLevel: BurdenLevel;
  /** 확인하지 못한 정보가 있어 실제 부담이 더 높을 수 있다 */
  burdenMayBeHigher: boolean;
  isRecommended: boolean;
  withinTimeLimit: boolean;
}

interface RouteSummaryListProps {
  items: RouteSummaryItem[];
  selectedId: string | null;
  onPress: (id: string) => void;
}

/**
 * 경로 비교 요약: 경로마다 한 줄에 시간·추가 시간·예상 운전 부담을 나란히 둔다.
 * 카드 한 장이 화면의 절반을 차지해서 세 경로를 한눈에 견주기 어려운 것을 보완한다.
 * 줄을 누르면 그 경로를 고르고, 부모가 그 경로의 카드로 스크롤한다.
 */
export function RouteSummaryList({ items, selectedId, onPress }: RouteSummaryListProps) {
  return (
    <View style={styles.list}>
      {items.map((it) => {
        const selected = it.id === selectedId;
        const extra = it.extraMinutes > 0 ? `+${it.extraMinutes}분` : '가장 빠름';
        const label = [
          `${it.label} 경로`,
          formatMinutes(it.durationMinutes),
          it.extraMinutes > 0 ? `빠른 경로보다 ${it.extraMinutes}분 더` : '가장 빠름',
          `예상 운전 부담 ${burdenLabel(it.burdenLevel, it.burdenMayBeHigher)}`,
          it.isRecommended ? '맞춤 추천' : null,
          it.withinTimeLimit ? null : '허용 시간 초과',
          selected ? '선택됨' : null,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <PressableScale
            key={it.id}
            testID={`summary-${it.label}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="누르면 이 경로를 고르고 자세한 카드로 이동해요"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => {
              if (!selected) haptics.selection();
              onPress(it.id);
            }}
            pressedScale={0.98}
            contentStyle={({ pressed }) => [styles.row, selected ? styles.rowOn : pressed ? styles.rowPressed : styles.rowOff]}
          >
            <LetterBadge letter={it.label} selected={selected} size={28} />
            {/* 시간은 줄어들지 않는다. 폭이 모자라면 시간이 쪼개지는 대신 부담 표시가 다음 줄로 내려간다 */}
            <View style={styles.main}>
              <View style={styles.time}>
                <Text variant="bodyStrong">{formatMinutes(it.durationMinutes)}</Text>
                <Text variant="caption" color={it.extraMinutes > 0 ? colors.textSecondary : colors.primaryStrong}>
                  {extra}
                </Text>
              </View>
              {it.isRecommended || !it.withinTimeLimit ? (
                <View style={styles.badges}>
                  {it.isRecommended ? <RecommendBadge /> : null}
                  {it.withinTimeLimit ? null : <StatusPill label="허용 시간 초과" tone="caution" />}
                </View>
              ) : null}
            </View>
            <View>
              <BurdenMeter level={it.burdenLevel} mayBeHigher={it.burdenMayBeHigher} compact />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs + 2 },
  // 선택해도 크기가 흔들리지 않도록 테두리 두께를 항상 같게 둔다 (경로 카드와 같은 규칙)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: space.sm,
    rowGap: space.xs,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control + 2,
    borderWidth: 2,
  },
  rowOff: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  rowPressed: { backgroundColor: colors.surfaceStrong, borderColor: colors.surfaceStrong },
  rowOn: { backgroundColor: colors.primarySofter, borderColor: colors.primary },
  main: { flexGrow: 1, flexShrink: 0, gap: space.xs },
  time: { flexDirection: 'row', alignItems: 'baseline', columnGap: space.sm },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
