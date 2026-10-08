import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FACTORS } from '../domain/factors';
import { learningStatus } from '../domain/learning';
import type { FactorCode } from '../domain/types';
import { colors, layout, space } from '../design/tokens';
import type { TabScreenProps } from '../navigation/types';
import { useAppStore } from '../state/appStore';
import { useTripStore } from '../state/tripStore';
import { useUiStore } from '../state/uiStore';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { Group, ListRow, SwitchRow } from '../ui/Rows';
import { Screen, ScreenHeader } from '../ui/Screen';
import { Text } from '../ui/Text';

type Confirm = 'records' | 'learned' | 'all';

const CONFIRM_COPY: Record<Confirm, { title: string; text: string; action: string }> = {
  records: {
    title: '시뮬레이션 기록을 모두 삭제할까요?',
    text: '저장된 시뮬레이션 기록만 지워요. 운전 성향 설정과 추천에 반영된 취향은 그대로예요. 되돌릴 수 없어요.',
    action: '기록 삭제',
  },
  learned: {
    title: '모의 개인화 결과를 초기화할까요?',
    text: '평가로 조정된 값만 지워요. 직접 정한 설정과 기록은 그대로예요.',
    action: '개인화 초기화',
  },
  all: {
    title: '모든 사용자 데이터를 삭제할까요?',
    text: '운전 성향, 시뮬레이션 기록, 평가, 개인화 결과, 최근 목적지 같은 임시 저장값을 모두 지우고 처음 상태로 돌아가요. 되돌릴 수 없어요.',
    action: '모두 삭제',
  },
};

