import type { FactorCode, MeasureUnit } from './types';

/**
 * 운전 요소 카탈로그.
 *
 * 중복 가산을 막는 규칙 (burden.ts 가 이 정의를 전제로 한다)
 * - TURN_COUNT 는 교차로 방향 전환의 "전체" 횟수다. UNPROTECTED_LEFT·U_TURN 은 그 부분집합이다.
 *   점수는 (전체 − 부분집합)에만 일반 전환 부담을 적용하고, 부분집합은 각자의 부담으로 한 번만 센다.
 * - SHARP_TURN 은 교차로 회전이 아니라 "도로 자체가 급하게 꺾이는 구간"이다. 회전 횟수와 겹치지 않는다.
 * - MERGE_DIVERGE(합류·분기)는 방향 전환(TURN_COUNT)에 넣지 않는다.
 * - LANE_CHANGE 는 합류·분기 자체를 제외하고, 다음 회전·진출을 위해 필요한 차로 변경만 센다.
 *   차로 수(LANE_COUNT)로 추정하지 않으며, LANE_COUNT 는 점수에 쓰지 않는 참고 정보다.
 */

export type FactorGroup = 'turn' | 'lane' | 'road' | 'surroundings';

export interface FactorInfo {
  code: FactorCode;
  label: string;
  /** "피하기" 문구 (설정 화면) */
  avoidLabel: string;
  group: FactorGroup;
  /** 사용자가 회피 우선순위를 조정할 수 있고 부담 점수에 쓰이는 요소 */
  scored: boolean;
  /** 1회(또는 1km)당 기본 부담. 모의 값이며 검증된 난이도 지표가 아니다. */
  unitLoad: number;
  unit: MeasureUnit;
  /** 값 뒤에 붙이는 단위 */
  counter: '회' | '곳' | '개' | 'km' | '차로';
  /** 한두 문장의 쉬운 설명 */
  description: string;
  /** 온보딩 선택 카드 문장. 있으면 온보딩에서 고를 수 있다. */
  burdenSentence?: string;
  /** 운전 빈도가 적을 때 기본값을 조금 올리는 "복잡한 조작" 요소 */
  complex: boolean;
  icon: string;
  /** 백엔드 FactorCode 와의 대응 (README 참고) */
  backendCode?: string;
}

export const FACTOR_GROUP_LABEL: Record<FactorGroup, string> = {
  turn: '방향 전환',
  lane: '차로',
  road: '도로 상태·유형',
  surroundings: '주변 상황',
};

