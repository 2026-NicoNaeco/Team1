import { BURDEN_LEVEL_THRESHOLDS, computeBurden, exclusiveValue, levelForIndex, plainTurnCount } from '../burden';
import { FACTORS } from '../factors';
import { emptyLearned } from '../learning';
import { assumedWorst } from '../recommend';
import { createDefaultProfile, resolvePreferences } from '../preferences';
import type { DriverProfile, RouteCandidate, RouteFactors } from '../types';
import { NOW, known, makeFactors, partial, unknown } from './fixtures';

const prefs = (patch: Partial<DriverProfile> = {}) => resolvePreferences({ ...createDefaultProfile(NOW), ...patch }, emptyLearned());

describe('방향 전환 중복 가산 방지', () => {
  // 전체 방향 전환 3회 = 일반 1 + 비보호 좌회전 1 + 유턴 1
  const factors = makeFactors({
    TURN_COUNT: known('TURN_COUNT', 3),
    UNPROTECTED_LEFT: known('UNPROTECTED_LEFT', 1),
    U_TURN: known('U_TURN', 1),
  });

  it('일반 전환 횟수는 전체에서 세부 항목을 뺀 값이다', () => {
    expect(plainTurnCount(factors)).toBe(1);
    expect(exclusiveValue(factors, 'TURN_COUNT')).toBe(1);
    expect(exclusiveValue(factors, 'U_TURN')).toBe(1);
  });

  it('각 방향 전환은 한 번만 점수에 반영된다', () => {
    const { index } = computeBurden(factors, prefs());
    // 일반 1×0.8 + 비보호 1×3.0 + 유턴 1×4.0 = 7.8  (전체 3회를 모두 일반으로 세면 9.4 가 된다)
    expect(index).toBeCloseTo(7.8, 5);
    expect(index).not.toBeCloseTo(9.4, 1);
  });

  it('세부 항목 값을 모르면 일반 전환을 확정할 수 없다 (null)', () => {
    const unsure = makeFactors({ TURN_COUNT: known('TURN_COUNT', 3), U_TURN: unknown('U_TURN') });
    expect(plainTurnCount(unsure)).toBeNull();
  });
});

describe('정보 없음은 0 으로 취급하지 않는다', () => {
  it('확인하지 못한 요소는 missing 으로 알린다', () => {
    const result = computeBurden(makeFactors({ ACCIDENT_ZONE: unknown('ACCIDENT_ZONE') }), prefs());
    expect(result.missing).toContain('ACCIDENT_ZONE');
  });

  it('모든 요소를 확인했으면 missing 이 비어 있다', () => {
    expect(computeBurden(makeFactors(), prefs()).missing).toEqual([]);
  });

  const accidentPoints = (n: number) => n * FACTORS.ACCIDENT_ZONE.unitLoad * prefs().weights.ACCIDENT_ZONE;

  it('비교할 값이 있으면 "정보 없음"을 그 값으로 계산한다 (0 으로 보지 않는다)', () => {
    const factors = makeFactors({ ACCIDENT_ZONE: unknown('ACCIDENT_ZONE') });
    const without = computeBurden(factors, prefs());
    const withAssume = computeBurden(factors, prefs(), { assumeForMissing: { ACCIDENT_ZONE: 2 } });
    expect(withAssume.index - without.index).toBeCloseTo(accidentPoints(2));
    expect(withAssume.missing).toContain('ACCIDENT_ZONE'); // 가정으로 채워도 정보가 없다는 사실은 남는다
  });

  it('"일부만 확인"은 확인 못 한 비율만큼 가정값을 더한다', () => {
    const factors = makeFactors({ ACCIDENT_ZONE: partial('ACCIDENT_ZONE', 1) }); // 확인된 구간 50%에서 1곳
    const result = computeBurden(factors, prefs(), { assumeForMissing: { ACCIDENT_ZONE: 4 } });
    const base = computeBurden(makeFactors(), prefs());
    expect(result.index - base.index).toBeCloseTo(accidentPoints(1 + 0.5 * 4));
  });

  it('정보가 빠진 경로는 그 요소가 확인된 어떤 후보보다도 그 요소에서 유리해지지 않는다', () => {
    const others: RouteFactors[] = [makeFactors({ ACCIDENT_ZONE: known('ACCIDENT_ZONE', 3) }), makeFactors({ ACCIDENT_ZONE: known('ACCIDENT_ZONE', 1) })];
    const missing = makeFactors({ ACCIDENT_ZONE: unknown('ACCIDENT_ZONE') });
    const assume = assumedWorst([...others, missing].map((factors) => ({ factors }) as RouteCandidate));
    const missingIndex = computeBurden(missing, prefs(), { assumeForMissing: assume }).index;
    for (const f of others) {
      expect(missingIndex).toBeGreaterThanOrEqual(computeBurden(f, prefs(), { assumeForMissing: assume }).index);
    }
  });

  it('어느 후보에서도 확인되지 않은 요소는 가정하지 않는다 (서로 비교할 근거가 없다)', () => {
    const all = [makeFactors({ ACCIDENT_ZONE: unknown('ACCIDENT_ZONE') }), makeFactors({ ACCIDENT_ZONE: unknown('ACCIDENT_ZONE') })];
    expect(assumedWorst(all.map((factors) => ({ factors }) as RouteCandidate)).ACCIDENT_ZONE).toBeUndefined();
  });
});

