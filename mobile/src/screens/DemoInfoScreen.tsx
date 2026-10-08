import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout, radius, space } from '../design/tokens';
import type { RootScreenProps } from '../navigation/types';
import { Notice } from '../ui/Notice';
import { Screen, ScreenHeader } from '../ui/Screen';
import { Text } from '../ui/Text';

type Kind = '모의' | '실제 동작' | '미구현';

const ROWS: Array<{ title: string; kind: Kind; body: string }> = [
  { title: '지도와 장소', kind: '모의', body: '가상의 지역(새싹시)을 직접 그린 데모 지도예요. 실제 도로나 지명이 아니고, 통행 가능 여부를 검증한 지도도 아니에요. 장소 검색은 샘플 장소 안에서만 돼요.' },
  { title: '경로·시간·통행료·교통량', kind: '모의', body: '고정된 샘플 도로망에서 계산한 값이에요. 같은 출발지·목적지에는 항상 같은 결과가 나와요. 실시간 교통 분석을 하지 않아요.' },
  { title: '경로 추천', kind: '모의', body: '단순한 규칙으로 운전 부담 순서를 정해요. 실제 AI 모델이나 검증된 운전 난이도 알고리즘이 아니에요. 부담 수준은 안전을 보장하는 값이 아니에요.' },
  { title: '개인화', kind: '모의', body: '“어려웠어요” 같은 평가를 반영하도록 고른 경우에만, 고른 요소의 회피 정도를 조금 조정해요. 직접 정한 설정이 항상 우선해요. 학습 모델은 쓰지 않아요.' },
  { title: '주행 안내', kind: '모의', body: '선택한 경로 위에서 시뮬레이션해요. 실제 위치(GPS)를 쓰지 않고 위치 권한도 요청하지 않아요. 실제 주행에 사용하면 안 돼요.' },
  { title: '설정·기록·평가 저장', kind: '실제 동작', body: '이 기기 안에만 저장돼요. 서버로 보내지 않고 외부 분석 도구도 쓰지 않아요. 저장 데이터를 암호화하지는 않아요. 설정에서 언제든 지울 수 있어요.' },
  { title: '로그인·서버·동기화', kind: '미구현', body: '회원가입, 로그인, 클라우드 동기화, 백그라운드 위치 추적은 이번 범위에 없어요.' },
  { title: '실제 경로 엔진·도로 데이터·추천 모델', kind: '미구현', body: '후속 팀이 맡을 영역이에요. 연결 지점은 mobile/README.md 에 정리해 두었어요.' },
];

const KIND_STYLE: Record<Kind, { bg: string; fg: string }> = {
  모의: { bg: colors.infoBg, fg: colors.info },
  '실제 동작': { bg: colors.primarySoft, fg: colors.primary },
  미구현: { bg: colors.surfaceMuted, fg: colors.textSecondary },
};

/** 데모와 실제 구현 범위 안내 */
export function DemoInfoScreen({ navigation }: RootScreenProps<'DemoInfo'>) {
  return (
    <Screen>
      <ScreenHeader title="데모와 실제 구현 범위" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} tabIndex={0}>
        <Notice
          tone="caution"
          title="실제 주행에 사용하지 마세요"
          text="이 앱은 사용 흐름을 체험해 보는 데모예요. ‘운전 부담이 적은 길’은 안전하거나 사고가 없는 길이라는 뜻이 아니에요."
        />
        {ROWS.map((row) => (
          <View key={row.title} style={styles.row}>
            <View style={styles.rowHead}>
              <Text variant="bodyStrong" style={styles.flex}>
                {row.title}
              </Text>
              <View style={[styles.kind, { backgroundColor: KIND_STYLE[row.kind].bg }]}>
                <Text variant="captionStrong" color={KIND_STYLE[row.kind].fg}>
                  {row.kind}
                </Text>
              </View>
            </View>
            <Text variant="body" color={colors.textSecondary}>
              {row.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, paddingBottom: space.xxl, gap: space.lg },
  row: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kind: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 8 },
});