const INFO: FactorInfo[] = [
  {
    code: 'TURN_COUNT',
    label: '방향 전환',
    avoidLabel: '방향 전환 줄이기',
    group: 'turn',
    scored: true,
    unitLoad: 0.8,
    unit: 'count',
    counter: '회',
    description: '교차로에서 좌회전·우회전하는 횟수예요. 비보호 좌회전과 유턴도 여기에 포함돼요.',
    burdenSentence: '방향을 자주 바꾸는 길은 복잡해요.',
    complex: false,
    icon: 'turn',
    backendCode: 'TURN_COUNT',
  },
  {
    code: 'UNPROTECTED_LEFT',
    label: '비보호 좌회전',
    avoidLabel: '비보호 좌회전 피하기',
    group: 'turn',
    scored: true,
    unitLoad: 3.0,
    unit: 'count',
    counter: '회',
    description: '좌회전 신호 없이 마주 오는 차를 살피며 돌아야 하는 좌회전이에요.',
    burdenSentence: '비보호 좌회전은 피하고 싶어요.',
    complex: true,
    icon: 'turn-left',
  },
  {
    code: 'U_TURN',
    label: '유턴',
    avoidLabel: '유턴 피하기',
    group: 'turn',
    scored: true,
    unitLoad: 4.0,
    unit: 'count',
    counter: '회',
    description: '반대 방향으로 돌아 나가는 구간이에요.',
    burdenSentence: '유턴이 부담스러워요.',
    complex: true,
    icon: 'u-turn',
    backendCode: 'U_TURN',
  },
  {
    code: 'SHARP_TURN',
    label: '급회전',
    avoidLabel: '급회전 구간 피하기',
    group: 'turn',
    scored: true,
    unitLoad: 2.0,
    unit: 'count',
    counter: '곳',
    description: '도로 자체가 급하게 꺾이는 구간이에요. 교차로 회전과는 따로 세요.',
    complex: false,
    icon: 'curve',
    backendCode: 'SHARP_TURN',
  },
  {
    code: 'ROUNDABOUT',
    label: '회전교차로',
    avoidLabel: '회전교차로 피하기',
    group: 'turn',
    scored: true,
    unitLoad: 2.0,
    unit: 'count',
    counter: '회',
    description: '원형 교차로를 돌아 원하는 출구로 나가는 구간이에요.',
    burdenSentence: '회전교차로가 헷갈려요.',
    complex: true,
    icon: 'roundabout',
    backendCode: 'ROUNDABOUT',
  },
  {
    code: 'LANE_CHANGE',
    label: '필수 차로 변경',
    avoidLabel: '차로 변경 줄이기',
    group: 'lane',
    scored: true,
    unitLoad: 1.8,
    unit: 'count',
    counter: '회',
    description: '다음 회전이나 진출을 위해 미리 차로를 옮겨야 하는 횟수(예상)예요.',
    burdenSentence: '차로를 여러 번 바꾸는 게 어려워요.',
    complex: true,
    icon: 'lane-change',
    backendCode: 'LANE_CHANGE_TRAFFIC',
  },
  {
    code: 'MERGE_DIVERGE',
    label: '합류·분기',
    avoidLabel: '합류·분기 구간 줄이기',
    group: 'lane',
    scored: true,
    unitLoad: 2.2,
    unit: 'count',
    counter: '곳',
    description: '고속도로 진입·진출처럼 차로가 합쳐지거나 갈라지는 지점이에요.',
    burdenSentence: '합류·분기 구간(고속도로 진입·진출 등)이 부담돼요.',
    complex: true,
    icon: 'merge',
    backendCode: 'LANE_CHANGE_TRAFFIC',
  },
  {
    code: 'LANE_COUNT',
    label: '차로 수',
    avoidLabel: '차로 수',
    group: 'lane',
    scored: false,
    unitLoad: 0,
    unit: 'lanes',
    counter: '차로',
    description: '주로 지나는 도로의 편도 차로 수예요. 차로 변경 횟수와는 별개의 참고 정보예요.',
    complex: false,
    icon: 'lanes',
  },
  {
    code: 'NARROW_ROAD',
    label: '좁은 도로',
    avoidLabel: '좁은 길 피하기',
    group: 'road',
    scored: true,
    unitLoad: 1.5,
    unit: 'km',
    counter: 'km',
    description: '폭이 좁아 마주 오는 차와 지나가기 빠듯할 수 있는 길이에요.',
    burdenSentence: '좁은 길은 피하고 싶어요.',
    complex: false,
    icon: 'narrow',
    backendCode: 'NARROW_ROAD',
  },
  {
    code: 'UNPAVED_ROAD',
    label: '비포장 도로',
    avoidLabel: '비포장 길 피하기',
    group: 'road',
    scored: true,
    unitLoad: 2.5,
    unit: 'km',
    counter: 'km',
    description: '아스팔트 등으로 포장되지 않은 길이에요.',
    complex: false,
    icon: 'unpaved',
    backendCode: 'UNPAVED_ROAD',
  },
  {
    code: 'ROAD_TYPE',
    label: '도로 유형',
    avoidLabel: '도로 유형',
    group: 'road',
    scored: false,
    unitLoad: 0,
    unit: 'km',
    counter: 'km',
    description: '고속도로를 지나는 길이예요. 좋고 나쁨이 아니라 선호에 따라 평가가 달라져요.',
    complex: false,
    icon: 'highway',
  },
  {
    code: 'TRAFFIC_LIGHT',
    label: '신호등',
    avoidLabel: '신호 정차 줄이기',
    group: 'surroundings',
    scored: true,
    unitLoad: 0.25,
    unit: 'count',
    counter: '개',
    description: '신호에 걸려 서고 다시 출발하는 횟수예요. 적다고 해서 더 쉬운 길이라는 뜻은 아니에요.',
    burdenSentence: '신호에 자주 서고 출발하는 게 번거로워요.',
    complex: false,
    icon: 'traffic-light',
    backendCode: 'TRAFFIC_LIGHT',
  },
  {
    code: 'TRAFFIC_VOLUME',
    label: '교통량',
    avoidLabel: '혼잡한 길 피하기',
    group: 'surroundings',
    scored: true,
    unitLoad: 0.9,
    unit: 'km',
    counter: 'km',
    description: '차가 많은 구간의 길이예요. 데모에서는 고정된 모의값이에요.',
    burdenSentence: '차가 많이 막히는 길은 부담돼요.',
    complex: false,
    icon: 'traffic',
    backendCode: 'LANE_CHANGE_TRAFFIC',
  },
  {
    code: 'PROTECTED_ZONE',
    label: '보호구역',
    avoidLabel: '보호구역 덜 지나기',
    group: 'surroundings',
    scored: true,
    unitLoad: 0.8,
    unit: 'count',
    counter: '곳',
    description: '어린이·노인·장애인 보호구역이에요. 위험한 곳이 아니라 속도를 줄이고 더 살펴 가야 하는 구간이에요.',
    complex: false,
    icon: 'zone',
    backendCode: 'PROTECTED_ZONE',
  },
  {
    code: 'ACCIDENT_ZONE',
    label: '사고다발구간',
    avoidLabel: '사고다발구간 피하기',
    group: 'surroundings',
    scored: true,
    unitLoad: 2.0,
    unit: 'count',
    counter: '곳',
    description: '사고가 잦은 것으로 알려진 구간이에요. 자료가 없는 구간은 "정보 없음"으로 표시해요.',
    complex: false,
    icon: 'accident',
    backendCode: 'ACCIDENT_ZONE',
  },
];

