import type { DriverProfile } from '../domain/types';

/**
 * 개인화 데모 시나리오. 같은 출발지·목적지(새싹역 앞 → 한빛대학교 정문)에서
 * 설정만 바꿨을 때 추천 순위가 달라지는 것을 재현하기 위한 고정 설정이다.
 * 기대 결과는 mock/__tests__/recommendation-scenarios.test.ts 가 검증한다. (경로 이름: A 가장 빠른 길, B 고속도로, C 회전이 적은 길)
 */
export interface ProfilePreset {
  id: string;
  title: string;
  description: string;
  /** 기대하는 맞춤 추천 경로 */
  expectedRecommended: 'A' | 'B' | 'C';
  profile: Pick<DriverProfile, 'frequency' | 'roadTypePreference' | 'maxExtraMinutes' | 'priorities'>;
}

export const PRESETS: ProfilePreset[] = [
  {
    id: 'default',
    title: '기본 설정 (건너뛰기 상태)',
    description: '직접 정한 요소 없음 · 허용 +10분 → C 경로(회전이 적은 길)가 추천돼요.',
    expectedRecommended: 'C',
    profile: { frequency: 'unknown', roadTypePreference: 'none', maxExtraMinutes: 10, priorities: {} },
  },
  {
    id: 'avoid-maneuvers',
    title: '시나리오 1 · 차로 변경·비보호 좌회전·유턴 피하기',
    description: '허용 +10분 → C 경로가 추천되고, B 경로의 부담 수준이 높아져요.',
    expectedRecommended: 'C',
    profile: {
      frequency: 'rare',
      roadTypePreference: 'none',
      maxExtraMinutes: 10,
      priorities: { LANE_CHANGE: 'avoid', UNPROTECTED_LEFT: 'avoid', U_TURN: 'avoid' },
    },
  },
  {
    id: 'highway-fan',
    title: '시나리오 2 · 고속도로 선호',
    description: '고속도로 선호, 차로 변경·합류 신경 안 씀, 허용 +20분 → B 경로(고속도로)가 추천돼요.',
    expectedRecommended: 'B',
    profile: {
      frequency: 'often',
      roadTypePreference: 'highway',
      maxExtraMinutes: 20,
      priorities: { LANE_CHANGE: 'relaxed', MERGE_DIVERGE: 'relaxed' },
    },
  },
  {
    id: 'tight-limit',
    title: '시나리오 3 · 허용 시간 +5분',
    description: '기본 성향에서 허용 시간만 줄여요. C 경로는 +7분이라 추천에서 빠지고 안내가 나와요 → B 경로 추천.',
    expectedRecommended: 'B',
    profile: { frequency: 'unknown', roadTypePreference: 'none', maxExtraMinutes: 5, priorities: {} },
  },
  {
    id: 'fastest-only',
    title: '시나리오 4 · 허용 시간 +0분',
    description: '가장 빠른 경로만 허용해요 → A 경로가 추천되고 나머지는 허용 시간 초과로 표시돼요.',
    expectedRecommended: 'A',
    profile: { frequency: 'unknown', roadTypePreference: 'none', maxExtraMinutes: 0, priorities: {} },
  },
];