describe('도로 유형 선호', () => {
  const highway = makeFactors({ ROAD_TYPE: known('ROAD_TYPE', 10), LANE_CHANGE: known('LANE_CHANGE', 2) });

  it('고속도로를 선호하면 부담이 줄지만 0 아래로 내려가지 않는다', () => {
    const none = computeBurden(highway, prefs()).index;
    const liked = computeBurden(highway, prefs({ roadTypePreference: 'highway' })).index;
    expect(liked).toBeLessThan(none);
    expect(liked).toBeGreaterThanOrEqual(0);
  });

  it('일반도로를 선호하면 고속도로 구간만큼 부담이 늘어난다', () => {
    const none = computeBurden(highway, prefs()).index;
    const general = computeBurden(highway, prefs({ roadTypePreference: 'general' })).index;
    expect(general).toBeCloseTo(none + 9, 5);
  });

  it('고속도로를 지나지 않으면 도로 유형 선호는 영향을 주지 않는다', () => {
    const local = makeFactors({ LANE_CHANGE: known('LANE_CHANGE', 2) });
    const a = computeBurden(local, prefs({ roadTypePreference: 'general' })).index;
    const b = computeBurden(local, prefs({ roadTypePreference: 'highway' })).index;
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('부담 수준 경계', () => {
  it('낮음·보통·높음의 경계값', () => {
    const { lowMax, mediumMax } = BURDEN_LEVEL_THRESHOLDS;
    expect(levelForIndex(0)).toBe('low');
    expect(levelForIndex(lowMax - 0.01)).toBe('low');
    expect(levelForIndex(lowMax)).toBe('medium');
    expect(levelForIndex(mediumMax - 0.01)).toBe('medium');
    expect(levelForIndex(mediumMax)).toBe('high');
  });

  it('같은 경로도 사용자가 피하려는 요소가 있으면 수준이 올라갈 수 있다', () => {
    const factors = makeFactors({ LANE_CHANGE: known('LANE_CHANGE', 4) }); // 기본: 4×1.8 = 7.2 → 낮음
    expect(computeBurden(factors, prefs()).level).toBe('low');
    const avoider = prefs({ priorities: { LANE_CHANGE: 'avoid' } }); // 4×1.8×2.2 = 15.8 → 보통
    expect(computeBurden(factors, avoider).level).toBe('medium');
    const relaxed = prefs({ priorities: { LANE_CHANGE: 'relaxed' } });
    expect(computeBurden(factors, relaxed).index).toBeLessThan(computeBurden(factors, prefs()).index);
  });
});
