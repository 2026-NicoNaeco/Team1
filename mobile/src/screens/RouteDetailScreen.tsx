import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FACTOR_GROUP_LABEL, FACTOR_ORDER, FACTORS, tagLabel, type FactorGroup } from '../domain/factors';
import { describeMeasurement, formatDistance, formatExtra, formatMinutes, formatWon, minutesFromSeconds } from '../domain/format';
import type {
  FactorCode,
  GuidanceStep,
  Measurement,
  RouteCandidate,
  SettingsRelationItem,
  TradeoffKind,
  Verification,
  WeightSource,
} from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { useTripStore } from '../state/tripStore';
import { LetterBadge, RecommendBadge, StatusPill } from '../ui/Badges';
import { BurdenMeter } from '../ui/BurdenMeter';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FactorTag } from '../ui/FactorTag';
import { Icon, type IconName } from '../ui/Icon';
import { ManeuverIcon } from '../ui/ManeuverIcon';
import { Notice } from '../ui/Notice';
import { ActionBar, Screen, ScreenHeader } from '../ui/Screen';
import { StateView } from '../ui/StateViews';
import { Text } from '../ui/Text';

const SOURCE_LABEL: Record<WeightSource, string> = {
  user: '직접 설정',
  learned: '평가 반영',
  default: '기본 설정',
};

const VERIFICATION_LABEL: Record<Verification, string> = {
  confirmed: '확인됨',
  estimated: '추정값',
  unverified: '검증되지 않은 값',
};

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

const STANDING_TEXT: Record<SettingsRelationItem['standing'], string> = {
  lowest: '후보 중 가장 적어요',
  same: '후보가 모두 같아요',
  higher: '다른 후보보다 많아요',
  unknown: '비교할 정보가 부족해요',
};

const GROUPS: FactorGroup[] = ['turn', 'lane', 'road', 'surroundings'];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color={colors.textSecondary}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

function stepFactorText(step: GuidanceStep): string[] {
  const out: string[] = [];
  for (const code of FACTOR_ORDER) {
    const v = step.factors[code];
    if (!v || code === 'ROAD_TYPE' || code === 'TURN_COUNT') continue;
    out.push(`${tagLabel(code)} ${FACTORS[code].counter === 'km' ? `${v.toFixed(1)}km` : `${v}${FACTORS[code].counter}`}`);
  }
  for (const code of step.unknownFactors) out.push(`${tagLabel(code)} 정보 없음`);
  return out;
}