export const FACTORS: Record<FactorCode, FactorInfo> = Object.fromEntries(
  INFO.map((f) => [f.code, f]),
) as Record<FactorCode, FactorInfo>;

/** 화면에 나열하는 기본 순서 */
export const FACTOR_ORDER: FactorCode[] = INFO.map((f) => f.code);

/** 부담 점수에 쓰이고 우선순위를 조정할 수 있는 요소 */
export const SCORED_FACTORS: FactorCode[] = INFO.filter((f) => f.scored).map((f) => f.code);

/** 온보딩에서 고르게 하는 대표 요소 (나머지는 설정에서 세부 조정) */
export const ONBOARDING_FACTORS: FactorCode[] = INFO.filter((f) => f.burdenSentence).map((f) => f.code);

export const COMPLEX_FACTORS: FactorCode[] = INFO.filter((f) => f.complex).map((f) => f.code);

/** 문장 안에서 쓰는 짧은 이름. 예: "빠른 경로보다 차로 변경이 2회 적어요" */
const SENTENCE_LABEL: Partial<Record<FactorCode, string>> = {
  TURN_COUNT: '좌·우회전',
  LANE_CHANGE: '차로 변경',
  TRAFFIC_VOLUME: '혼잡한 구간',
  TRAFFIC_LIGHT: '신호등',
};

export function sentenceLabel(code: FactorCode): string {
  return SENTENCE_LABEL[code] ?? FACTORS[code].label;
}

/** 태그·목록에서 쓰는 이름 */
const TAG_LABEL: Partial<Record<FactorCode, string>> = {
  LANE_CHANGE: '차로 변경',
  TRAFFIC_VOLUME: '혼잡 구간',
};

export function tagLabel(code: FactorCode): string {
  return TAG_LABEL[code] ?? FACTORS[code].label;
}
