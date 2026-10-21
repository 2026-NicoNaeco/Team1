import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { FACTORS, ONBOARDING_FACTORS } from '../domain/factors';
import { DEFAULT_MAX_EXTRA_MINUTES, FREQUENCY_LABEL } from '../domain/preferences';
import type { DrivingFrequency, FactorCode, RoadTypePreference } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import { useAppStore, type OnboardingResult } from '../state/appStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import type { IconName } from '../ui/Icon';
import { RoadHero } from '../ui/Illustration';
import { IconButton } from '../ui/IconButton';
import { PressableScale } from '../ui/PressableScale';
import { SelectCard } from '../ui/SelectCard';
import { ActionBar, Screen } from '../ui/Screen';
import { Group, SwitchRow } from '../ui/Rows';
import { Text } from '../ui/Text';
import { haptics } from '../ui/haptics';

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

/**
 * 첫 실행 온보딩: 환영 → 질문 3단계(운전 빈도, 부담스러운 요소, 경로 취향) → 마무리(기록·개인화 선택).
 * 한 화면에 한 주제만 다루고, 어디서든 건너뛸 수 있다. 건너뛰면 지금까지 고른 값 + 기본 설정으로 시작한다.
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
    if (!options?.skipConsent) haptics.success();
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
            size="small"
            fullWidth={false}
            onPress={() => finish({ skipConsent: true })}
            accessibilityHint="지금까지 고른 값과 기본 설정으로 시작해요"
          />
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.content, step === 'welcome' && styles.contentCentered]} keyboardShouldPersistTaps="handled">
        {step === 'welcome' ? (
          <>
            <RoadHero />
            <View style={styles.titleBlock}>
              <Text variant="title1" accessibilityRole="header">
                조금 돌아가더라도,{'\n'}나에게 운전 부담이 적은 길로.
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                어려운 운전 요소를 알려 주시면, 그에 맞춰 경로를 비교해 드려요. 왜 이 길인지, 대신 무엇을 감수하는지도 함께 보여 드릴게요.
              </Text>
            </View>
          </>
        ) : null}

        {step === 'frequency' ? (
          <>
            <View style={styles.titleBlock}>
              <Text variant="title1" accessibilityRole="header">
                운전은 얼마나{'\n'}자주 하세요?
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                정답은 없어요. 운전 실력을 평가하는 게 아니라, 아직 정하지 않은 항목의 시작점으로만 써요.
              </Text>
            </View>
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
            <View style={styles.titleBlock}>
              <Text variant="title1" accessibilityRole="header">
                어떤 운전이 특히{'\n'}부담스러우세요?
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                여러 개를 골라도 돼요. 고른 건 길을 찾을 때 되도록 피하는 쪽으로 계산해요. 나머지는 설정에서 더 세밀하게 정할 수 있어요.
              </Text>
            </View>
            <View style={styles.cards}>
              {ONBOARDING_FACTORS.map((code) => (
                <SelectCard
                  key={code}
                  testID={`burden-${code}`}
                  mode="multi"
                  leadingIcon={FACTORS[code].icon as IconName}
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
            <View style={styles.titleBlock}>
              <Text variant="title1" accessibilityRole="header">
                어떤 길이{'\n'}더 편하세요?
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                지금 고른 값은 정답이 아니라 시작점이에요. 언제든 설정에서 바꿀 수 있어요.
              </Text>
            </View>
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

            <View style={styles.titleBlock}>
              <Text variant="heading" accessibilityRole="header">
                쉬운 길을 위해 얼마나 더 걸려도 괜찮으세요?
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                가장 빠른 길보다 늘어나도 괜찮은 시간이에요. 이 안에서 운전 부담이 적은 길을 먼저 보여 드려요.
              </Text>
            </View>
            <View style={styles.tiles} accessibilityRole="radiogroup">
              {EXTRA_OPTIONS.map((m) => (
                <TimeTile key={m} testID={`extra-${m}`} minutes={m} selected={extra === m} onPress={() => setExtra(m)} />
              ))}
            </View>
            <View style={styles.unsureRow}>
              <Chip
                testID="extra-unsure"
                label="잘 모르겠어요"
                selected={!EXTRA_OPTIONS.includes(extra)}
                onPress={() => setExtra(DEFAULT_MAX_EXTRA_MINUTES)}
              />
              {!EXTRA_OPTIONS.includes(extra) ? (
                <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
                  잘 모르겠다면 {DEFAULT_MAX_EXTRA_MINUTES}분으로 시작해요.
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        {step === 'finish' ? (
          <>
            <View style={styles.titleBlock}>
              <Text variant="title1" accessibilityRole="header">
                준비됐어요!
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                이 설정으로 경로를 비교해 드릴게요. 모두 설정에서 언제든 바꿀 수 있어요.
              </Text>
            </View>
            <Card style={styles.summary}>
              <SummaryRow label="운전 빈도" value={FREQUENCY_LABEL[frequency]} />
              <SummaryRow
                label="피하고 싶은 것"
                value={burdens.length > 0 ? burdens.map((c) => FACTORS[c].label).join(', ') : '정하지 않음 (자동)'}
              />
              <SummaryRow label="도로 유형" value={ROAD_OPTIONS.find((o) => o.value === roadType)?.title ?? '상관없어요'} />
              <SummaryRow label="돌아가도 괜찮은 시간" value={`최대 +${extra}분`} />
            </Card>

            <View style={styles.titleBlock}>
              <Text variant="heading" accessibilityRole="header">
                기록과 개인화
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                둘 다 꺼 둬도 경로 추천은 그대로 쓸 수 있어요. 데이터는 이 기기에만 저장되고 서버로 보내지 않아요. 저장값을 암호화하지는 않아요.
              </Text>
            </View>
            <Group>
              <SwitchRow
                testID="consent-records"
                label="주행 기록 저장"
                description="안내를 마친 주행을 ‘주행 기록’에 남겨요."
                value={saveRecords}
                onValueChange={setSaveRecords}
              />
              <SwitchRow
                testID="consent-personalization"
                label="평가를 추천에 반영"
                description="‘어려웠어요’를 고르면 그 요소를 덜 만나는 길을 먼저 보여 드려요."
                value={personalization}
                onValueChange={setPersonalization}
              />
            </Group>
          </>
        ) : null}
      </ScrollView>

      <ActionBar>
        {step === 'welcome' ? (
          <>
            <Text variant="caption" color={colors.textTertiary} align="center">
              시연용 데이터로 동작해요 · 실제 주행에는 쓸 수 없어요
            </Text>
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

/** 허용 추가 시간 선택 타일: 숫자를 크게 보여준다 */
function TimeTile({ minutes, selected, onPress, testID }: { minutes: number; selected: boolean; onPress: () => void; testID: string }) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={`${minutes}분`}
      aria-checked={selected}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      pressedScale={0.96}
      style={styles.tileOuter}
      contentStyle={[styles.tile, selected ? styles.tileOn : styles.tileOff]}
    >
      <Text variant="metric" color={selected ? colors.onPrimary : colors.text}>
        +{minutes}
      </Text>
      <Text variant="captionStrong" color={selected ? colors.onPrimary : colors.textSecondary}>
        분까지
      </Text>
    </PressableScale>
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
  progressBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surfaceStrong },
  progressBarOn: { backgroundColor: colors.primary },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.md, paddingBottom: space.xl, gap: space.xl },
  // 환영 화면은 일러스트와 문구를 화면 가운데 쯤에 둔다
  contentCentered: { flexGrow: 1, justifyContent: 'center' },
  titleBlock: { gap: space.sm },
  cards: { gap: space.sm },
  tiles: { flexDirection: 'row', gap: space.sm },
  tileOuter: { flex: 1 },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 92, borderRadius: radius.card, borderWidth: 2 },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileOff: { backgroundColor: colors.surface, borderColor: colors.surface },
  unsureRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  summary: { gap: space.lg },
  summaryRow: { gap: 2 },
});
