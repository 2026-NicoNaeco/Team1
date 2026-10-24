import { FACTOR_ORDER, FACTORS } from './factors';
import type { BurdenLevel, EffectivePreferences, FactorCode, RouteFactors } from './types';

/**
 * 예상 운전 부담 계산 (모의 규칙).
 *
 * 이 값은 순위를 정하기 위한 내부 지수이며 안전 점수나 운전 능력 평가가 아니다.
 * 화면에는 숫자를 보여주지 않고 낮음·보통·높음과 구체적인 이유만 보여준다.
 *
 * 중복 가산 방지: 방향 전환은 "전체 − 비보호 좌회전 − 유턴"에만 일반 전환 부담을 적용한다.
 * (비보호 좌회전·유턴은 각자의 부담으로 한 번만 센다. factors.ts 참고)
 *
 * 정보 없음: 확인하지 못한 값은 0 이 아니다. 비교할 값(assumeForMissing)이 주어지면
 * "정보 없음"은 그 값으로, "일부만 확인"은 확인 못 한 비율만큼 그 값을 더해 보수적으로 계산한다.
 * 그래서 정보가 빠졌다는 이유만으로 부담이 낮아 보이지 않는다. 비교할 값이 없으면 그 요소는 계산에서 빠지고
 * missing 으로 알린다 (이때 결과는 하한이다).
 */

/** index 가 이 값 미만이면 "낮음", MEDIUM_MAX 미만이면 "보통", 그 이상은 "높음" */
export const BURDEN_LEVEL_THRESHOLDS = { lowMax: 10, mediumMax: 18 } as const;

/** 선호 도로 유형 보정: 일반도로를 선호하면 고속도로 1km 당 가산, 고속도로를 선호하면 감산 */
const GENERAL_PREF_PENALTY_PER_HIGHWAY_KM = 0.9;
const HIGHWAY_PREF_BONUS_PER_HIGHWAY_KM = 0.5;

export interface BurdenContribution {
  factor: FactorCode;
  points: number;
}

export interface BurdenResult {
  /** 순위 계산용 내부 지수 */
  index: number;
  level: BurdenLevel;
  contributions: BurdenContribution[];
  /** 부담 계산 대상인데 정보가 없거나 일부만 확인된 요소. 하나라도 있으면 실제 부담은 이보다 높을 수 있다 */
  missing: FactorCode[];
}

export interface BurdenOptions {
  /**
   * 정보가 없는 구간에 있다고 가정할 값(요소별, 경로 전체 기준).
   * 보통 다른 후보에서 확인된 가장 큰 값을 준다 (recommend.ts 의 assumedWorst).
   */
  assumeForMissing?: Partial<Record<FactorCode, number>>;
}

export function levelForIndex(index: number): BurdenLevel {
  if (index < BURDEN_LEVEL_THRESHOLDS.lowMax) return 'low';
  if (index < BURDEN_LEVEL_THRESHOLDS.mediumMax) return 'medium';
  return 'high';
}

/** 확인된(known) 값. 일부만 확인됐거나 정보가 없으면 null */
export function knownValue(factors: RouteFactors, code: FactorCode): number | null {
  const m = factors[code];
  return m.availability === 'known' ? m.value : null;
}

/**
 * 부담 계산에 쓰는 값.
 * 확인됨: 그 값 / 일부만 확인: 확인된 값 + 확인 못 한 비율 × 가정값 / 정보 없음: 가정값(없으면 null)
 */
function usableValue(factors: RouteFactors, code: FactorCode, assume: BurdenOptions['assumeForMissing']): number | null {
  const m = factors[code];
  const assumed = assume?.[code];
  if (m.availability === 'known') return m.value;
  if (m.availability === 'partial') return m.value + (1 - Math.min(1, Math.max(0, m.coverage))) * (assumed ?? 0);
  return assumed ?? null;
}

/** 비보호 좌회전·유턴을 뺀 일반 좌·우회전 횟수. 계산에 필요한 값이 확인되지 않았으면 null */
export function plainTurnCount(factors: RouteFactors): number | null {
  const total = knownValue(factors, 'TURN_COUNT');
  const unprotected = knownValue(factors, 'UNPROTECTED_LEFT');
  const uTurn = knownValue(factors, 'U_TURN');
  if (total === null || unprotected === null || uTurn === null) return null;
  return Math.max(0, total - unprotected - uTurn);
}

/** 요소별로 "겹치지 않게" 센 횟수(km). 방향 전환은 일반 좌·우회전만 돌려준다. */
export function exclusiveValue(factors: RouteFactors, code: FactorCode): number | null {
  return code === 'TURN_COUNT' ? plainTurnCount(factors) : knownValue(factors, code);
}

export function highwayKm(factors: RouteFactors): number {
  return knownValue(factors, 'ROAD_TYPE') ?? 0;
}

export function computeBurden(factors: RouteFactors, prefs: EffectivePreferences, options: BurdenOptions = {}): BurdenResult {
  const assume = options.assumeForMissing;
  const contributions: BurdenContribution[] = [];
  const missing: FactorCode[] = [];

  for (const code of FACTOR_ORDER) {
    const info = FACTORS[code];
    if (!info.scored) continue;
    const m = factors[code];
    if (m.availability !== 'known') missing.push(code);

    let amount: number | null;
    if (code === 'TURN_COUNT') {
      // 전체에서 부분집합(비보호 좌회전·유턴)을 뺀다. 부분집합 값을 모르면 전체를 그대로 쓴다.
      const total = usableValue(factors, 'TURN_COUNT', assume);
      const unprotected = usableValue(factors, 'UNPROTECTED_LEFT', assume) ?? 0;
      const uTurn = usableValue(factors, 'U_TURN', assume) ?? 0;
      amount = total === null ? null : Math.max(0, total - unprotected - uTurn);
    } else {
      amount = usableValue(factors, code, assume);
    }
    if (amount === null || amount === 0) continue;
    contributions.push({ factor: code, points: amount * info.unitLoad * prefs.weights[code] });
  }

  let index = contributions.reduce((sum, c) => sum + c.points, 0);

  const hwKm = highwayKm(factors);
  if (hwKm > 0 && prefs.roadTypePreference === 'general') {
    index += hwKm * GENERAL_PREF_PENALTY_PER_HIGHWAY_KM;
  } else if (hwKm > 0 && prefs.roadTypePreference === 'highway') {
    index -= Math.min(index, hwKm * HIGHWAY_PREF_BONUS_PER_HIGHWAY_KM);
  }
  index = Math.max(0, index);

  return { index, level: levelForIndex(index), contributions, missing };
}
