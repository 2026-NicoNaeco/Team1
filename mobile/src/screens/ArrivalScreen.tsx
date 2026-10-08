import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FACTOR_ORDER, FACTORS } from '../domain/factors';
import { factorSummary, formatDistance, formatMinutes, placeLabel } from '../domain/format';
import { previewLearning } from '../domain/learning';
import { createSimulationRecord } from '../domain/records';
import type { FactorCode, Feedback, FeedbackRating } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { clock } from '../state/clock';
import { useTripStore } from '../state/tripStore';
import { useUiStore } from '../state/uiStore';
import { LetterBadge } from '../ui/Badges';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon, type IconName } from '../ui/Icon';
import { DoneBadge } from '../ui/Illustration';
import { Notice } from '../ui/Notice';
import { PressableScale } from '../ui/PressableScale';
import { ActionBar, Screen } from '../ui/Screen';
import { Group, SwitchRow } from '../ui/Rows';
import { StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';
import { haptics } from '../ui/haptics';

const RATINGS: Array<{ value: FeedbackRating; label: string; icon: IconName; fg: string; bg: string }> = [
  { value: 'easy', label: '쉬웠어요', icon: 'smile', fg: colors.success, bg: colors.successBg },
  { value: 'normal', label: '보통이에요', icon: 'meh', fg: colors.caution, bg: colors.cautionBg },
  { value: 'hard', label: '어려웠어요', icon: 'frown', fg: colors.warn, bg: colors.warnBg },
];

const FACTOR_PROMPT: Record<FeedbackRating, string> = {
  easy: '쉽게 느껴진 점이 있다면 골라 주세요',
  normal: '신경 쓰였던 점이 있다면 골라 주세요',
  hard: '어렵게 느껴진 점이 있다면 골라 주세요',
};

/**
 * 도착(또는 중도 종료) 후 화면. 피드백은 여기서만, 선택 사항으로 받는다.
 * 평가를 건너뛰어도 불이익이나 죄책감을 주는 문구를 쓰지 않는다.
 */
export function ArrivalScreen({ navigation }: RootScreenProps<'Arrival'>) {
  const run = useTripStore((s) => s.lastRun);
  const setLastRun = useTripStore((s) => s.setLastRun);
  const resetTrip = useTripStore((s) => s.resetTrip);
  const profile = useAppStore((s) => s.profile);
  const addRecord = useAppStore((s) => s.addRecord);
  const applyFeedback = useAppStore((s) => s.applyFeedback);
  const showToast = useUiStore((s) => s.showToast);

  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [factors, setFactors] = useState<FactorCode[]>([]);
  const [apply, setApply] = useState(true);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () =>
      run
        ? FACTOR_ORDER.filter((code) => {
            const m = run.route.factors[code];
            return FACTORS[code].scored && m.availability !== 'unknown' && m.value > 0;
          })
        : [],
    [run],
  );

  if (!run) {
    return (
      <Screen>
        <StateView
          icon="route"
          title="표시할 주행이 없어요"
          actions={[{ label: '지도로 돌아가기', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }) }]}
        />
      </Screen>
    );
  }

  const arrived = run.outcome === 'arrived';
  const personalizationOn = profile.consent.usePersonalization;
  const canApply = personalizationOn && (rating === 'easy' || rating === 'hard') && factors.length > 0;
  const effects = canApply && apply && rating ? previewLearning(profile, { rating, factors }) : [];

  const chooseRating = (value: FeedbackRating) => {
    haptics.selection();
    setRating(value);
    setFactors([]);
  };

  const toggleFactor = (code: FactorCode) =>
    setFactors((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));

  const leave = () => {
    setLastRun(null);
    resetTrip();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const feedback: Feedback | null = rating
      ? { rating, factors, appliedToRecommendations: canApply && apply }
      : null;
    const record = createSimulationRecord({
      id: clock.id('rec'),
      nowIso: clock.now().toISOString(),
      origin: run.origin,
      destination: run.destination,
      route: run.route,
      ranked: run.ranked,
      recommendedRouteId: run.recommendedRouteId,
      outcome: run.outcome,
      progress: run.progress,
      feedback,
    });
    const saved = await addRecord(record);
    const learned = feedback?.appliedToRecommendations ? applyFeedback(feedback).some((e) => e.applied) : false;

    if (saved === 'failed') {
      showToast('이 기기에 저장하지 못했어요. 지도 화면에서 다시 저장할 수 있어요.', 'error');
    } else {
      haptics.success();
      const parts = [
        saved === 'saved' ? '주행 기록에 저장했어요.' : '마쳤어요. 기록 저장이 꺼져 있어 남기지 않았어요.',
        learned ? '평가를 추천에 반영했어요.' : '',
      ];
      showToast(parts.filter(Boolean).join(' '), 'success');
    }
    setSaving(false);
    leave();
  };

  const restart = (fromProgressM: number) => {
    const routeId = run.route.id;
    setLastRun(null);
    navigation.replace('Navigation', { routeId, fromProgressM });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} testID="arrival-scroll">
        <View style={styles.hero}>
          <DoneBadge done={arrived} />
          <Text variant="title1" align="center" accessibilityRole="header">
            {arrived ? '도착했어요!' : '안내를 끝냈어요'}
          </Text>
          <Text variant="body" color={colors.textSecondary} align="center">
            {arrived ? '수고하셨어요. 이번 길은 어땠는지 알려 주세요.' : `중간에 끝냈어요 (${Math.round(run.progress * 100)}% 진행).`}
          </Text>
        </View>

        <Card style={styles.summary}>
          <View style={styles.summaryTitle}>
            <LetterBadge letter={run.route.label} selected size={36} />
            <Text variant="lead" style={styles.flex}>
              {run.ranked.headline}
            </Text>
          </View>
          <Text variant="body" numberOfLines={3}>
            {placeLabel(run.origin.name)} → {run.destination.name}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            예상 {formatMinutes(run.ranked.durationMinutes)} · {formatDistance(run.route.distanceM)} · {run.route.via}
          </Text>
          {!run.ranked.isRecommended ? (
            <Text variant="caption" color={colors.textSecondary}>
              맞춤 추천과 다른 경로를 직접 골라 진행했어요.
            </Text>
          ) : null}
        </Card>

        {!arrived ? (
          <Notice
            tone="info"
            title="이어서 해 볼까요?"
            text="이어서 시작하면 끝낸 지점부터, 처음부터 시작하면 처음부터 다시 진행해요. 다시 시작하면 지금 기록은 남기지 않아요."
          />
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="heading" accessibilityRole="header">
              이번 경로는 어땠나요?
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              선택 사항이에요. 건너뛰어도 괜찮아요.
            </Text>
          </View>
          <View style={styles.ratings} accessibilityRole="radiogroup">
            {RATINGS.map((r) => {
              const selected = rating === r.value;
              return (
                <PressableScale
                  key={r.value}
                  testID={`rating-${r.value}`}
                  accessibilityRole="radio"
                  accessibilityLabel={r.label}
                  aria-checked={selected}
                  onPress={() => chooseRating(r.value)}
                  pressedScale={0.95}
                  style={styles.ratingOuter}
                  contentStyle={[styles.rating, selected ? styles.ratingOn : styles.ratingOff]}
                >
                  <View style={[styles.face, { backgroundColor: r.bg }]}>
                    <Icon name={r.icon} size={30} color={r.fg} strokeWidth={2.2} />
                  </View>
                  <Text variant="captionStrong" color={selected ? colors.primaryStrong : colors.text} align="center">
                    {r.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {rating ? (
          <View style={styles.section}>
            <Text variant="bodyStrong">{FACTOR_PROMPT[rating]}</Text>
            <View style={styles.chips}>
              {options.map((code) => (
                <Chip
                  key={code}
                  testID={`feedback-${code}`}
                  multi
                  label={factorSummary(code, run.route.factors[code]).text}
                  selected={factors.includes(code)}
                  onPress={() => toggleFactor(code as FactorCode)}
                />
              ))}
            </View>
            {options.length === 0 ? (
              <Text variant="caption" color={colors.textSecondary}>
                이 경로에서 고를 수 있는 요소가 없어요.
              </Text>
            ) : null}
          </View>
        ) : null}

        {rating && rating !== 'normal' ? (
          personalizationOn ? (
            <View style={styles.section}>
              <Group>
                <SwitchRow
                  testID="feedback-apply"
                  label="이 평가를 앞으로의 추천에 반영"
                  description={canApply ? '고른 요소를 피하는 정도를 조금 조정해요.' : '요소를 고르면 반영할 수 있어요.'}
                  value={canApply && apply}
                  disabled={!canApply}
                  onValueChange={setApply}
                />
              </Group>
              {effects.map((e) => (
                <Text key={e.factor} variant="caption" color={colors.textSecondary}>
                  {e.applied
                    ? `‘${FACTORS[e.factor].label}’: 피하는 정도를 조금 ${e.direction === 'raise' ? '높여요' : '낮춰요'}`
                    : e.skipReason === 'user_override'
                      ? `‘${FACTORS[e.factor].label}’: 직접 정한 값이 있어서 그대로 유지돼요`
                      : `‘${FACTORS[e.factor].label}’: 추천 조정에 쓰이지 않는 항목이에요`}
                </Text>
              ))}
            </View>
          ) : (
            <Notice tone="unknown" text="평가를 추천에 반영하는 설정이 꺼져 있어서, 이번 평가는 추천에 쓰이지 않아요. 설정에서 켤 수 있어요." />
          )
        ) : null}

        <Text variant="caption" color={colors.textTertiary} align="center">
          {profile.consent.saveRecords
            ? '이 주행은 이 기기의 ‘주행 기록’에 저장돼요.'
            : '기록 저장이 꺼져 있어서 이 주행은 저장하지 않아요.'}
        </Text>
      </ScrollView>

      <ActionBar>
        <Button
          testID="arrival-finish"
          title={rating ? '저장하고 마치기' : '평가 없이 마치기'}
          loading={saving}
          onPress={() => void finish()}
        />
        {!arrived ? (
          <View style={styles.restartRow}>
            <Button title="이어서 시작" variant="neutral" size="medium" style={styles.flex} onPress={() => restart(run.progressM)} testID="arrival-resume" />
            <Button title="처음부터 다시" variant="neutral" size="medium" style={styles.flex} onPress={() => restart(0)} testID="arrival-restart" />
          </View>
        ) : null}
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.xxl, paddingBottom: space.xl, gap: space.xl },
  hero: { alignItems: 'center', gap: space.md },
  summary: { gap: space.sm },
  summaryTitle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  section: { gap: space.md },
  sectionHead: { gap: space.xs },
  ratings: { flexDirection: 'row', gap: space.sm },
  ratingOuter: { flex: 1 },
  rating: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 112,
    paddingVertical: space.lg,
    paddingHorizontal: space.xs,
    borderRadius: radius.card,
    borderWidth: 2,
  },
  ratingOff: { backgroundColor: colors.surface, borderColor: colors.surface },
  ratingOn: { backgroundColor: colors.primarySofter, borderColor: colors.primary },
  face: { width: 52, height: 52, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  restartRow: { flexDirection: 'row', gap: space.sm },
});
