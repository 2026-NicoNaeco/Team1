import { signedTurnDeg } from '../../domain/geo';
import type { ManeuverKind } from '../../domain/types';
import type { CityGraph, GraphEdge } from './graph';

/**
 * 두 도로 구간 사이의 전환(회전·합류·분기 등)을 한 곳에서 분류한다.
 * 경로 탐색 비용, 안내 단계, 요소 개수가 모두 이 판단을 공유하므로 서로 모순될 수 없다.
 */

export const TURN_MIN_ANGLE = 30;
export const SHARP_TURN_MIN_ANGLE = 120;
export const U_TURN_MIN_ANGLE = 165;
/** 교차로가 아닌 곳에서 같은 도로가 이 각도 이상 꺾이면 "급회전 구간"으로 센다 */
export const SHARP_CURVE_MIN_ANGLE = 60;

export interface Transition {
  node: string;
  maneuver: ManeuverKind | null;
  /** 양수는 우회전 */
  turnAngle: number;
  /** TURN_COUNT 에 들어가는 방향 전환인지 (좌·우회전, 급회전, 유턴) */
  isTurn: boolean;
  unprotectedLeft: boolean;
  uTurn: boolean;
  roundabout: boolean;
  mergeDiverge: boolean;
  /** 교차로 신호를 기다리는지 */
  signal: boolean;
  /** 교차로가 아닌 곳의 급한 굴곡 */
  sharpCurve: boolean;
  laneChanges: number;
  exitNumber?: number;
}

export function classifyTransition(graph: CityGraph, prev: GraphEdge, next: GraphEdge): Transition {
  const node = graph.nodes.get(prev.to)!;
  const turnAngle = signedTurnDeg(prev.endBearing, next.startBearing);
  const abs = Math.abs(turnAngle);
  const meta = graph.transitions[`${prev.from}>${node.id}>${next.to}`];

  const base: Transition = {
    node: node.id,
    maneuver: null,
    turnAngle,
    isTurn: false,
    unprotectedLeft: false,
    uTurn: false,
    roundabout: false,
    mergeDiverge: false,
    signal: false,
    sharpCurve: false,
    laneChanges: meta?.laneChanges ?? 0,
  };

  if (node.roundabout) {
    // 출구 번호는 진행 각도로 가늠한다 (우측이 첫 번째, 직진이 두 번째, 좌측이 세 번째)
    const exitNumber = abs >= 150 ? 4 : turnAngle >= TURN_MIN_ANGLE ? 1 : turnAngle <= -TURN_MIN_ANGLE ? 3 : 2;
    return { ...base, maneuver: 'ROUNDABOUT', roundabout: true, exitNumber };
  }

  const signal = Boolean(node.signal);

  if (prev.cls === 'ramp' && next.cls === 'highway') {
    return { ...base, maneuver: 'MERGE', mergeDiverge: true, signal };
  }
  if (prev.cls === 'highway' && next.cls === 'ramp') {
    return { ...base, maneuver: 'DIVERGE', mergeDiverge: true, signal };
  }

  const isJunction = (graph.degree.get(node.id) ?? 0) >= 3 || signal || prev.roadId !== next.roadId;
  if (!isJunction) {
    return { ...base, sharpCurve: abs >= SHARP_CURVE_MIN_ANGLE };
  }

  let maneuver: ManeuverKind | null = null;
  if (abs >= U_TURN_MIN_ANGLE) maneuver = 'U_TURN';
  else if (abs >= SHARP_TURN_MIN_ANGLE) maneuver = turnAngle < 0 ? 'SHARP_LEFT' : 'SHARP_RIGHT';
  else if (abs >= TURN_MIN_ANGLE) maneuver = turnAngle < 0 ? 'LEFT' : 'RIGHT';

  const isLeft = maneuver === 'LEFT' || maneuver === 'SHARP_LEFT';
  return {
    ...base,
    maneuver,
    isTurn: maneuver !== null,
    uTurn: maneuver === 'U_TURN',
    unprotectedLeft: isLeft && (meta?.unprotectedLeft ?? node.unprotectedLeft ?? false),
    signal,
  };
}

// ───────────────────────── 시간 모델 (모의) ─────────────────────────

/** 혼잡도(0~3)별 속도 배율 */
export const TRAFFIC_SPEED_FACTOR = [1, 0.8, 0.62, 0.42] as const;
const TOLL_GATE_S = 60;
const EXTRA_SIGNAL_S = 20;

export function edgeLevel(edge: GraphEdge): 0 | 1 | 2 | 3 {
  // 혼잡도 자료가 없는 구간은 시간 계산에서만 "보통"으로 가정한다 (화면에는 정보 없음으로 표시)
  return edge.attrs.trafficUnknown ? 1 : edge.attrs.traffic;
}

export function edgeTravelS(edge: GraphEdge): number {
  const speed = (edge.speedKph / 3.6) * TRAFFIC_SPEED_FACTOR[edgeLevel(edge)];
  return (
    edge.lengthM / speed +
    (edge.attrs.toll > 0 ? TOLL_GATE_S : 0) +
    edge.attrs.extraSignals * EXTRA_SIGNAL_S
  );
}

/** 교차로에서의 대기·동작 시간 */
export function transitionDelayS(prev: GraphEdge, tr: Transition): number {
  let delay = 0;
  if (tr.signal) delay += 18 + 10 * edgeLevel(prev);
  switch (tr.maneuver) {
    case 'LEFT':
    case 'SHARP_LEFT':
      delay += tr.unprotectedLeft ? 16 : 6;
      break;
    case 'RIGHT':
    case 'SHARP_RIGHT':
      delay += 5;
      break;
    case 'U_TURN':
      delay += 18;
      break;
    case 'ROUNDABOUT':
      delay += 12;
      break;
    case 'MERGE':
    case 'DIVERGE':
      delay += 6;
      break;
    default:
      break;
  }
  return delay;
}