function Timeline({ route }: { route: RouteCandidate }) {
  const [expanded, setExpanded] = useState(false);
  const steps = route.steps;
  const shown = expanded ? steps : steps.slice(0, 4);
  return (
    <View>
      {shown.map((step, i) => {
        const tags = stepFactorText(step);
        const last = i === shown.length - 1 && (expanded || steps.length <= 4);
        return (
          <View key={step.index} style={styles.stepRow}>
            <View style={styles.stepRail}>
              <View style={styles.stepIcon}>
                <ManeuverIcon maneuver={step.maneuver} size={24} color={colors.primaryStrong} strokeWidth={5.5} />
              </View>
              {!last ? <View style={styles.stepLine} /> : null}
            </View>
            <View style={styles.stepBody}>
              <Text variant="bodyStrong">{step.instruction}</Text>
              {step.maneuver !== 'ARRIVE' ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {formatDistance(step.lengthM)} · 약 {formatMinutes(minutesFromSeconds(step.durationS))}
                </Text>
              ) : null}
              {tags.length > 0 ? (
                <Text variant="caption" color={colors.textTertiary}>
                  {tags.join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {steps.length > 4 ? (
        <Button
          title={expanded ? '구간 접기' : `전체 ${steps.length}개 구간 보기`}
          variant="secondary"
          size="medium"
          onPress={() => setExpanded((v) => !v)}
        />
      ) : null}
    </View>
  );
}

function SourceTable({ route }: { route: RouteCandidate }) {
  return (
    <View style={styles.sourceTable}>
      {FACTOR_ORDER.map((code) => {
        const m: Measurement = route.factors[code];
        return (
          <View key={code} style={styles.sourceRow}>
            <Text variant="captionStrong">
              {FACTORS[code].label}: {describeMeasurement(code, m)}
              {m.availability === 'known' && m.note ? ` (${m.note})` : ''}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              출처 {m.source.name}
              {m.availability === 'unknown' ? ' · 정보를 확인할 수 없어요' : ` · ${VERIFICATION_LABEL[m.verification]}`}
              {m.availability === 'partial' ? ` · 확인된 구간 ${Math.round(m.coverage * 100)}%` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 경로 상세: 핵심 특징을 먼저 요약하고, 세부 요소·출처·구간은 단계적으로 펼쳐 본다.
 * 안내 시작은 이 화면에서도 할 수 있다 (카드를 눌렀다고 바로 시작하지는 않는다).
 */
export function RouteDetailScreen({ navigation, route: navRoute }: RootScreenProps<'RouteDetail'>) {
  const { routeId } = navRoute.params;
  const candidates = useTripStore((s) => s.candidates);
  const recommendation = useTripStore((s) => s.recommendation);
  const selectedRouteId = useTripStore((s) => s.selectedRouteId);
  const selectRoute = useTripStore((s) => s.selectRoute);
  const [showSources, setShowSources] = useState(false);

  const candidate = candidates.find((c) => c.id === routeId);
  const ranked = recommendation?.items.find((i) => i.routeId === routeId);
  const recommended = recommendation?.items.find((i) => i.isRecommended);
  const recommendedRoute = useMemo(
    () => (recommended ? candidates.find((c) => c.id === recommended.routeId) : undefined),
    [recommended, candidates],
  );

  if (!candidate || !ranked) {
    return (
      <Screen>
        <ScreenHeader title="경로 상세" onBack={() => navigation.goBack()} />
        <StateView
          icon="route"
          title="경로 정보를 찾을 수 없어요"
          message="설정이나 목적지가 바뀌어 이전 경로가 사라졌어요. 경로 비교에서 다시 골라 주세요."
          actions={[{ label: '경로 비교로 돌아가기', onPress: () => navigation.goBack() }]}
        />
      </Screen>
    );
  }

  const toll =
    candidate.toll.availability === 'known'
      ? candidate.toll.won > 0
        ? `통행료 ${formatWon(candidate.toll.won)}`
        : '통행료 없음'
      : '통행료 정보 없음';

  const start = () => {
    if (selectedRouteId !== candidate.id) selectRoute(candidate.id);
    navigation.navigate('Navigation', { routeId: candidate.id });
  };

  return (
    <Screen>
      <ScreenHeader title={`${candidate.label} 경로`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} testID="detail-scroll">
        <Card style={styles.hero}>
          <View style={styles.heroTitle}>
            <LetterBadge letter={candidate.label} selected={selectedRouteId === candidate.id} size={40} />
            <View style={styles.heroText}>
              <Text variant="title2">{ranked.headline}</Text>
              <Text variant="caption" color={colors.textSecondary}>
                {candidate.via} 경유
              </Text>
            </View>
          </View>
          {ranked.isRecommended || !ranked.withinTimeLimit ? (
            <View style={styles.badges}>
              {ranked.isRecommended ? <RecommendBadge /> : null}
              {!ranked.withinTimeLimit ? <StatusPill label="허용 시간 초과" tone="caution" /> : null}
            </View>
          ) : null}
          <View style={styles.metrics}>
            <Text variant="metric">{formatMinutes(ranked.durationMinutes)}</Text>
            <Text variant="bodyStrong" color={ranked.extraMinutes > 0 ? colors.textSecondary : colors.primaryStrong}>
              {formatExtra(ranked.extraMinutes)}
            </Text>
          </View>
          <Text variant="caption" color={colors.textSecondary}>
            {formatDistance(candidate.distanceM)} · {toll}
          </Text>
          <BurdenMeter level={ranked.burdenLevel} />
          {ranked.burdenDrivers.length > 0 ? (
            <Text variant="caption" color={colors.textSecondary}>
              주된 요소: {ranked.burdenDrivers.map((d) => d.text).join(' · ')}
            </Text>
          ) : null}
          {!ranked.isRecommended && recommendedRoute ? (
            <Notice
              tone="info"
              text={`지금 설정의 맞춤 추천은 ${recommendedRoute.label} 경로예요. 이 경로를 고른 선택은 그대로 유지돼요.`}
            />
          ) : null}
        </Card>

        <Section title={ranked.isRecommended ? '이 경로를 추천한 이유' : '이 경로의 특징'}>
          {ranked.reasons.map((reason) => (
            <View key={reason.id} style={styles.reason}>
              <View style={styles.reasonRow}>
                <Icon name="check" size={18} color={colors.primary} strokeWidth={3.2} />
                <Text variant="body" style={styles.flex}>
                  {reason.text}
                </Text>
              </View>
              {reason.relatesTo ? (
                <Text variant="caption" color={colors.textTertiary} style={styles.relates}>
                  연결된 설정: {reason.relatesTo.label} ({SOURCE_LABEL[reason.relatesTo.source]})
                </Text>
              ) : null}
            </View>
          ))}
        </Section>

        <Section title="감수할 점 · 확인할 점">
          {ranked.tradeoffs.map((t) => (
            <View key={t.id} style={[styles.tradeoff, t.kind === 'over_limit' && styles.tradeoffCaution, t.kind === 'unknown_info' && styles.tradeoffUnknown]}>
              <Icon name={TRADEOFF_ICON[t.kind]} size={20} color={t.kind === 'over_limit' ? colors.caution : colors.textSecondary} />
              <Text variant="body" color={t.kind === 'over_limit' ? colors.caution : colors.text} style={styles.flex}>
                {t.text}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="내 설정과의 관계" hint="되도록 피하고 싶은 요소로 정한 항목이 이 경로에서 어떤지 보여줘요.">
          {ranked.settingsRelation.length === 0 ? (
            <View style={styles.gap}>
              <Text variant="body" color={colors.textSecondary}>
                아직 &apos;되도록 피하고 싶은&apos; 요소가 없어요. 설정에서 정하면 이 경로가 얼마나 맞는지 여기서 비교해 드려요.
              </Text>
              <Button title="운전 성향 설정하기" variant="secondary" size="medium" fullWidth={false} onPress={() => navigation.navigate('Preferences')} />
            </View>
          ) : (
            ranked.settingsRelation.map((row) => (
              <View key={row.factor} style={styles.relation}>
                <View style={styles.relationHead}>
                  <Text variant="bodyStrong" style={styles.flex}>
                    {row.label}
                  </Text>
                  <StatusPill label={SOURCE_LABEL[row.source]} tone={row.source === 'user' ? 'primary' : 'neutral'} />
                </View>
                <Text variant="caption" color={colors.textSecondary}>
                  이 경로: {row.routeValueText} · {STANDING_TEXT[row.standing]}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section title="운전 요소 요약" hint="‘없음’은 확인해 보니 없다는 뜻이고, ‘정보 없음’은 아직 확인할 수 없다는 뜻이에요.">
          {GROUPS.map((group) => (
            <View key={group} style={styles.group}>
              <Text variant="captionStrong" color={colors.textSecondary}>
                {FACTOR_GROUP_LABEL[group]}
              </Text>
              <View style={styles.tags}>
                {FACTOR_ORDER.filter((code) => FACTORS[code].group === group).map((code) => (
                  <FactorTag key={code} code={code as FactorCode} measurement={candidate.factors[code]} />
                ))}
              </View>
            </View>
          ))}
          <Button
            title={showSources ? '데이터 출처 접기' : '데이터 출처와 확인 상태 보기'}
            variant="tertiary"
            size="medium"
            fullWidth={false}
            onPress={() => setShowSources((v) => !v)}
          />
          {showSources ? <SourceTable route={candidate} /> : null}
        </Section>

        <Section title="구간 안내" hint="회전이 없는 구간은 한 줄로 합쳐서 보여줘요.">
          <Timeline route={candidate} />
        </Section>
      </ScrollView>

      <ActionBar>
        <Button testID="detail-start" title="이 길로 안내 시작" icon="navigation" onPress={start} />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xl, gap: space.md },
  flex: { flex: 1 },
  gap: { gap: space.md },
  hero: { gap: space.md },
  heroTitle: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  heroText: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  metrics: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.md },
  section: { gap: space.lg },
  sectionHead: { gap: space.xs },
  reason: { gap: 2 },
  reasonRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  relates: { marginLeft: 26 },
  tradeoff: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  tradeoffCaution: { backgroundColor: colors.cautionBg },
  tradeoffUnknown: { backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  relation: { gap: space.xs, padding: space.md, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
  relationHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  group: { gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sourceTable: { gap: space.md, padding: space.md, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
  sourceRow: { gap: 2 },
  stepRow: { flexDirection: 'row', gap: space.md },
  stepRail: { alignItems: 'center', width: 40 },
  stepIcon: { width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepBody: { flex: 1, gap: 2, paddingBottom: space.lg },
});
