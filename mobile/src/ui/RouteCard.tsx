import { Pressable, StyleSheet, View } from 'react-native';
import { formatDistance, formatExtra, formatMinutes, formatWon } from '../domain/format';
import type { RankedRoute, RouteCandidate, TradeoffItem, TradeoffKind } from '../domain/types';
import { colors, radius, space } from '../design/tokens';
import { LetterBadge, RecommendBadge, SelectedMark } from './Badges';
import { BurdenMeter } from './BurdenMeter';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface RouteCardProps {
  route: RouteCandidate;
  ranked: RankedRoute;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

const TRADEOFF_ICON: Record<TradeoffKind, IconName> = {
  over_limit: 'clock',
  extra_time: 'clock',
  toll: 'toll',
  preference_mismatch: 'road',
  more: 'turn',
  protected_zone: 'zone',
  accident_zone: 'accident',
  unknown_info: 'help',
};

/** 카드에 한 줄로 보여줄 확인할 점: 헤더에 이미 있는 추가 시간은 다른 항목이 없을 때만 쓴다 */
export function pickCardTradeoff(tradeoffs: TradeoffItem[]): { item: TradeoffItem; extraCount: number } | null {
  const item = tradeoffs.find((t) => t.kind !== 'extra_time') ?? tradeoffs[0];
  if (!item) return null;
  return { item, extraCount: tradeoffs.length - 1 };
}

/**
 * 경로 비교 카드. 정보 순서:
 * 1) 특징·추천 여부  2) 소요 시간과 추가 시간  3) 부담 수준과 줄어드는 이유  4) 거리·통행료  5) 감수할 점
 * "맞춤 추천"(설정에 따른 추천)과 "선택됨"(지금 고른 경로)은 서로 다른 표시다.
 */
export function RouteCard({ route, ranked, selected, onPress, testID }: RouteCardProps) {
  const tradeoff = pickCardTradeoff(ranked.tradeoffs);
  const toll = route.toll.availability === 'known' ? (route.toll.won > 0 ? `통행료 ${formatWon(route.toll.won)}` : '통행료 없음') : '통행료 정보 없음';
  const summary = `${route.label} 경로 ${ranked.headline}. ${formatMinutes(ranked.durationMinutes)}, ${formatExtra(ranked.extraMinutes)}. 예상 운전 부담 ${
    { low: '낮음', medium: '보통', high: '높음' }[ranked.burdenLevel]
  }.${ranked.isRecommended ? ' 맞춤 추천.' : ''}${selected ? ' 현재 선택됨.' : ''}`;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={summary}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected ? styles.selected : styles.idle, pressed && !selected && styles.pressed]}
    >
      <View style={styles.titleRow}>
        <LetterBadge letter={route.label} selected={selected} />
        <View style={styles.titleText}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {ranked.headline}
          </Text>
          <View style={styles.badges}>
            {ranked.isRecommended ? <RecommendBadge /> : null}
            {!ranked.withinTimeLimit ? (
              <View style={styles.overLimit}>
                <Text variant="captionStrong" color={colors.caution}>
                  허용 시간 초과
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {selected ? <SelectedMark /> : null}
      </View>

      <View style={styles.timeRow}>
        <Text variant="metric">{formatMinutes(ranked.durationMinutes)}</Text>
        <Text variant="bodyStrong" color={ranked.extraMinutes > 0 ? colors.text : colors.primary} style={styles.extra}>
          {formatExtra(ranked.extraMinutes)}
        </Text>
      </View>

      <View style={styles.burden}>
        <BurdenMeter level={ranked.burdenLevel} />
        {ranked.burdenDrivers.length > 0 ? (
          <Text variant="caption" color={colors.textSecondary}>
            주된 요소: {ranked.burdenDrivers.map((d) => d.text).join(' · ')}
            {ranked.hasMissingInfo ? ' · 일부 정보 없음' : ''}
          </Text>
        ) : ranked.hasMissingInfo ? (
          <Text variant="caption" color={colors.textSecondary}>
            일부 정보 없음
          </Text>
        ) : null}
      </View>

      <View style={styles.reasons}>
        {ranked.reasons.map((reason) => (
          <View key={reason.id} style={styles.reasonRow}>
            <View style={styles.reasonIcon}>
              <Icon name="check" size={18} color={colors.primary} strokeWidth={3} />
            </View>
            <Text variant="body" style={styles.reasonText}>
              {reason.text}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" color={colors.textSecondary}>
        {formatDistance(route.distanceM)} · {toll} · {route.via}
      </Text>

      {tradeoff ? (
        <View style={[styles.tradeoff, tradeoff.item.kind === 'over_limit' ? styles.tradeoffCaution : tradeoff.item.kind === 'unknown_info' ? styles.tradeoffUnknown : styles.tradeoffNeutral]}>
          <Icon name={TRADEOFF_ICON[tradeoff.item.kind]} size={18} color={tradeoff.item.kind === 'over_limit' ? colors.caution : colors.textSecondary} />
          <Text variant="caption" color={tradeoff.item.kind === 'over_limit' ? colors.caution : colors.text} style={styles.tradeoffText}>
            <Text variant="captionStrong" color={tradeoff.item.kind === 'over_limit' ? colors.caution : colors.text}>
              {tradeoff.item.kind === 'extra_time' || tradeoff.item.kind === 'toll' || tradeoff.item.kind === 'over_limit' ? '감수할 점  ' : '확인할 점  '}
            </Text>
            {tradeoff.item.text}
            {tradeoff.extraCount > 0 ? `  · 외 ${tradeoff.extraCount}건` : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1.5, padding: space.lg, gap: space.md },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  selected: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 2.5 },
  pressed: { backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  titleText: { flex: 1, gap: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  overLimit: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.cautionBg,
    borderWidth: 1,
    borderColor: colors.cautionBorder,
  },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.md },
  extra: { flexShrink: 1 },
  burden: { gap: 2 },
  reasons: { gap: space.xs + 2 },
  reasonRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  reasonIcon: { paddingTop: 3 },
  reasonText: { flex: 1 },
  tradeoff: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.control },
  tradeoffNeutral: { backgroundColor: colors.surfaceMuted },
  tradeoffCaution: { backgroundColor: colors.cautionBg },
  tradeoffUnknown: { backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  tradeoffText: { flex: 1 },
});
