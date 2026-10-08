import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { FACTOR_ORDER, FACTORS, tagLabel } from '../domain/factors';
import { RATING_LABEL, formatDateTime, formatDistance, formatFactorValue, formatMinutes } from '../domain/format';
import type { FactorCode, SimulationRecord } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { TabScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { DemoBadge, LetterBadge } from '../ui/Badges';
import { Screen, ScreenHeader } from '../ui/Screen';
import { StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';

/** 기록에 남은 요소 중 있었던(0보다 큰) 것 최대 3개를 문구로 */
export function recordFactorText(record: SimulationRecord, limit = 3): string {
  const parts: string[] = [];
  for (const code of FACTOR_ORDER as FactorCode[]) {
    const f = record.route.factors[code];
    if (!f || f.availability === 'unknown' || f.value === null || f.value <= 0) continue;
    if (!FACTORS[code].scored) continue;
    parts.push(`${tagLabel(code)} ${formatFactorValue(code, f.value)}`);
  }
  return parts.slice(0, limit).join(' · ');
}

function RecordCard({ record, onPress }: { record: SimulationRecord; onPress: () => void }) {
  const factorText = recordFactorText(record);
  const rating = record.feedback ? RATING_LABEL[record.feedback.rating] : null;
  const outcome = record.outcome === 'arrived' ? '도착' : `중도 종료 ${Math.round(record.progress * 100)}%`;
  return (
    <Pressable
      testID={`record-${record.id}`}
      accessibilityRole="button"
      accessibilityHint="누르면 기록 상세를 봐요"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Text variant="caption" color={colors.textSecondary}>
          {formatDateTime(record.createdAt)}
        </Text>
        <DemoBadge label="시뮬레이션" />
      </View>
      <Text variant="bodyStrong" numberOfLines={2}>
        {record.destination.name}
      </Text>
      <View style={styles.routeRow}>
        <LetterBadge letter={record.route.label} size={26} />
        <Text variant="caption" color={colors.textSecondary} style={styles.flex} numberOfLines={2}>
          {record.route.headline} · {formatMinutes(record.route.durationMinutes)} · {formatDistance(record.route.distanceM)}
        </Text>
      </View>
      {factorText ? (
        <Text variant="caption" color={colors.textSecondary}>
          {factorText}
        </Text>
      ) : null}
      <View style={styles.cardBottom}>
        <Text variant="captionStrong" color={record.outcome === 'arrived' ? colors.primary : colors.textSecondary}>
          {outcome}
        </Text>
        <Text variant="captionStrong" color={rating ? colors.text : colors.textSecondary}>
          {rating ? `내 평가 · ${rating}` : '평가 없음'}
        </Text>
      </View>
    </Pressable>
  );
}

/** 운전 기록: 저장에 동의한 "시뮬레이션" 기록만 보여준다. 실제 운전 기록과 섞이지 않는다. */
export function HistoryScreen({ navigation }: TabScreenProps<'History'>) {
  const records = useAppStore((s) => s.records);
  const saveRecords = useAppStore((s) => s.profile.consent.saveRecords);

  return (
    <Screen>
      <ScreenHeader
        size="large"
        title="운전 기록"
        subtitle="시뮬레이션 기록만 보여줘요. 실제 운전 기록이 아니에요."
      />
      <FlatList
        testID="history-list"
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, records.length === 0 && styles.listEmpty]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <RecordCard record={item} onPress={() => navigation.navigate('HistoryDetail', { recordId: item.id })} />
        )}
        ListEmptyComponent={
          saveRecords ? (
            <StateView
              testID="history-empty"
              icon="history"
              title="아직 시뮬레이션 기록이 없어요"
              message="지도에서 경로를 골라 시뮬레이션을 마치면 여기에 남아요."
              actions={[{ label: '지도에서 경로 찾기', onPress: () => navigation.navigate('Map') }]}
            />
          ) : (
            <StateView
              testID="history-empty-off"
              icon="history"
              title="기록 저장이 꺼져 있어요"
              message="설정에서 켜면 앞으로의 시뮬레이션이 여기에 남아요. 꺼 둬도 경로 추천은 그대로 쓸 수 있어요."
              actions={[
                { label: '설정에서 켜기', onPress: () => navigation.navigate('Settings') },
                { label: '지도에서 경로 찾기', variant: 'secondary', onPress: () => navigation.navigate('Map') },
              ]}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: layout.screenX, paddingTop: space.md, paddingBottom: space.xl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: space.md },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
});
