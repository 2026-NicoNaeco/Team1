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
  /** 부담 계산 대상인데 정보가 없거나 일부만 확인된 요소 */
  missing: FactorCode[];
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

/** 값이 있으면(일부 확인 포함) 그 값, 없으면 null. 부담 계산용 */
function usableValue(factors: RouteFactors, code: FactorCode): number | null {
  const m = factors[code];
  return m.availability === 'unknown' ? null : m.value;
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

export function computeBurden(factors: RouteFactors, prefs: EffectivePreferences): BurdenResult {
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
      const total = usableValue(factors, 'TURN_COUNT');
      const unprotected = usableValue(factors, 'UNPROTECTED_LEFT') ?? 0;
      const uTurn = usableValue(factors, 'U_TURN') ?? 0;
      amount = total === null ? null : Math.max(0, total - unprotected - uTurn);
    } else {
      amount = usableValue(factors, code);
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
