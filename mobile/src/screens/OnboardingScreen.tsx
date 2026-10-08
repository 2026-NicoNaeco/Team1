import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { FACTORS, ONBOARDING_FACTORS } from '../domain/factors';
import { DEFAULT_MAX_EXTRA_MINUTES, FREQUENCY_LABEL } from '../domain/preferences';
import type { DrivingFrequency, FactorCode, RoadTypePreference } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import { useAppStore, type OnboardingResult } from '../state/appStore';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Notice } from '../ui/Notice';
import { SelectCard } from '../ui/SelectCard';
import { ActionBar, Screen } from '../ui/Screen';
import { SwitchRow } from '../ui/Rows';
import { Text } from '../ui/Text';

type Step = 'welcome' | 'frequency' | 'burdens' | 'routePrefs' | 'finish';
const STEPS: Step[] = ['welcome', 'frequency', 'burdens', 'routePrefs', 'finish'];
/** 질문 단계 수 (환영·마무리 화면은 세지 않는다) */
const QUESTION_STEPS: Step[] = ['frequency', 'burdens', 'routePrefs'];

const FREQUENCY_OPTIONS: Array<{ value: DrivingFrequency; title: string; description: string }> = [
  { value: 'rare', title: FREQUENCY_LABEL.rare, description: '한 달에 한두 번 이하' },
  { value: 'sometimes', title: FREQUENCY_LABEL.sometimes, description: '일주일에 한두 번 정도' },
  { value: 'often', title: FREQUENCY_LABEL.often, description: '일주일에 세 번 이상' },
  { value: 'unknown', title: FREQUENCY_LABEL.unknown, description: '나중에 설정에서 언제든 바꿀 수 있어요' },
];

const ROAD_OPTIONS: Array<{ value: RoadTypePreference; title: string; description: string }> = [
  { value: 'highway', title: '고속도로가 편해요', description: '신호는 적고, 합류·진출 구간이 있어요' },
  { value: 'general', title: '일반도로가 편해요', description: '신호와 교차로가 많지만 합류 부담은 적어요' },
  { value: 'none', title: '상관없어요', description: '도로 유형은 따로 따지지 않아요' },
];

const EXTRA_OPTIONS = [5, 10, 20];

const BENEFITS: Array<{ icon: IconName; text: string }> = [
  { icon: 'sliders', text: '어려운 운전 요소를 알려주시면, 그에 맞춰 경로를 비교해 드려요.' },
  { icon: 'route', text: '왜 이 경로인지, 대신 무엇을 감수하는지 함께 보여드려요.' },
  { icon: 'clock', text: '질문은 세 가지뿐이에요. 건너뛰어도, 나중에 바꿔도 괜찮아요.' },
];

/**
 * 첫 실행 온보딩: 환영 → 질문 3단계(운전 빈도, 부담스러운 요소, 경로 취향) → 마무리(기록·개인화 선택).
 * 한 단계에 한 주제만 다루고, 어디서든 건너뛸 수 있다. 건너뛰면 지금까지 고른 값 + 기본 설정으로 시작한다.
 */
