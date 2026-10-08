import type {
  DataSource,
  FactorCode,
  GeoPoint,
  GuidanceStep,
  ManeuverKind,
  Measurement,
  MeasureUnit,
  RouteCandidate,
  RouteFactors,
  Verification,
} from '../../domain/types';
import type { CityGraph, GraphEdge } from './graph';
import { localToGeo } from './projection';
import { classifyTransition, edgeTravelS, transitionDelayS, type Transition } from './transition';

export const DEMO_SOURCE: DataSource = { kind: 'demo_sample', name: '뉴비맵 데모 샘플' };

export interface BuildOptions {
  /** 개발용 시나리오: 해당 요소를 "정보 없음"으로 바꾼다 */
  forceUnknown?: FactorCode[];
}

/** 요소별 누적값. 구간(step)별과 경로 전체가 같은 코드로 집계되므로 합계가 어긋나지 않는다. */
interface Acc {
  signals: number;
  zones: number;
  zoneKinds: Record<string, number>;
  unpavedM: number;
  narrowM: number;
  turns: number;
  unprotectedLeft: number;
  uTurns: number;
  sharp: number;
  roundabouts: number;
  laneChanges: number;
  mergeDiverge: number;
  congestedM: number;
  trafficUnknownM: number;
  accidents: number;
  accidentUnknownM: number;
  highwayM: number;
}

const emptyAcc = (): Acc => ({
  signals: 0,
  zones: 0,
  zoneKinds: {},
  unpavedM: 0,
  narrowM: 0,
  turns: 0,
  unprotectedLeft: 0,
  uTurns: 0,
  sharp: 0,
  roundabouts: 0,
  laneChanges: 0,
  mergeDiverge: 0,
  congestedM: 0,
  trafficUnknownM: 0,
  accidents: 0,
  accidentUnknownM: 0,
  highwayM: 0,
});

function addEdge(acc: Acc, e: GraphEdge): void {
  const a = e.attrs;
  acc.signals += a.extraSignals;
  if (a.protectedZone) {
    acc.zones += 1;
    acc.zoneKinds[a.protectedZone] = (acc.zoneKinds[a.protectedZone] ?? 0) + 1;
  }
  if (a.unpaved) acc.unpavedM += e.lengthM;
  if (a.narrow) acc.narrowM += e.lengthM;
  acc.sharp += a.sharpCurves;
  if (a.trafficUnknown) acc.trafficUnknownM += e.lengthM;
  else if (a.traffic >= 2) acc.congestedM += e.lengthM;
  if (a.accident === 'yes') acc.accidents += 1;
  if (a.accident === 'unknown') acc.accidentUnknownM += e.lengthM;
  if (e.cls === 'highway' || e.cls === 'ramp') acc.highwayM += e.lengthM;
}

/** 교차로에서 "회전 전에" 일어나는 일 (신호 대기, 차로 변경 준비, 급한 굴곡) */
function addApproachEvents(acc: Acc, tr: Transition): void {
  if (tr.signal) acc.signals += 1;
  acc.laneChanges += tr.laneChanges;
  if (tr.sharpCurve) acc.sharp += 1;
}

