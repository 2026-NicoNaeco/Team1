/**
 * 백엔드(/v1) 응답 ↔ 앱 도메인 타입 변환 (순수 함수).
 * 백엔드는 앱의 도메인 정의에 맞춰져 있어서 대부분 이름(snake_case → camelCase)만 바꾼다. 대응표는 README 5장.
 * 모르는 값이 오면 조용히 0 이나 "안전"으로 바꾸지 않고, 측정값은 "정보 없음"으로, 그 밖은 오류로 다룬다.
 */
import { FACTOR_ORDER, FACTORS } from '../../domain/factors';
import { decodePolyline } from '../../domain/polyline';
import type {
  DataSource,
  EffectivePreferences,
  ExcludedRoute,
  FactorCode,
  GuidanceStep,
  ManeuverKind,
  MeasureUnit,
  Measurement,
  Place,
  PlaceCategory,
  RoadClass,
  RouteCandidate,
  RouteFactors,
  RouteSearchResult,
  TollInfo,
  Verification,
} from '../../domain/types';

// ───────────── 백엔드 응답 모양 (backend/app/api/schemas.py) ─────────────

export interface ApiMeasurement {
  availability: 'known' | 'partial' | 'unknown';
  value?: number | null;
  unit: string;
  coverage?: number | null;
  source?: { kind?: string; name?: string } | null;
  verification?: string | null;
}

export interface ApiStep {
  index: number;
  maneuver: string;
  instruction: string;
  lat: number;
  lng: number;
  road_name: string | null;
  road_class: string;
  offset_m: number;
  distance_m: number;
  duration_s: number;
  turn_angle_deg: number;
  factors: Record<string, number>;
  unknown_factors: string[];
}

export interface ApiRoute {
  route_id: string;
  label: string;
  rank: number;
  via: string;
  distance_m: number;
  duration_s: number;
  extra_duration_s: number;
  toll: { availability: 'known'; won: number } | { availability: 'unknown' };
  polyline: string;
  factors: Record<string, ApiMeasurement>;
  steps: ApiStep[];
}

export interface ApiRouteSearchResponse {
  routes: ApiRoute[];
  excluded?: Array<{ reason: string; description: string }>;
}

export interface ApiPlace {
  id: string;
  name: string;
  address: string;
  road_address: string | null;
  category: string;
  lat: number;
  lng: number;
}

export interface ApiProfile {
  road_preference: 'HIGHWAY' | 'LOCAL' | 'NONE';
  weights: Partial<Record<FactorCode, number>>;
}

// ───────────── 요청 ─────────────

const ROAD_PREFERENCE: Record<EffectivePreferences['roadTypePreference'], ApiProfile['road_preference']> = {
  highway: 'HIGHWAY',
  general: 'LOCAL',
  none: 'NONE',
};

/** 백엔드가 받는 가중치 범위 (schemas.py 의 Weight) */
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 5;

/**
 * 앱의 유효 선호(설문·직접 설정·동의한 모의 학습을 합친 값)를 백엔드 profile 로 바꾼다.
 * 점수에 쓰는 요소만 보내고, 가중치는 백엔드 범위(0~5)로 자른다.
 */
export function toApiProfile(prefs: EffectivePreferences): ApiProfile {
  const weights: Partial<Record<FactorCode, number>> = {};
  for (const code of FACTOR_ORDER) {
    if (!FACTORS[code].scored) continue;
    const w = prefs.weights[code];
    if (typeof w !== 'number' || !Number.isFinite(w)) continue;
    weights[code] = Math.round(Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w)) * 100) / 100;
  }
  return { road_preference: ROAD_PREFERENCE[prefs.roadTypePreference], weights };
}

// ───────────── 응답 ─────────────

const UNITS: readonly MeasureUnit[] = ['count', 'km', 'lanes'];
const VERIFICATIONS: readonly Verification[] = ['confirmed', 'estimated', 'unverified'];
const SOURCE_KINDS: readonly DataSource['kind'][] = ['demo_sample', 'public_data', 'map_provider', 'user_input'];
const MANEUVERS: readonly ManeuverKind[] = [
  'DEPART', 'STRAIGHT', 'LEFT', 'RIGHT', 'SHARP_LEFT', 'SHARP_RIGHT', 'U_TURN', 'ROUNDABOUT', 'MERGE', 'DIVERGE', 'ARRIVE',
];
const ROAD_CLASSES: readonly RoadClass[] = ['highway', 'ramp', 'arterial', 'collector', 'local'];
const CATEGORIES: readonly PlaceCategory[] = [
  'station', 'university', 'school', 'park', 'market', 'hospital', 'mart', 'landmark', 'parking',
];
const FACTOR_SET = new Set<string>(FACTOR_ORDER);

/** 응답이 약속한 모양이 아닐 때. 화면에는 "경로를 불러오지 못했어요"로 보인다 */
export class ApiShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiShapeError';
  }
}

const SERVER_SOURCE: DataSource = { kind: 'map_provider', name: '경로 서버' };

function toSource(raw: ApiMeasurement['source']): DataSource {
  const kind = SOURCE_KINDS.includes(raw?.kind as DataSource['kind']) ? (raw!.kind as DataSource['kind']) : SERVER_SOURCE.kind;
  return { kind, name: raw?.name || SERVER_SOURCE.name };
}

