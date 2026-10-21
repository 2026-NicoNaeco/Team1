import { FlatList, StyleSheet, View } from 'react-native';
import { FACTOR_ORDER, FACTORS, tagLabel } from '../domain/factors';
import { RATING_LABEL, formatDateTime, formatDistance, formatFactorValue, formatMinutes } from '../domain/format';
import type { FactorCode, SimulationRecord } from '../domain/types';
import { colors, layout, space } from '../design/tokens';
import type { TabScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { LetterBadge, StatusPill } from '../ui/Badges';
import { BurdenMeter } from '../ui/BurdenMeter';
import { Card } from '../ui/Card';
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
  const stopped = record.outcome !== 'arrived';
  return (
    <Card
      testID={`record-${record.id}`}
      onPress={onPress}
      accessibilityHint="누르면 기록 상세를 봐요"
    >
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text variant="caption" color={colors.textSecondary}>
            {formatDateTime(record.createdAt)}
          </Text>
          <View style={styles.pills}>
            {stopped ? <StatusPill label={`중도 종료 ${Math.round(record.progress * 100)}%`} tone="caution" /> : null}
            {rating ? <StatusPill label={rating} tone="primary" /> : null}
          </View>
        </View>
        <Text variant="lead" numberOfLines={2}>
          {record.destination.name}
        </Text>
        <View style={styles.routeRow}>
          <LetterBadge letter={record.route.label} selected size={26} />
          <Text variant="caption" color={colors.textSecondary} style={styles.flex} numberOfLines={2}>
            {record.route.headline} · {formatMinutes(record.route.durationMinutes)} · {formatDistance(record.route.distanceM)}
          </Text>
        </View>
        <BurdenMeter level={record.route.burdenLevel} compact />
        {factorText ? (
          <Text variant="caption" color={colors.textTertiary}>
            {factorText}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** 주행 기록: 저장에 동의한 기록만 보여준다. 이 기기에만 저장된다. */
export function HistoryScreen({ navigation }: TabScreenProps<'History'>) {
  const records = useAppStore((s) => s.records);
  const saveRecords = useAppStore((s) => s.profile.consent.saveRecords);

  return (
    <Screen>
      <ScreenHeader size="large" title="주행 기록" subtitle="이 기기에만 저장돼요." />
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
              title="아직 주행 기록이 없어요"
              message="지도에서 경로를 골라 안내를 마치면 여기에 남아요."
              actions={[{ label: '지도에서 경로 찾기', onPress: () => navigation.navigate('Map') }]}
            />
          ) : (
            <StateView
              testID="history-empty-off"
              icon="history"
              title="기록 저장이 꺼져 있어요"
              message="설정에서 켜면 앞으로의 주행이 여기에 남아요. 꺼 둬도 경로 추천은 그대로 쓸 수 있어요."
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
  list: { paddingHorizontal: layout.screenX, paddingTop: space.sm, paddingBottom: space.xl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: space.md },
  cardBody: { gap: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  pills: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
