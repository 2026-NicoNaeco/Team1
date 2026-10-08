import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FACTOR_GROUP_LABEL, FACTORS, SCORED_FACTORS, type FactorGroup } from '../domain/factors';
import { FREQUENCY_LABEL, MAX_EXTRA_MINUTES_RANGE, describeFactorSetting } from '../domain/preferences';
import type { DrivingFrequency, FactorCode, PriorityLevel, RoadTypePreference } from '../domain/types';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { useEffectivePreferences } from '../state/selectors';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Notice } from '../ui/Notice';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Screen, ScreenHeader } from '../ui/Screen';
import { Text } from '../ui/Text';

const FREQUENCIES: DrivingFrequency[] = ['rare', 'sometimes', 'often', 'unknown'];
const ROADS: Array<{ value: RoadTypePreference; label: string; description: string }> = [
  { value: 'highway', label: '고속도로', description: '신호는 적고, 합류·진출 구간이 있어요' },
  { value: 'general', label: '일반도로', description: '신호와 교차로가 많지만 합류 부담은 적어요' },
  { value: 'none', label: '상관없어요', description: '도로 유형은 따로 따지지 않아요' },
];
const LEVEL_OPTIONS: Array<{ value: 'auto' | PriorityLevel; label: string }> = [
  { value: 'auto', label: '자동' },
  { value: 'relaxed', label: '신경 안 써요' },
  { value: 'normal', label: '보통' },
  { value: 'avoid', label: '피하고 싶어요' },
];
const GROUPS: FactorGroup[] = ['turn', 'lane', 'road', 'surroundings'];

/**
 * 운전 성향 세부 설정. 온보딩에서 받지 않은 세부 요소는 여기서 조정한다.
 * 직접 정한 값은 평가로 조정된 값보다 우선하고, "자동"으로 돌리면 기본값 + 평가 반영으로 계산한다.
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
        <Notice tone="info" text="직접 정한 값이 평가로 조정된 값보다 우선해요. 바꾸면 보고 있던 경로 추천도 바로 다시 계산돼요." />

        <Card style={styles.card}>
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
        </Card>

        <Card style={styles.card}>
          <Text variant="heading" accessibilityRole="header">
            도로 유형 선호
          </Text>
          <SegmentedControl
            label="도로 유형 선호"
            value={profile.roadTypePreference}
            onChange={(value) => updateProfile({ roadTypePreference: value })}
            options={ROADS.map((r) => ({ value: r.value, label: r.label, testID: `pref-road-${r.value}` }))}
          />
          <Text variant="caption" color={colors.textSecondary}>
            {ROADS.find((r) => r.value === profile.roadTypePreference)?.description}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="heading" accessibilityRole="header">
            돌아가도 괜찮은 시간
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            가장 빠른 길보다 늘어나도 괜찮은 시간이에요. 0분이면 가장 빠른 길만 추천해요. 넘는 길은 숨기지 않고 ‘허용 시간 초과’로 표시해요.
          </Text>
          <View style={styles.stepper}>
            <IconButton
              testID="extra-minus"
              icon="minus"
              label="허용 시간 5분 줄이기"
              variant="filled"
              size={52}
              disabled={extra <= min}
              onPress={() => updateProfile({ maxExtraMinutes: Math.max(min, extra - step) })}
            />
            <Text variant="metric" align="center" style={styles.stepperValue} testID="extra-value" accessibilityLiveRegion="polite">
              +{extra}분
            </Text>
            <IconButton
              testID="extra-plus"
              icon="plus"
              label="허용 시간 5분 늘리기"
              variant="filled"
              size={52}
              disabled={extra >= max}
              onPress={() => updateProfile({ maxExtraMinutes: Math.min(max, extra + step) })}
            />
          </View>
        </Card>

        <View style={styles.factors}>
          <View style={styles.factorsHead}>
            <Text variant="heading" accessibilityRole="header">
              되도록 피하고 싶은 요소
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              요소를 눌러 직접 정하거나 ‘자동’으로 둘 수 있어요. 통행 제한처럼 반드시 지켜야 하는 제약은 여기서 바꿀 수 없어요.
            </Text>
          </View>
          {GROUPS.map((group) => {
            const codes = SCORED_FACTORS.filter((c) => FACTORS[c].group === group);
            if (codes.length === 0) return null;
            return (
              <View key={group} style={styles.group}>
                <Text variant="captionStrong" color={colors.textSecondary} style={styles.groupLabel}>
                  {FACTOR_GROUP_LABEL[group]}
                </Text>
                <View style={styles.factorList}>
                  {codes.map((code, i) => {
                    const info = FACTORS[code];
                    const setting = describeFactorSetting(code, profile, prefs);
                    const open = expanded === code;
                    const current: 'auto' | PriorityLevel = profile.priorities[code] ?? 'auto';
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
                            <Text variant="lead">{info.label}</Text>
                            <Text variant="caption" color={setting.source === 'user' ? colors.primaryStrong : colors.textSecondary}>
                              {setting.text}
                            </Text>
                          </View>
                          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textTertiary} />
                        </Pressable>
                        {open ? (
                          <View style={styles.factorOptions}>
                            <Text variant="caption" color={colors.textSecondary}>
                              {info.description}
                            </Text>
                            <SegmentedControl
                              label={`${info.label} 설정`}
                              value={current}
                              onChange={(value) => setPriority(code, value === 'auto' ? null : value)}
                              options={LEVEL_OPTIONS.map((o) => ({ ...o, testID: `factor-${code}-${o.value}` }))}
                            />
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
            variant="neutral"
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
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xxl, gap: space.md },
  card: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  stepperValue: { minWidth: 120 },
  factors: { gap: space.md, marginTop: space.md },
  factorsHead: { gap: space.xs, paddingHorizontal: space.xs },
  group: { gap: space.sm },
  groupLabel: { paddingHorizontal: space.xs },
  factorList: { backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden' },
  factorDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 68, paddingHorizontal: layout.cardPad, paddingVertical: space.md },
  pressed: { backgroundColor: colors.surfaceMuted },
  factorOptions: { gap: space.md, paddingHorizontal: layout.cardPad, paddingBottom: layout.cardPad },
});
