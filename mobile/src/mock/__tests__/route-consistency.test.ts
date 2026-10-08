import { exclusiveValue } from '../../domain/burden';
import { FACTOR_ORDER, FACTORS } from '../../domain/factors';
import { pathLengthM, signedTurnDeg, bearingDeg } from '../../domain/geo';
import type { FactorCode, ManeuverKind, RouteCandidate } from '../../domain/types';
import { CITY } from '../demoCity/cityData';
import { validateCity } from '../demoCity/graph';
import { computeRoutes, DEMO_GRAPH } from '../mockRouteProvider';
import { PLACE_NODE, PLACES } from '../places';

const TURN_KINDS: ManeuverKind[] = ['LEFT', 'RIGHT', 'SHARP_LEFT', 'SHARP_RIGHT', 'U_TURN'];

const result = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['univ-gate']!);
const routes = result.candidates;

describe('데모 도시 데이터', () => {
  it('도로망 정의에 모순이 없다', () => {
    expect(validateCity(CITY)).toEqual([]);
  });

  it('모든 샘플 장소가 도로망 위의 지점이다 (통행 제한으로 막힌 곳은 후보가 없다)', () => {
    for (const place of PLACES) expect(DEMO_GRAPH.nodes.has(PLACE_NODE[place.id]!)).toBe(true);
  });

  it('샘플 장소별 후보 수 (실제 후보 수만 보여준다)', () => {
    const counts: Record<string, number> = {};
    for (const place of PLACES) {
      if (place.id === 'station') continue;
      counts[place.id] = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE[place.id]!).candidates.length;
    }
    expect(counts).toEqual({
      'univ-gate': 3,
      'park-parking': 2,
      market: 1,
      hospital: 1,
      school: 1,
      mart: 1,
      'riverside-parking': 0,
      'univ-annex': 3,
    });
  });

  it('통행 제한으로 후보에서 빠진 경로를 "제외"로 알린다', () => {
    const hospital = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE.hospital!);
    expect(hospital.excluded).toHaveLength(1);
    expect(hospital.excluded[0]?.reason).toBe('restricted');
    const riverside = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['riverside-parking']!);
    expect(riverside.candidates).toHaveLength(0);
    expect(riverside.excluded).toHaveLength(1);
    // 제한이 없는 목적지는 제외 안내가 없다
    expect(computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['univ-gate']!).excluded).toHaveLength(0);
  });

  it('같은 입력에는 항상 같은 결과가 나온다 (결정적)', () => {
    const again = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['univ-gate']!);
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});

