import { useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import { PRESETS } from '../mock/presets';
import {
  DEFAULT_SCENARIO,
  getScenario,
  resetScenario,
  setScenario,
  subscribeScenario,
  type RouteFetchMode,
} from '../mock/scenario';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { useTripStore } from '../state/tripStore';
import { useUiStore } from '../state/uiStore';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Notice } from '../ui/Notice';
import { Group, SwitchRow } from '../ui/Rows';
import { Screen, ScreenHeader } from '../ui/Screen';
import { Text } from '../ui/Text';

const ROUTE_MODES: Array<{ value: RouteFetchMode; label: string; hint: string }> = [
  { value: 'ok', label: '정상', hint: '경로를 정상적으로 불러와요.' },
  { value: 'fail_once', label: '한 번 실패 후 성공', hint: '첫 조회만 실패해요. “다시 시도”로 복구되는지 확인해요.' },
  { value: 'fail_always', label: '계속 실패', hint: '다시 시도해도 실패해요. 다른 목적지로 바꾸는 흐름을 확인해요.' },
  { value: 'no_eligible', label: '조건에 맞는 경로 없음', hint: '모든 후보가 통행 제한으로 제외돼요.' },
];

/**
 * 개발용 시나리오 도구. 일반 사용자 화면(설정 > 개발용 시나리오)에서만 들어올 수 있고,
 * 오류·지연·정보 누락·저장 실패 같은 상태를 문구가 아니라 실제 동작으로 재현한다. 앱을 다시 켜면 초기화된다.
 */
export function DevToolsScreen({ navigation }: RootScreenProps<'DevTools'>) {
  const scenario = useSyncExternalStore(subscribeScenario, getScenario);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const showToast = useUiStore((s) => s.showToast);
  const devFontScale = useUiStore((s) => s.devFontScale);
  const setDevFontScale = useUiStore((s) => s.setDevFontScale);
  const resetTrip = useTripStore((s) => s.resetTrip);

  return (
    <Screen>
      <ScreenHeader title="개발용 시나리오" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} testID="devtools-scroll">
        <Notice
          tone="caution"
          icon="cone"
          title="개발·검수용 도구예요"
          text="상태를 재현하려는 도구라서 사용자 화면을 바꿔요. 앱을 다시 켜면 시나리오 값은 초기화돼요."
        />

        <View style={styles.section}>
          <Text variant="heading">경로 조회</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {ROUTE_MODES.map((m) => (
              <Chip
                key={m.value}
                testID={`mode-${m.value}`}
                label={m.label}
                selected={scenario.routeFetch === m.value}
                onPress={() => setScenario({ routeFetch: m.value })}
              />
            ))}
          </View>
          <Text variant="caption" color={colors.textSecondary}>
            {ROUTE_MODES.find((m) => m.value === scenario.routeFetch)?.hint}
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="heading">응답 지연</Text>
          <Text variant="caption" color={colors.textSecondary}>
            로딩 상태를 눈으로 확인할 수 있게 응답을 늦춰요.
          </Text>
          <View style={styles.chips}>
            <Chip
              label="기본 (검색 0.35초 · 경로 0.8초)"
              selected={scenario.searchLatencyMs === DEFAULT_SCENARIO.searchLatencyMs && scenario.routeLatencyMs === DEFAULT_SCENARIO.routeLatencyMs}
              onPress={() => setScenario({ searchLatencyMs: DEFAULT_SCENARIO.searchLatencyMs, routeLatencyMs: DEFAULT_SCENARIO.routeLatencyMs })}
            />
            <Chip
              testID="latency-slow"
              label="느리게 (3초 · 4초)"
              selected={scenario.searchLatencyMs === 3000}
              onPress={() => setScenario({ searchLatencyMs: 3000, routeLatencyMs: 4000 })}
            />
          </View>
        </View>

        <Group>
          <SwitchRow
            testID="dev-hide-info"
            label="일부 도로 정보 없음"
            description="교통량·사고다발구간 정보를 확인할 수 없는 상태로 만들어요. 다음 경로 조회부터 적용돼요."
            value={scenario.hideRoadInfo}
            onValueChange={(v) => setScenario({ hideRoadInfo: v })}
          />
          <SwitchRow
            testID="dev-storage-fails"
            label="로컬 저장 실패"
            description="저장·삭제가 실패하는 상태로 만들어요. 오류 안내와 다시 시도를 확인해요."
            value={scenario.storageFails}
            onValueChange={(v) => setScenario({ storageFails: v })}
          />
        </Group>

        <View style={styles.section}>
          <Text variant="heading">시뮬레이션 배속</Text>
          <View style={styles.chips}>
            {[14, 40, 80].map((n) => (
              <Chip
                key={n}
                testID={`speed-${n}`}
                label={`${n}배${n === 14 ? ' (기본)' : ''}`}
                selected={scenario.simulationSpeedup === n}
                onPress={() => setScenario({ simulationSpeedup: n })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="heading">글자 크기 확인</Text>
          <Text variant="caption" color={colors.textSecondary}>
            웹에는 시스템 글자 크기 설정이 없어서, 큰 글자일 때의 레이아웃을 이 값으로 확인해요. 기기에서는 시스템 설정이 그대로 적용돼요.
          </Text>
          <View style={styles.chips}>
            {[1, 1.3, 1.6, 2].map((n) => (
              <Chip
                key={n}
                testID={`font-${n}`}
                label={n === 1 ? '기본' : `${n}배`}
                selected={devFontScale === n}
                onPress={() => setDevFontScale(n)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="heading">설정 시나리오</Text>
          <Text variant="caption" color={colors.textSecondary}>
            같은 출발지·목적지(새싹역 앞 → 한빛대학교 정문)에서 설정만 바꿔 추천이 달라지는 것을 재현해요. 지금 설정을 덮어써요.
          </Text>
          {PRESETS.map((p) => (
            <View key={p.id} style={styles.preset}>
              <Text variant="bodyStrong">{p.title}</Text>
              <Text variant="caption" color={colors.textSecondary}>
                {p.description}
              </Text>
              <Button
                testID={`preset-${p.id}`}
                title="이 설정으로 바꾸기"
                variant="secondary"
                fullWidth={false}
                onPress={() => {
                  applyPreset(p.profile);
                  resetTrip();
                  showToast(`‘${p.title}’ 설정을 적용했어요.`, 'success');
                }}
              />
            </View>
          ))}
        </View>

        <Button title="시나리오 값 모두 초기화" variant="tertiary" onPress={() => { resetScenario(); setDevFontScale(1); }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xxl, gap: space.xl },
  section: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
