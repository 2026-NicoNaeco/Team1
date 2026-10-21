import { FACTOR_ORDER } from './factors';
import type {
  Feedback,
  Place,
  RankedRoute,
  RouteCandidate,
  SimulationOutcome,
  SimulationRecord,
} from './types';

export const MAX_RECORDS = 100;
export const MAX_RECENT_PLACES = 5;

export interface RecordInput {
  id: string;
  nowIso: string;
  origin: Place;
  destination: Place;
  route: RouteCandidate;
  ranked: RankedRoute;
  recommendedRouteId: string | null;
  outcome: SimulationOutcome;
  /** 0~1 */
  progress: number;
  feedback: Feedback | null;
}

/**
 * 시뮬레이션 기록을 만든다. 당시의 도로 특성 요약만 담고 경로 좌표나 GPS 이력은 저장하지 않는다.
 * kind 는 항상 'simulation' 이라 실제 운전 기록과 섞이지 않는다.
 */
export function createSimulationRecord(input: RecordInput): SimulationRecord {
  const { route, ranked } = input;
  const factors: SimulationRecord['route']['factors'] = {};
  for (const code of FACTOR_ORDER) {
    const m = route.factors[code];
    factors[code] = { availability: m.availability, value: m.availability === 'unknown' ? null : m.value };
  }
  return {
    id: input.id,
    kind: 'simulation',
    createdAt: input.nowIso,
    origin: { id: input.origin.id, name: input.origin.name },
    destination: { id: input.destination.id, name: input.destination.name },
    route: {
      id: route.id,
      label: route.label,
      headline: ranked.headline,
      via: route.via,
      distanceM: Math.round(route.distanceM),
      durationMinutes: ranked.durationMinutes,
      extraMinutes: ranked.extraMinutes,
      burdenLevel: ranked.burdenLevel,
      tollWon: route.toll.availability === 'known' ? route.toll.won : null,
      factors,
    },
    recommendedRouteId: input.recommendedRouteId,
    chosenWasRecommended: input.recommendedRouteId === route.id,
    outcome: input.outcome,
    progress: Math.min(1, Math.max(0, input.progress)),
    feedback: input.feedback,
  };
}

/** 최신 기록이 앞에 오도록 추가하고 최대 개수를 지킨다 */
export function prependRecord(records: readonly SimulationRecord[], record: SimulationRecord): SimulationRecord[] {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
}

/** 최근 목적지를 앞에 추가하고 중복을 제거한다 */
export function prependRecent(recents: readonly Place[], place: Place): Place[] {
  return [place, ...recents.filter((p) => p.id !== place.id)].slice(0, MAX_RECENT_PLACES);
}