export function OnboardingScreen() {
  const complete = useAppStore((s) => s.completeOnboarding);
  const [step, setStep] = useState<Step>('welcome');
  const [frequency, setFrequency] = useState<DrivingFrequency>('unknown');
  const [burdens, setBurdens] = useState<FactorCode[]>([]);
  const [roadType, setRoadType] = useState<RoadTypePreference>('none');
  const [extra, setExtra] = useState<number>(DEFAULT_MAX_EXTRA_MINUTES);
  const [saveRecords, setSaveRecords] = useState(false);
  const [personalization, setPersonalization] = useState(false);

  const index = STEPS.indexOf(step);
  const questionNumber = QUESTION_STEPS.indexOf(step) + 1;

  const back = () => setStep(STEPS[Math.max(0, index - 1)]!);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]!);

  useEffect(() => {
    if (step === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]!);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const finish = (options?: { skipConsent?: boolean }) => {
    const result: OnboardingResult = {
      frequency,
      burdens,
      roadTypePreference: roadType,
      maxExtraMinutes: extra,
      // 건너뛰기로 끝내면 기록 저장·개인화는 꺼 둔 채로 시작한다
      consent: options?.skipConsent
        ? { saveRecords: false, usePersonalization: false }
        : { saveRecords, usePersonalization: personalization },
    };
    complete(result);
  };

  const toggleBurden = (code: FactorCode) =>
    setBurdens((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));

  return (
    <Screen>
      <View style={styles.top}>
        {step !== 'welcome' ? <IconButton icon="back" label="이전 단계" onPress={back} /> : <View style={styles.topSpacer} />}
        {questionNumber > 0 ? (
          <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`질문 ${questionNumber}단계, 총 3단계`}>
            {QUESTION_STEPS.map((s, i) => (
              <View key={s} style={[styles.progressBar, i < questionNumber && styles.progressBarOn]} />
            ))}
          </View>
        ) : (
          <View style={styles.flex} />
        )}
        {step !== 'finish' && step !== 'welcome' ? (
          <Button
            testID="onboarding-skip"
            title="건너뛰기"
            variant="tertiary"
            fullWidth={false}
            onPress={() => finish({ skipConsent: true })}
            accessibilityHint="지금까지 고른 값과 기본 설정으로 시작해요"
          />
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'welcome' ? (
          <>
            <View style={styles.mark} aria-hidden>
              <Icon name="navigation" size={30} color={colors.onPrimary} />
            </View>
            <Text variant="title1" accessibilityRole="header">
              조금 돌아가더라도,{'\n'}나에게 운전 부담이 적은 길로.
            </Text>
            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.text} style={styles.benefit}>
                  <View style={styles.benefitIcon}>
                    <Icon name={b.icon} size={20} color={colors.primary} />
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {b.text}
                  </Text>
                </View>
              ))}
            </View>
            <Notice
              tone="demo"
              title="데모 앱이에요"
              text="지도, 경로, 교통 정보는 모두 모의 데이터이고 실제 주행에는 쓸 수 없어요. 사용자 정보는 서버로 보내지 않아요."
            />
          </>
        ) : null}

        {step === 'frequency' ? (
          <>
            <Text variant="title1" accessibilityRole="header">
              최근에 운전을 얼마나 자주 하세요?
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              정답은 없어요. 이 답으로 운전 실력을 평가하지 않고, 아직 정하지 않은 항목의 시작점으로만 써요.
            </Text>
            <View style={styles.cards} accessibilityRole="radiogroup">
              {FREQUENCY_OPTIONS.map((o) => (
                <SelectCard
                  key={o.value}
                  testID={`frequency-${o.value}`}
                  title={o.title}
                  description={o.description}
                  selected={frequency === o.value}
                  onPress={() => setFrequency(o.value)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 'burdens' ? (
          <>
            <Text variant="title1" accessibilityRole="header">
              특히 부담스러운 운전 요소가 있나요?
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              여러 개를 골라도 돼요. 고른 요소는 추천에서 되도록 피하는 쪽으로 계산해요. 나머지는 설정에서 더 세밀하게 정할 수 있어요.
            </Text>
            <View style={styles.cards}>
              {ONBOARDING_FACTORS.map((code) => (
                <SelectCard
                  key={code}
                  testID={`burden-${code}`}
                  mode="multi"
                  title={FACTORS[code].burdenSentence!}
                  description={FACTORS[code].description}
                  selected={burdens.includes(code)}
                  onPress={() => toggleBurden(code)}
                />
              ))}
              <SelectCard
                testID="burden-unsure"
                title="아직 잘 모르겠어요"
                description="일단 기본 설정으로 시작하고, 써 보면서 정할게요"
                selected={burdens.length === 0}
                onPress={() => setBurdens([])}
              />
            </View>
          </>
        ) : null}

        {step === 'routePrefs' ? (
          <>
            <Text variant="title1" accessibilityRole="header">
              경로 취향을 알려주세요
            </Text>
            <Text variant="body" color={colors.textSecondary}>
              지금 고른 값은 정답이 아니라 시작점이에요. 언제든 설정에서 바꿀 수 있어요.
            </Text>

            <Text variant="heading" style={styles.sub}>
              어떤 도로가 편하세요?
            </Text>
            <View style={styles.cards} accessibilityRole="radiogroup">
              {ROAD_OPTIONS.map((o) => (
                <SelectCard
                  key={o.value}
                  testID={`road-${o.value}`}
                  title={o.title}
                  description={o.description}
                  selected={roadType === o.value}
                  onPress={() => setRoadType(o.value)}
                />
              ))}
            </View>

            <Text variant="heading" style={styles.sub}>
              쉬운 길을 위해 얼마나 더 걸려도 괜찮으세요?
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              가장 빠른 경로보다 늘어나도 괜찮은 시간이에요. 이 시간 안에서 운전 부담이 적은 경로를 먼저 보여드려요.
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {EXTRA_OPTIONS.map((m) => (
                <Chip key={m} testID={`extra-${m}`} label={`${m}분`} selected={extra === m} onPress={() => setExtra(m)} />
              ))}
              <Chip
                testID="extra-unsure"
                label="잘 모르겠어요"
                selected={!EXTRA_OPTIONS.includes(extra)}
                onPress={() => setExtra(DEFAULT_MAX_EXTRA_MINUTES)}
              />
            </View>
            {!EXTRA_OPTIONS.includes(extra) ? (
              <Text variant="caption" color={colors.textSecondary}>
                잘 모르겠다면 {DEFAULT_MAX_EXTRA_MINUTES}분으로 시작해요.
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 'finish' ? (
          <>
            <Text variant="title1" accessibilityRole="header">
              준비됐어요
            </Text>
            <View style={styles.summary}>
              <SummaryRow label="운전 빈도" value={FREQUENCY_LABEL[frequency]} />
              <SummaryRow
                label="피하고 싶은 요소"
                value={burdens.length > 0 ? burdens.map((c) => FACTORS[c].label).join(', ') : '정하지 않음 (자동)'}
              />
              <SummaryRow
                label="도로 유형"
                value={ROAD_OPTIONS.find((o) => o.value === roadType)?.title ?? '상관없어요'}
              />
              <SummaryRow label="허용 추가 시간" value={`최대 +${extra}분`} />
            </View>

            <Text variant="heading" style={styles.sub}>
              기록과 개인화
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              둘 다 꺼 둬도 경로 추천은 그대로 쓸 수 있어요. 데이터는 이 기기에만 저장되고 서버로 보내지 않아요. 암호화는 하지 않아요.
            </Text>
            <View style={styles.switches}>
              <SwitchRow
                testID="consent-records"
                label="시뮬레이션 기록 저장"
                description="끝낸 시뮬레이션을 ‘운전 기록’에 남겨요. 실제 운전 기록이 아니에요."
                value={saveRecords}
                onValueChange={setSaveRecords}
              />
              <SwitchRow
                testID="consent-personalization"
                label="평가를 추천에 반영"
                description="‘어려웠어요’ 같은 평가를 고르면, 그 요소를 피하는 정도를 조금 조정해요. 모의 규칙이에요."
                value={personalization}
                onValueChange={setPersonalization}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <ActionBar>
        {step === 'welcome' ? (
          <>
            <Button testID="onboarding-start" title="시작하기" onPress={next} />
            <Button testID="onboarding-skip-welcome" title="건너뛰고 둘러보기" variant="tertiary" onPress={() => finish({ skipConsent: true })} />
          </>
        ) : step === 'finish' ? (
          <Button testID="onboarding-finish" title="뉴비맵 시작하기" onPress={() => finish()} />
        ) : (
          <Button testID="onboarding-next" title="다음" onPress={next} />
        )}
      </ActionBar>
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="caption" color={colors.textSecondary}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: layout.screenX - 8, minHeight: 56 },
  topSpacer: { width: 48 },
  progress: { flex: 1, flexDirection: 'row', gap: space.xs + 2 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  progressBarOn: { backgroundColor: colors.primary },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefits: { gap: space.md },
  benefit: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cards: { gap: space.sm },
  sub: { marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  summary: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: { gap: 2 },
  switches: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