/** 회전·합류 같은 동작 자체 */
function addManeuver(acc: Acc, tr: Transition): void {
  if (tr.isTurn) acc.turns += 1;
  if (tr.unprotectedLeft) acc.unprotectedLeft += 1;
  if (tr.uTurn) acc.uTurns += 1;
  if (tr.roundabout) acc.roundabouts += 1;
  if (tr.mergeDiverge) acc.mergeDiverge += 1;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const km = (m: number) => round2(m / 1000);

function accToFactors(acc: Acc): GuidanceStep['factors'] {
  const entries: Array<[FactorCode, number]> = [
    ['TRAFFIC_LIGHT', acc.signals],
    ['PROTECTED_ZONE', acc.zones],
    ['UNPAVED_ROAD', km(acc.unpavedM)],
    ['NARROW_ROAD', km(acc.narrowM)],
    ['TURN_COUNT', acc.turns],
    ['UNPROTECTED_LEFT', acc.unprotectedLeft],
    ['U_TURN', acc.uTurns],
    ['SHARP_TURN', acc.sharp],
    ['ROUNDABOUT', acc.roundabouts],
    ['LANE_CHANGE', acc.laneChanges],
    ['MERGE_DIVERGE', acc.mergeDiverge],
    ['TRAFFIC_VOLUME', km(acc.congestedM)],
    ['ACCIDENT_ZONE', acc.accidents],
    ['ROAD_TYPE', km(acc.highwayM)],
  ];
  return Object.fromEntries(entries.filter(([, v]) => v > 0)) as GuidanceStep['factors'];
}

// ───────────────────────── 측정값 ─────────────────────────

function known(value: number, unit: MeasureUnit, verification: Verification = 'unverified', note?: string): Measurement {
  return { availability: 'known', value, unit, source: DEMO_SOURCE, verification, note };
}

function unknownMeasurement(unit: MeasureUnit, note?: string): Measurement {
  return { availability: 'unknown', unit, source: DEMO_SOURCE, note };
}

/** 일부 구간 자료가 없으면 partial, 전부 없으면 unknown */
function withCoverage(value: number, unit: MeasureUnit, unknownM: number, totalM: number, note?: string): Measurement {
  if (unknownM <= 0) return known(value, unit, 'unverified', note);
  if (unknownM >= totalM - 1) return unknownMeasurement(unit, '이 경로 전체의 자료가 없어요');
  return {
    availability: 'partial',
    value,
    unit,
    coverage: round2((totalM - unknownM) / totalM),
    source: DEMO_SOURCE,
    verification: 'unverified',
    note,
  };
}

const ZONE_KIND_LABEL: Record<string, string> = { child: '어린이', senior: '노인', disabled: '장애인' };

function buildFactors(path: readonly GraphEdge[], acc: Acc, totalM: number, forceUnknown: readonly FactorCode[]): RouteFactors {
  let laneWeighted = 0;
  let minLanes = Infinity;
  let maxLanes = 0;
  for (const e of path) {
    laneWeighted += e.lanes * e.lengthM;
    minLanes = Math.min(minLanes, e.lanes);
    maxLanes = Math.max(maxLanes, e.lanes);
  }
  const avgLanes = Math.round(laneWeighted / totalM);
  const laneNote = minLanes === maxLanes ? `편도 ${minLanes}차로` : `편도 ${minLanes}~${maxLanes}차로`;
  const zoneNote = Object.entries(acc.zoneKinds)
    .map(([kind, n]) => `${ZONE_KIND_LABEL[kind] ?? kind} ${n}곳`)
    .join(' · ');
  const highwayKm = km(acc.highwayM);
  const roadNote = `고속도로 계통 ${highwayKm.toFixed(1)}km · 일반도로 ${km(totalM - acc.highwayM).toFixed(1)}km`;

  const factors: RouteFactors = {
    TRAFFIC_LIGHT: known(acc.signals, 'count'),
    PROTECTED_ZONE: known(acc.zones, 'count', 'unverified', zoneNote || undefined),
    UNPAVED_ROAD: known(km(acc.unpavedM), 'km'),
    NARROW_ROAD: known(km(acc.narrowM), 'km'),
    TURN_COUNT: known(acc.turns, 'count'),
    UNPROTECTED_LEFT: known(acc.unprotectedLeft, 'count'),
    U_TURN: known(acc.uTurns, 'count'),
    SHARP_TURN: known(acc.sharp, 'count'),
    ROUNDABOUT: known(acc.roundabouts, 'count'),
    LANE_CHANGE: known(acc.laneChanges, 'count', 'estimated', '진행 방향에 맞춰 미리 옮겨야 하는 차로 변경(예상)'),
    MERGE_DIVERGE: known(acc.mergeDiverge, 'count'),
    LANE_COUNT: known(avgLanes, 'lanes', 'unverified', laneNote),
    TRAFFIC_VOLUME: withCoverage(km(acc.congestedM), 'km', acc.trafficUnknownM, totalM, '혼잡도는 고정된 모의값'),
    ACCIDENT_ZONE: withCoverage(acc.accidents, 'count', acc.accidentUnknownM, totalM),
    ROAD_TYPE: known(highwayKm, 'km', 'unverified', roadNote),
  };

  for (const code of forceUnknown) {
    factors[code] = unknownMeasurement(factors[code].unit, '데모 시나리오: 이 정보를 일시적으로 확인할 수 없어요');
  }
  return factors;
}

// ───────────────────────── 안내 문구 ─────────────────────────

function instructionFor(maneuver: ManeuverKind, roadName: string, tr?: Transition): string {
  switch (maneuver) {
    case 'DEPART':
      return `${roadName} 방향으로 출발`;
    case 'STRAIGHT':
      return `직진 · ${roadName}`;
    case 'LEFT':
      return `좌회전 · ${roadName}`;
    case 'RIGHT':
      return `우회전 · ${roadName}`;
    case 'SHARP_LEFT':
      return `왼쪽 급회전 · ${roadName}`;
    case 'SHARP_RIGHT':
      return `오른쪽 급회전 · ${roadName}`;
    case 'U_TURN':
      return `유턴 · ${roadName}`;
    case 'ROUNDABOUT':
      return `회전교차로 ${tr?.exitNumber ?? 2}번째 출구 · ${roadName}`;
    case 'MERGE':
      return `합류 · ${roadName}`;
    case 'DIVERGE':
      return `진출 · ${roadName}`;
    case 'ARRIVE':
      return '목적지 도착';
  }
}

/** 경유 도로 요약: 가장 길게 지나는 도로 두 개를 지나는 순서대로 */
function summarizeVia(path: readonly GraphEdge[]): string {
  const lengths = new Map<string, number>();
  const order: string[] = [];
  for (const e of path) {
    if (e.cls === 'ramp' || e.lengthM < 120) continue;
    if (!lengths.has(e.roadName)) order.push(e.roadName);
    lengths.set(e.roadName, (lengths.get(e.roadName) ?? 0) + e.lengthM);
  }
  const top = [...order].sort((a, b) => lengths.get(b)! - lengths.get(a)!).slice(0, 2);
  return order.filter((n) => top.includes(n)).join(' · ') || path[0]!.roadName;
}

// ───────────────────────── 경로 조립 ─────────────────────────

export type BuiltRoute = Omit<RouteCandidate, 'id' | 'label'>;

export function buildRoute(graph: CityGraph, path: readonly GraphEdge[], options: BuildOptions = {}): BuiltRoute {
  if (path.length === 0) throw new Error('빈 경로');
  const forceUnknown = options.forceUnknown ?? [];

  // 1) 구간 사이의 전환 (index i 는 path[i-1] → path[i])
  const transitions: Array<Transition | null> = [null];
  for (let i = 1; i < path.length; i++) transitions.push(classifyTransition(graph, path[i - 1]!, path[i]!));

  // 2) 안내 단계의 시작 구간: 출발 + 동작이 있는 전환
  const starts = [0];
  for (let i = 1; i < path.length; i++) if (transitions[i]!.maneuver) starts.push(i);

  const cumulative: number[] = [0];
  for (const e of path) cumulative.push(cumulative[cumulative.length - 1]! + e.lengthM);
  const totalM = cumulative[path.length]!;

  const total = emptyAcc();
  const stepAcc = starts.map(() => emptyAcc());
  const stepUnknown = starts.map(() => new Set<FactorCode>());
  const stepDuration = starts.map(() => 0);
  const stepOf = new Array<number>(path.length).fill(0);
  starts.forEach((start, s) => {
    const end = s + 1 < starts.length ? starts[s + 1]! - 1 : path.length - 1;
    for (let i = start; i <= end; i++) stepOf[i] = s;
  });

  let durationS = 0;
  let tollWon = 0;
  for (let i = 0; i < path.length; i++) {
    const e = path[i]!;
    const s = stepOf[i]!;
    addEdge(total, e);
    addEdge(stepAcc[s]!, e);
    if (e.attrs.trafficUnknown) stepUnknown[s]!.add('TRAFFIC_VOLUME');
    if (e.attrs.accident === 'unknown') stepUnknown[s]!.add('ACCIDENT_ZONE');
    const travel = edgeTravelS(e);
    durationS += travel;
    stepDuration[s]! += travel;
    tollWon += e.attrs.toll;

    const tr = transitions[i];
    if (tr) {
      const before = stepOf[i - 1]!;
      addApproachEvents(total, tr);
      addApproachEvents(stepAcc[before]!, tr);
      addManeuver(total, tr);
      if (tr.maneuver) addManeuver(stepAcc[s]!, tr);
      const delay = transitionDelayS(path[i - 1]!, tr);
      durationS += delay;
      stepDuration[before]! += delay;
    }
  }

  // 3) 안내 단계
  const steps: GuidanceStep[] = starts.map((start, s) => {
    const tr = transitions[start];
    const maneuver: ManeuverKind = tr?.maneuver ?? 'DEPART';
    const edge = path[start]!;
    const nextStart = s + 1 < starts.length ? starts[s + 1]! : path.length;
    const unknownFactors = [...stepUnknown[s]!];
    return {
      index: s,
      maneuver,
      instruction: instructionFor(maneuver, edge.roadName, tr ?? undefined),
      roadName: edge.roadName,
      roadClass: edge.cls,
      point: localToGeo(edge.shape[0]!),
      offsetM: cumulative[start]!,
      lengthM: cumulative[nextStart]! - cumulative[start]!,
      durationS: stepDuration[s]!,
      turnAngleDeg: tr ? Math.round(tr.turnAngle) : 0,
      factors: accToFactors(stepAcc[s]!),
      unknownFactors: unknownFactors.filter((f) => !forceUnknown.includes(f)).concat(forceUnknown),
    };
  });
  const lastEdge = path[path.length - 1]!;
  steps.push({
    index: steps.length,
    maneuver: 'ARRIVE',
    instruction: instructionFor('ARRIVE', lastEdge.roadName),
    roadName: lastEdge.roadName,
    roadClass: lastEdge.cls,
    point: localToGeo(lastEdge.shape[lastEdge.shape.length - 1]!),
    offsetM: totalM,
    lengthM: 0,
    durationS: 0,
    turnAngleDeg: 0,
    factors: {},
    unknownFactors: [],
  });
  if (forceUnknown.length > 0) {
    for (const step of steps) {
      for (const code of forceUnknown) delete step.factors[code];
    }
  }

  // 4) 경로 도형
  const geoPath: GeoPoint[] = [];
  path.forEach((e, i) => {
    e.shape.forEach((p, j) => {
      if (i > 0 && j === 0) return;
      geoPath.push(localToGeo(p));
    });
  });

  return {
    via: summarizeVia(path),
    path: geoPath,
    distanceM: totalM,
    durationS,
    toll: { availability: 'known', won: tollWon },
    factors: buildFactors(path, total, totalM, forceUnknown),
    steps,
  };
}