describe('기본 시나리오(새싹역 → 한빛대학교 정문)의 후보 구성', () => {
  it('서로 성격이 다른 3개 후보가 시간순(A, B, C)으로 나온다', () => {
    expect(routes.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(routes[0]!.durationS).toBeLessThan(routes[1]!.durationS);
    expect(routes[1]!.durationS).toBeLessThan(routes[2]!.durationS);
    expect(new Set(routes.map((r) => r.via)).size).toBe(3);
  });

  const [fast, highway, calm] = routes as [RouteCandidate, RouteCandidate, RouteCandidate];
  const value = (r: RouteCandidate, code: FactorCode) => {
    const m = r.factors[code];
    return m.availability === 'unknown' ? NaN : m.value;
  };

  it('가장 빠른 길은 방향 전환·차로 변경이 많고 비보호 좌회전·유턴·회전교차로를 지난다', () => {
    expect(value(fast, 'UNPROTECTED_LEFT')).toBeGreaterThanOrEqual(1);
    expect(value(fast, 'U_TURN')).toBeGreaterThanOrEqual(1);
    expect(value(fast, 'ROUNDABOUT')).toBeGreaterThanOrEqual(1);
    expect(value(fast, 'LANE_CHANGE')).toBeGreaterThan(value(calm, 'LANE_CHANGE'));
    expect(value(fast, 'TURN_COUNT')).toBeGreaterThan(value(calm, 'TURN_COUNT'));
  });

  it('조금 느린 길은 회전과 차로 변경이 적고 비보호 좌회전·유턴이 없다', () => {
    expect(value(calm, 'LANE_CHANGE')).toBe(0);
    expect(value(calm, 'UNPROTECTED_LEFT')).toBe(0);
    expect(value(calm, 'U_TURN')).toBe(0);
    expect(value(calm, 'TURN_COUNT')).toBeLessThan(value(fast, 'TURN_COUNT'));
  });

  it('고속도로 경로는 합류·분기와 통행료가 있다', () => {
    expect(value(highway, 'ROAD_TYPE')).toBeGreaterThan(5);
    expect(value(highway, 'MERGE_DIVERGE')).toBe(2);
    expect(highway.toll).toEqual({ availability: 'known', won: 1900 });
    expect(fast.toll).toEqual({ availability: 'known', won: 0 });
  });

  it('일부 도로 정보 없음: 조용한 길은 사고다발구간 자료가 일부 없다 (0 으로 처리하지 않는다)', () => {
    const accident = calm.factors.ACCIDENT_ZONE;
    expect(accident.availability).toBe('partial');
    expect(accident.availability === 'partial' && accident.coverage).toBeGreaterThan(0);
    expect(accident.availability === 'partial' && accident.coverage).toBeLessThan(1);
  });

  it('모든 측정값은 출처(데모 샘플)와 확인 상태를 가진다', () => {
    for (const route of routes) {
      for (const code of FACTOR_ORDER) {
        const m = route.factors[code];
        expect(m.source.kind).toBe('demo_sample');
        if (m.availability !== 'unknown') expect(['unverified', 'estimated', 'confirmed']).toContain(m.verification);
      }
      // 필수 차로 변경은 추정값이라고 밝힌다
      const lane = route.factors.LANE_CHANGE;
      expect(lane.availability !== 'unknown' && lane.verification).toBe('estimated');
    }
  });
});

describe.each(routes.map((r) => [r.label, r] as const))('경로 %s 의 내부 일관성', (_label, route) => {
  it('안내 단계의 거리·시간 합이 경로 전체와 같다', () => {
    const distance = route.steps.reduce((sum, s) => sum + s.lengthM, 0);
    const duration = route.steps.reduce((sum, s) => sum + s.durationS, 0);
    expect(distance).toBeCloseTo(route.distanceM, 3);
    expect(duration).toBeCloseTo(route.durationS, 3);
  });

  it('단계 시작 거리는 증가하고 첫 단계는 0, 마지막은 도착이다', () => {
    expect(route.steps[0]!.offsetM).toBe(0);
    expect(route.steps[0]!.maneuver).toBe('DEPART');
    const last = route.steps[route.steps.length - 1]!;
    expect(last.maneuver).toBe('ARRIVE');
    expect(last.offsetM).toBeCloseTo(route.distanceM, 3);
    for (let i = 1; i < route.steps.length; i++) {
      expect(route.steps[i]!.offsetM).toBeGreaterThan(route.steps[i - 1]!.offsetM);
      expect(route.steps[i]!.index).toBe(i);
    }
  });

  it('경로 도형의 길이가 거리와 일치한다 (0.2% 이내)', () => {
    expect(Math.abs(pathLengthM(route.path) / route.distanceM - 1)).toBeLessThan(0.002);
  });

  it('단계별 요소 합계가 경로 전체 요소와 같다 (횟수는 정확히, km 는 반올림 오차 이내)', () => {
    for (const code of FACTOR_ORDER) {
      const m = route.factors[code];
      if (m.availability === 'unknown' || code === 'LANE_COUNT') continue;
      const sum = route.steps.reduce((s, step) => s + (step.factors[code] ?? 0), 0);
      if (FACTORS[code].counter === 'km') expect(sum).toBeCloseTo(m.value, 1);
      else expect(sum).toBe(m.value);
    }
  });

  it('안내 단계의 동작 개수가 요소 개수와 일치한다', () => {
    const count = (kinds: ManeuverKind[]) => route.steps.filter((s) => kinds.includes(s.maneuver)).length;
    const v = (code: FactorCode) => (route.factors[code].availability === 'unknown' ? NaN : (route.factors[code] as { value: number }).value);
    expect(count(TURN_KINDS)).toBe(v('TURN_COUNT'));
    expect(count(['U_TURN'])).toBe(v('U_TURN'));
    expect(count(['ROUNDABOUT'])).toBe(v('ROUNDABOUT'));
    expect(count(['MERGE', 'DIVERGE'])).toBe(v('MERGE_DIVERGE'));
  });

  it('비보호 좌회전·유턴은 전체 방향 전환의 부분집합이다 (중복 집계 방지)', () => {
    const total = (route.factors.TURN_COUNT as { value: number }).value;
    const unprotected = (route.factors.UNPROTECTED_LEFT as { value: number }).value;
    const uTurn = (route.factors.U_TURN as { value: number }).value;
    expect(unprotected + uTurn).toBeLessThanOrEqual(total);
    expect(exclusiveValue(route.factors, 'TURN_COUNT')).toBe(total - unprotected - uTurn);
  });

  it('회전 방향과 각도의 부호가 안내 단계와 일치한다 (우회전 +, 좌회전 −)', () => {
    for (const step of route.steps) {
      if (step.maneuver === 'RIGHT' || step.maneuver === 'SHARP_RIGHT') expect(step.turnAngleDeg).toBeGreaterThan(0);
      if (step.maneuver === 'LEFT' || step.maneuver === 'SHARP_LEFT') expect(step.turnAngleDeg).toBeLessThan(0);
      if (step.maneuver === 'U_TURN') expect(Math.abs(step.turnAngleDeg)).toBeGreaterThanOrEqual(165);
      if (step.maneuver === 'DEPART' || step.maneuver === 'ARRIVE') expect(step.turnAngleDeg).toBe(0);
    }
  });

  it('안내 지점이 실제 경로 도형 위에 있다', () => {
    for (const step of route.steps) {
      const nearest = Math.min(
        ...route.path.map((p) => Math.hypot((p.lat - step.point.lat) * 111195, (p.lng - step.point.lng) * 111195)),
      );
      expect(nearest).toBeLessThan(2);
    }
  });

  it('경로 도형의 실제 진행 방향 변화가 안내된 회전 각도와 같다', () => {
    // 교차로 직전·직후의 도형 방위각을 직접 계산해 단계의 turnAngleDeg 와 비교한다
    for (const step of route.steps) {
      if (!TURN_KINDS.includes(step.maneuver)) continue;
      const i = route.path.findIndex((p) => Math.abs(p.lat - step.point.lat) < 1e-9 && Math.abs(p.lng - step.point.lng) < 1e-9);
      expect(i).toBeGreaterThan(0);
      const before = bearingDeg(route.path[i - 1]!, route.path[i]!);
      const after = bearingDeg(route.path[i]!, route.path[i + 1]!);
      expect(Math.abs(signedTurnDeg(before, after) - step.turnAngleDeg)).toBeLessThanOrEqual(1);
    }
  });
});