/** 설정: 성향·기록/개인화·데이터 삭제·데모 안내. 기록 삭제와 개인화 초기화를 구분해 둔다. */
export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const profile = useAppStore((s) => s.profile);
  const learned = useAppStore((s) => s.learned);
  const recordCount = useAppStore((s) => s.records.length);
  const setConsent = useAppStore((s) => s.setConsent);
  const clearRecords = useAppStore((s) => s.clearRecords);
  const resetLearned = useAppStore((s) => s.resetLearned);
  const wipeAll = useAppStore((s) => s.wipeAll);
  const resetTrip = useTripStore((s) => s.resetTrip);
  const setLastRun = useTripStore((s) => s.setLastRun);
  const showToast = useUiStore((s) => s.showToast);

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const avoidCount = Object.values(profile.priorities).filter((v) => v === 'avoid').length;
  const adjustments = Object.values(learned.adjustments).filter((a) => a !== undefined);
  const status = learningStatus(learned);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    let ok = false;
    if (confirm === 'records') ok = await clearRecords();
    if (confirm === 'learned') ok = await resetLearned();
    if (confirm === 'all') {
      ok = await wipeAll();
      if (ok) {
        resetTrip();
        setLastRun(null);
      }
    }
    setBusy(false);
    setConfirm(null);
    if (ok) {
      showToast(confirm === 'all' ? '모든 데이터를 삭제했어요.' : confirm === 'records' ? '시뮬레이션 기록을 삭제했어요.' : '모의 개인화 결과를 초기화했어요.', 'success');
    } else {
      showToast('삭제하지 못했어요. 이 기기의 저장 공간을 확인한 뒤 다시 시도해 주세요.', 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader size="large" title="설정" />
      <ScrollView contentContainerStyle={styles.content} testID="settings-scroll">
        <View style={styles.section}>
          <Text variant="captionStrong" color={colors.textSecondary}>
            운전 성향
          </Text>
          <Group>
            <ListRow
              testID="settings-preferences"
              icon="sliders"
              title="내 운전 성향"
              subtitle={`피하고 싶은 요소 ${avoidCount}개 · 최대 +${profile.maxExtraMinutes}분 허용`}
              onPress={() => navigation.navigate('Preferences')}
            />
          </Group>
        </View>

        <View style={styles.section}>
          <Text variant="captionStrong" color={colors.textSecondary}>
            기록과 개인화
          </Text>
          <Group>
            <SwitchRow
              testID="switch-records"
              label="시뮬레이션 기록 저장"
              description="끝낸 시뮬레이션을 이 기기의 ‘운전 기록’에 남겨요."
              value={profile.consent.saveRecords}
              onValueChange={(v) => setConsent({ saveRecords: v })}
            />
            <SwitchRow
              testID="switch-personalization"
              label="평가를 추천에 반영"
              description="‘쉬웠어요/어려웠어요’ 평가로 요소별 회피 정도를 조금 조정해요. 모의 규칙이에요."
              value={profile.consent.usePersonalization}
              onValueChange={(v) => setConsent({ usePersonalization: v })}
            />
          </Group>
          <View style={styles.learned}>
            <Text variant="bodyStrong">추천에 반영된 취향 (모의)</Text>
            <Text variant="caption" color={colors.textSecondary}>
              {profile.consent.usePersonalization ? status.text : '평가 반영이 꺼져 있어서 지금은 추천에 쓰이지 않아요.'}
            </Text>
            {adjustments.map((a) => (
              <Text key={a!.factor} variant="caption" color={colors.text}>
                ‘{FACTORS[a!.factor as FactorCode].label}’ 피하는 정도 {a!.delta >= 0 ? '+' : ''}
                {a!.delta.toFixed(1)} (어려웠어요 {a!.hardCount}번 · 쉬웠어요 {a!.easyCount}번)
                {profile.priorities[a!.factor] ? ' · 직접 정한 값이 우선해요' : ''}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="captionStrong" color={colors.textSecondary}>
            데이터 관리
          </Text>
          <Group>
            <ListRow
              testID="delete-records"
              icon="trash"
              destructive
              title="시뮬레이션 기록 삭제"
              subtitle={`저장된 기록 ${recordCount}개`}
              onPress={() => setConfirm('records')}
              chevron={false}
            />
            <ListRow
              testID="reset-learned"
              icon="refresh"
              destructive
              title="모의 개인화 결과 초기화"
              subtitle="평가로 조정된 값만 지워요"
              onPress={() => setConfirm('learned')}
              chevron={false}
            />
            <ListRow
              testID="wipe-all"
              icon="trash"
              destructive
              title="모든 사용자 데이터 삭제"
              subtitle="성향·기록·평가·개인화 결과를 모두 지워요"
              onPress={() => setConfirm('all')}
              chevron={false}
            />
          </Group>
          {confirm ? (
            <View style={styles.confirm}>
              <Notice tone="error" title={CONFIRM_COPY[confirm].title} text={CONFIRM_COPY[confirm].text} />
              <View style={styles.confirmRow}>
                <Button title="취소" variant="secondary" style={styles.flex} onPress={() => setConfirm(null)} />
                <Button
                  testID="confirm-delete"
                  title={CONFIRM_COPY[confirm].action}
                  variant="danger"
                  style={styles.flex}
                  loading={busy}
                  onPress={() => void run()}
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="captionStrong" color={colors.textSecondary}>
            데모 안내
          </Text>
          <Group>
            <ListRow
              testID="settings-demo-info"
              icon="info"
              title="데모와 실제 구현 범위"
              subtitle="무엇이 모의이고 무엇이 실제인지 알려드려요"
              onPress={() => navigation.navigate('DemoInfo')}
            />
            <ListRow
              testID="settings-dev-tools"
              icon="cone"
              title="개발용 시나리오"
              subtitle="오류·지연·정보 누락 상태를 재현해요"
              onPress={() => navigation.navigate('DevTools')}
            />
          </Group>
          <Text variant="caption" color={colors.textSecondary} align="center">
            뉴비맵 데모 0.1.0 · 시뮬레이션 전용
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingTop: space.md, paddingBottom: space.xxl, gap: space.xl },
  section: { gap: space.sm },
  learned: { gap: space.xs, paddingHorizontal: space.xs, paddingTop: space.sm },
  confirm: { gap: space.md, marginTop: space.sm },
  confirmRow: { flexDirection: 'row', gap: space.sm },
});
