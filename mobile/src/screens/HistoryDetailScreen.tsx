import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FACTOR_ORDER, FACTORS } from '../domain/factors';
import { RATING_LABEL, formatDateTime, formatDistance, formatMinutes, formatExtra, formatWon } from '../domain/format';
import type { FactorCode, Measurement, RecordedFactor } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { DEMO_SOURCE } from '../mock/demoCity/buildRoute';
import { useAppStore } from '../state/appStore';
import { useUiStore } from '../state/uiStore';
import { DemoBadge, LetterBadge } from '../ui/Badges';
import { BurdenMeter } from '../ui/BurdenMeter';
import { Button } from '../ui/Button';
import { FactorTag } from '../ui/FactorTag';
import { Notice } from '../ui/Notice';
import { Screen, ScreenHeader } from '../ui/Screen';
import { StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';

/** 기록에 남긴 값을 요소 표시용 측정값으로 되돌린다 (출처는 항상 데모 샘플) */
function toMeasurement(code: FactorCode, f: RecordedFactor): Measurement {
  const unit = FACTORS[code].unit;
  if (f.availability === 'unknown' || f.value === null) {
    return { availability: 'unknown', unit, source: DEMO_SOURCE };
  }
  if (f.availability === 'partial') {
    return { availability: 'partial', value: f.value, unit, coverage: 0.5, source: DEMO_SOURCE, verification: 'unverified' };
  }
  return { availability: 'known', value: f.value, unit, source: DEMO_SOURCE, verification: 'unverified' };
}

/** 시뮬레이션 기록 상세. 개별 기록을 삭제할 수 있다. */
export function HistoryDetailScreen({ navigation, route }: RootScreenProps<'HistoryDetail'>) {
  const { recordId } = route.params;
  const record = useAppStore((s) => s.records.find((r) => r.id === recordId));
  const deleteRecord = useAppStore((s) => s.deleteRecord);
  const showToast = useUiStore((s) => s.showToast);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!record) {
    return (
      <Screen>
        <ScreenHeader title="기록 상세" onBack={() => navigation.goBack()} />
        <StateView icon="history" title="기록을 찾을 수 없어요" message="이미 삭제된 기록이에요." actions={[{ label: '돌아가기', onPress: () => navigation.goBack() }]} />
      </Screen>
    );
  }

  const remove = async () => {
    setBusy(true);
    const ok = await deleteRecord(record.id);
    setBusy(false);
    if (ok) {
      showToast('기록을 삭제했어요.', 'success');
      navigation.goBack();
    } else {
      showToast('삭제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', 'error');
    }
  };

  const toll = record.route.tollWon === null ? '통행료 정보 없음' : record.route.tollWon > 0 ? `통행료 ${formatWon(record.route.tollWon)}` : '통행료 없음';

  return (
    <Screen>
      <ScreenHeader title="기록 상세" onBack={() => navigation.goBack()} right={<DemoBadge label="시뮬레이션 기록" />} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text variant="caption" color={colors.textSecondary}>
            {formatDateTime(record.createdAt)}
          </Text>
          <Text variant="title2">{record.destination.name}</Text>
          <Text variant="caption" color={colors.textSecondary}>
            출발 {record.origin.name}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.routeRow}>
            <LetterBadge letter={record.route.label} selected size={36} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{record.route.headline}</Text>
              <Text variant="caption" color={colors.textSecondary}>
                {record.route.via} 경유
              </Text>
            </View>
          </View>
          <Text variant="body">
            {formatMinutes(record.route.durationMinutes)} · {formatExtra(record.route.extraMinutes)}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {formatDistance(record.route.distanceM)} · {toll}
          </Text>
          <BurdenMeter level={record.route.burdenLevel} />
          <Text variant="caption" color={colors.textSecondary}>
            {record.outcome === 'arrived' ? '끝까지 도착했어요.' : `중간에 끝냈어요 (${Math.round(record.progress * 100)}% 진행).`}{' '}
            {record.chosenWasRecommended ? '맞춤 추천 경로를 골랐어요.' : '맞춤 추천과 다른 경로를 골랐어요.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            내 평가
          </Text>
          {record.feedback ? (
            <>
              <Text variant="bodyStrong">{RATING_LABEL[record.feedback.rating]}</Text>
              {record.feedback.factors.length > 0 ? (
                <Text variant="body" color={colors.textSecondary}>
                  고른 요소: {record.feedback.factors.map((c) => FACTORS[c].label).join(', ')}
                </Text>
              ) : (
                <Text variant="body" color={colors.textSecondary}>
                  고른 요소가 없어요.
                </Text>
              )}
              <Text variant="caption" color={colors.textSecondary}>
                {record.feedback.appliedToRecommendations
                  ? '이 평가를 추천에 반영했어요 (모의 규칙).'
                  : '이 평가는 추천에 반영하지 않았어요.'}
              </Text>
            </>
          ) : (
            <Text variant="body" color={colors.textSecondary}>
              평가를 남기지 않았어요.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            그때의 운전 요소
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            시뮬레이션 당시 데모 도로 정보예요. ‘없음’과 ‘정보 없음’은 서로 다른 뜻이에요.
          </Text>
          <View style={styles.tags}>
            {(FACTOR_ORDER as FactorCode[])
              .filter((code) => record.route.factors[code])
              .map((code) => (
                <FactorTag key={code} code={code} measurement={toMeasurement(code, record.route.factors[code]!)} />
              ))}
          </View>
        </View>

        {confirming ? (
          <Notice
            tone="error"
            title="이 기록을 삭제할까요?"
            text="삭제하면 되돌릴 수 없어요. 이 기록으로 조정된 추천 취향은 그대로 두고, 설정에서 따로 초기화할 수 있어요."
          />
        ) : null}
        {confirming ? (
          <View style={styles.confirmRow}>
            <Button title="취소" variant="secondary" style={styles.flex} onPress={() => setConfirming(false)} />
            <Button title="삭제" variant="danger" style={styles.flex} loading={busy} onPress={() => void remove()} testID="record-delete-confirm" />
          </View>
        ) : (
          <Button title="이 기록 삭제" variant="danger" icon="trash" onPress={() => setConfirming(true)} testID="record-delete" />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xxl, gap: space.xl },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  section: { gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  confirmRow: { flexDirection: 'row', gap: space.sm },
});