/** 측정값 하나. 값이 없거나 이상하면 "정보 없음"으로 둔다 (0 으로 채우지 않는다) */
export function toMeasurement(code: FactorCode, raw: ApiMeasurement | undefined): Measurement {
  const unit: MeasureUnit = raw && UNITS.includes(raw.unit as MeasureUnit) ? (raw.unit as MeasureUnit) : FACTORS[code].unit;
  const source = toSource(raw?.source);
  const value = raw?.value;
  if (!raw || raw.availability === 'unknown' || typeof value !== 'number' || !Number.isFinite(value)) {
    return { availability: 'unknown', unit, source };
  }
  const verification = VERIFICATIONS.includes(raw.verification as Verification) ? (raw.verification as Verification) : 'unverified';
  if (raw.availability === 'partial') {
    const coverage = typeof raw.coverage === 'number' ? Math.min(1, Math.max(0, raw.coverage)) : 0;
    return { availability: 'partial', value, unit, coverage, source, verification };
  }
  return { availability: 'known', value, unit, source, verification };
}

function toFactors(raw: Record<string, ApiMeasurement>): RouteFactors {
  const factors = {} as RouteFactors;
  for (const code of FACTOR_ORDER) factors[code] = toMeasurement(code, raw?.[code]);
  return factors;
}

function toStepFactors(raw: Record<string, number>): Partial<Record<FactorCode, number>> {
  const out: Partial<Record<FactorCode, number>> = {};
  for (const [code, value] of Object.entries(raw ?? {})) {
    if (FACTOR_SET.has(code) && typeof value === 'number' && Number.isFinite(value) && value !== 0) out[code as FactorCode] = value;
  }
  return out;
}

export function toStep(raw: ApiStep): GuidanceStep {
  if (!MANEUVERS.includes(raw.maneuver as ManeuverKind)) throw new ApiShapeError(`알 수 없는 안내 동작: ${raw.maneuver}`);
  const roadClass = (raw.road_class ?? '').toLowerCase() as RoadClass;
  return {
    index: raw.index,
    maneuver: raw.maneuver as ManeuverKind,
    instruction: raw.instruction,
    // 이름 없는 이면도로는 null 로 온다
    roadName: raw.road_name ?? '',
    roadClass: ROAD_CLASSES.includes(roadClass) ? roadClass : 'local',
    point: { lat: raw.lat, lng: raw.lng },
    offsetM: raw.offset_m,
    lengthM: raw.distance_m,
    durationS: raw.duration_s,
    turnAngleDeg: raw.turn_angle_deg,
    factors: toStepFactors(raw.factors),
    unknownFactors: (raw.unknown_factors ?? []).filter((c): c is FactorCode => FACTOR_SET.has(c)),
  };
}

function toToll(raw: ApiRoute['toll'] | undefined): TollInfo {
  return raw && raw.availability === 'known' && typeof raw.won === 'number' ? { availability: 'known', won: raw.won } : { availability: 'unknown' };
}

export function toRouteCandidate(raw: ApiRoute): RouteCandidate {
  const path = decodePolyline(raw.polyline);
  if (path.length < 2) throw new ApiShapeError('경로 좌표가 너무 적어요.');
  return {
    id: raw.route_id,
    label: raw.label,
    via: raw.via,
    path,
    distanceM: raw.distance_m,
    durationS: raw.duration_s,
    toll: toToll(raw.toll),
    factors: toFactors(raw.factors),
    steps: raw.steps.map(toStep),
  };
}

function toExcluded(raw: ApiRouteSearchResponse['excluded']): ExcludedRoute[] {
  return (raw ?? [])
    .filter((e) => e && e.reason === 'restricted' && typeof e.description === 'string')
    .map((e) => ({ reason: 'restricted', description: e.description }));
}

/**
 * 경로 검색 응답 → 앱 결과.
 * fastestDurationS: 각 경로의 duration_s − extra_duration_s 는 서버가 계산한 실제 최단 시간이다.
 * 성향을 보내면 가장 빠른 길이 후보에서 빠질 수 있어서, 앱은 이 값을 추가 시간의 기준으로 쓴다.
 */
export function toRouteSearchResult(raw: ApiRouteSearchResponse): RouteSearchResult {
  if (!raw || !Array.isArray(raw.routes)) throw new ApiShapeError('경로 응답에 routes 가 없어요.');
  const candidates = raw.routes.map(toRouteCandidate);
  const baselines = raw.routes
    .map((r) => r.duration_s - r.extra_duration_s)
    .filter((v) => Number.isFinite(v) && v > 0);
  return {
    candidates,
    excluded: toExcluded(raw.excluded),
    fastestDurationS: baselines.length > 0 ? Math.min(...baselines) : undefined,
  };
}

export function toPlace(raw: ApiPlace): Place {
  const category = CATEGORIES.includes(raw.category as PlaceCategory) ? (raw.category as PlaceCategory) : 'landmark';
  return {
    id: `kakao:${raw.id}`,
    name: raw.name,
    address: raw.road_address || raw.address,
    category,
    location: { lat: raw.lat, lng: raw.lng },
  };
}
