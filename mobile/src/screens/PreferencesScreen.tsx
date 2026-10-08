import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FACTOR_GROUP_LABEL, FACTORS, SCORED_FACTORS, type FactorGroup } from '../domain/factors';
import {
  FREQUENCY_LABEL,
  MAX_EXTRA_MINUTES_RANGE,
  PRIORITY_LABEL,
  describeFactorSetting,
} from '../domain/preferences';
import type { DrivingFrequency, FactorCode, PriorityLevel, RoadTypePreference } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { useEffectivePreferences } from '../state/selectors';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Notice } from '../ui/Notice';
import { SelectCard } from '../ui/SelectCard';
import { Screen, ScreenHeader } from '../ui/Screen';
import { Text } from '../ui/Text';

const FREQUENCIES: DrivingFrequency[] = ['rare', 'sometimes', 'often', 'unknown'];
const ROADS: Array<{ value: RoadTypePreference; title: string; description: string }> = [
  { value: 'highway', title: '고속도로가 편해요', description: '신호는 적고, 합류·진출 구간이 있어요' },
  { value: 'general', title: '일반도로가 편해요', description: '신호와 교차로가 많지만 합류 부담은 적어요' },
  { value: 'none', title: '상관없어요', description: '도로 유형은 따로 따지지 않아요' },
];
const LEVELS: PriorityLevel[] = ['relaxed', 'normal', 'avoid'];
const GROUPS: FactorGroup[] = ['turn', 'lane', 'road', 'surroundings'];

/**
 * 운전 성향 세부 설정. 온보딩에서 받지 않은 세부 요소는 여기서 조정한다.
 * 직접 정한 값은 평가로 조정된 값보다 우선하고, "자동"으로 돌리면 기본값 + 모의 학습으로 계산한다.
 */
export function PreferencesScreen({ navigation }: RootScreenProps<'Preferences'>) {
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const setPriority = useAppStore((s) => s.setPriority);
  const prefs = useEffectivePreferences();
  const [expanded, setExpanded] = useState<FactorCode | null>(null);

  const explicitCount = Object.keys(profile.priorities).length;
  const { min, max, step } = MAX_EXTRA_MINUTES_RANGE;
  const extra = profile.maxExtraMinutes;

  const clearAll = () => {
    for (const code of Object.keys(profile.priorities) as FactorCode[]) setPriority(code, null);
    setExpanded(null);
  };

  return (
    <Screen>
      <ScreenHeader title="내 운전 성향" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="preferences-scroll">
        <Notice
          tone="info"
          text="직접 정한 값이 평가로 조정된 값보다 우선해요. 바꾸면 보고 있던 경로 추천도 바로 다시 계산돼요."
        />

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            최근 운전 빈도
          </Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {FREQUENCIES.map((f) => (
              <Chip key={f} label={FREQUENCY_LABEL[f]} selected={profile.frequency === f} onPress={() => updateProfile({ frequency: f })} />
            ))}
          </View>
          <Text variant="caption" color={colors.textSecondary}>
            정하지 않은 복잡한 조작 요소의 시작점으로만 써요. 운전 실력을 평가하지 않아요.
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            도로 유형 선호
          </Text>
          <View style={styles.cards} accessibilityRole="radiogroup">
            {ROADS.map((r) => (
              <SelectCard
                key={r.value}
                testID={`pref-road-${r.value}`}
                title={r.title}
                description={r.description}
                selected={profile.roadTypePreference === r.value}
                onPress={() => updateProfile({ roadTypePreference: r.value })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            허용 추가 소요 시간
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            가장 빠른 경로보다 늘어나도 괜찮은 시간이에요. 0분이면 가장 빠른 경로만 추천해요. 넘는 경로는 숨기지 않고 ‘허용 시간 초과’로 표시해요.
          </Text>
          <View style={styles.stepper}>
            <IconButton
              testID="extra-minus"
              icon="minus"
              label="허용 시간 5분 줄이기"
              variant="filled"
              disabled={extra <= min}
              onPress={() => updateProfile({ maxExtraMinutes: Math.max(min, extra - step) })}
            />
            <Text variant="title2" align="center" style={styles.stepperValue} testID="extra-value" accessibilityLiveRegion="polite">
              +{extra}분
            </Text>
            <IconButton
              testID="extra-plus"
              icon="plus"
              label="허용 시간 5분 늘리기"
              variant="filled"
              disabled={extra >= max}
              onPress={() => updateProfile({ maxExtraMinutes: Math.min(max, extra + step) })}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            되도록 피하고 싶은 요소
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            요소를 눌러 직접 정하거나 ‘자동’으로 둘 수 있어요. 통행 제한처럼 반드시 지켜야 하는 제약은 여기서 바꿀 수 없어요.
          </Text>
          {GROUPS.map((group) => {
            const codes = SCORED_FACTORS.filter((c) => FACTORS[c].group === group);
            if (codes.length === 0) return null;
            return (
              <View key={group} style={styles.group}>
                <Text variant="captionStrong" color={colors.textSecondary}>
                  {FACTOR_GROUP_LABEL[group]}
                </Text>
                <View style={styles.factorList}>
                  {codes.map((code, i) => {
                    const info = FACTORS[code];
                    const setting = describeFactorSetting(code, profile, prefs);
                    const open = expanded === code;
                    return (
                      <View key={code} style={i > 0 ? styles.factorDivider : undefined}>
                        <Pressable
                          testID={`factor-${code}`}
                          accessibilityRole="button"
                          aria-expanded={open}
                          onPress={() => setExpanded(open ? null : code)}
                          style={({ pressed }) => [styles.factorRow, pressed && styles.pressed]}
                        >
                          <View style={styles.flex}>
                            <Text variant="bodyStrong">{info.label}</Text>
                            <Text variant="caption" color={setting.source === 'user' ? colors.primary : colors.textSecondary}>
                              {setting.text}
                            </Text>
                          </View>
                          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                        </Pressable>
                        {open ? (
                          <View style={styles.factorOptions}>
                            <Text variant="caption" color={colors.textSecondary}>
                              {info.description}
                            </Text>
                            <SelectCard
                              testID={`factor-${code}-auto`}
                              title="자동"
                              description="기본값에서 시작하고, 평가를 반영하도록 켜 두었다면 조금씩 조정돼요"
                              selected={profile.priorities[code] === undefined}
                              onPress={() => setPriority(code, null)}
                            />
                            {LEVELS.map((level) => (
                              <SelectCard
                                key={level}
                                testID={`factor-${code}-${level}`}
                                title={PRIORITY_LABEL[level]}
                                selected={profile.priorities[code] === level}
                                onPress={() => setPriority(code, level)}
                              />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Button
            testID="clear-priorities"
            title={`직접 정한 값 모두 자동으로 (${explicitCount}개)`}
            variant="secondary"
            disabled={explicitCount === 0}
            onPress={clearAll}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xxl, gap: space.xl },
  section: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cards: { gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stepperValue: { minWidth: 96 },
  group: { gap: space.sm },
  factorList: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  factorDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.md },
  pressed: { backgroundColor: colors.surfaceMuted },
  factorOptions: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
});
