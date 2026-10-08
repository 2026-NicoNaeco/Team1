/**
 * 뉴비맵 도메인 타입.
 *
 * 설계 원칙
 * - 도로 특성(RouteCandidate)과 추천 결과(RecommendationResult)는 서로 다른 객체다.
 *   같은 경로라도 사용자 설정에 따라 순위와 설명이 달라질 수 있기 때문이다.
 * - 모든 도로 특성은 Measurement 로 표현해 "0회"와 "정보 없음", "모의 데이터"와 "누락"을 구분한다.
 * - 좌표는 WGS84 위·경도(GeoPoint)다. 데모 지도는 가상 지역이지만 형식은 실제 지도 SDK 와 같다.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ───────────────────────── 운전 요소 ─────────────────────────

/**
 * 운전 요소 코드. 백엔드(app/domain/factors.py)와 이름이 같은 것은 그대로 쓰고,
 * 프런트 기획에서 별도로 다루는 요소만 추가했다. 대응표는 README 참고.
 */
export type FactorCode =
  | 'TRAFFIC_LIGHT'
  | 'PROTECTED_ZONE'
  | 'UNPAVED_ROAD'
  | 'NARROW_ROAD'
  | 'TURN_COUNT'
  | 'UNPROTECTED_LEFT'
  | 'U_TURN'
  | 'SHARP_TURN'
  | 'ROUNDABOUT'
  | 'LANE_CHANGE'
  | 'MERGE_DIVERGE'
  | 'LANE_COUNT'
  | 'TRAFFIC_VOLUME'
  | 'ACCIDENT_ZONE'
  | 'ROAD_TYPE';

export type MeasureUnit = 'count' | 'km' | 'lanes';

export type DataSourceKind = 'demo_sample' | 'public_data' | 'map_provider' | 'user_input';

export interface DataSource {
  kind: DataSourceKind;
  name: string;
}

/** confirmed: 제공처에서 확인 / estimated: 추정값 / unverified: 검증되지 않음(데모 값 포함) */
export type Verification = 'confirmed' | 'estimated' | 'unverified';

/**
 * 도로 특성 한 항목의 측정값.
 * - known: 경로 전체에 대해 값을 알고 있다. value 가 0 이면 "확인한 결과 없음"이다.
 * - partial: 일부 구간만 확인했다. value 는 확인된 구간 기준이며 coverage(0~1)는 확인된 길이 비율이다.
 * - unknown: 정보가 없다. 0 으로 취급하거나 "안전함"으로 해석하면 안 된다.
 */
export type Measurement =
  | {
      availability: 'known';
      value: number;
      unit: MeasureUnit;
      source: DataSource;
      verification: Verification;
      note?: string;
    }
  | {
      availability: 'partial';
      value: number;
      unit: MeasureUnit;
      coverage: number;
      source: DataSource;
      verification: Verification;
      note?: string;
    }
  | {
      availability: 'unknown';
      unit: MeasureUnit;
      source: DataSource;
      note?: string;
    };

export type RouteFactors = Record<FactorCode, Measurement>;

// ───────────────────────── 장소·경로 ─────────────────────────

export type PlaceCategory =
  | 'station'
  | 'university'
  | 'school'
  | 'park'
  | 'market'
  | 'hospital'
  | 'mart'
  | 'landmark'
  | 'parking';

export interface Place {
  id: string;
  name: string;
  address: string;
  category: PlaceCategory;
  location: GeoPoint;
}

export type RoadClass = 'highway' | 'ramp' | 'arterial' | 'collector' | 'local';

/** 백엔드 Step.maneuver 와 같은 집합에 MERGE/DIVERGE 를 더했다. */
export type ManeuverKind =
  | 'DEPART'
  | 'STRAIGHT'
  | 'LEFT'
  | 'RIGHT'
  | 'SHARP_LEFT'
  | 'SHARP_RIGHT'
  | 'U_TURN'
  | 'ROUNDABOUT'
  | 'MERGE'
  | 'DIVERGE'
  | 'ARRIVE';

export interface GuidanceStep {
  index: number;
  maneuver: ManeuverKind;
  /** 화면에 그대로 보여주는 안내 문구. 예: "우회전 · 새싹대로" */
  instruction: string;
  roadName: string;
  roadClass: RoadClass;
  point: GeoPoint;
  /** 경로 시작점부터 이 안내 지점까지의 거리(m) */
  offsetM: number;
  /** 이 안내 지점에서 다음 안내 지점까지의 거리(m). ARRIVE 는 0 */
  lengthM: number;
  durationS: number;
  /** 회전 각도(-180~180). 양수는 우회전, 직진·출발·도착은 0 */
  turnAngleDeg: number;
  /** 이 단계에서 발생하는 요소. count 요소는 횟수, km 요소는 km */
  factors: Partial<Record<FactorCode, number>>;
  /** 이 단계에서 정보를 확인할 수 없는 요소 */
  unknownFactors: FactorCode[];
}

export type TollInfo =
  | { availability: 'known'; won: number }
  | { availability: 'unknown' };

/** 경로 후보: 도로 특성만 담는다. 순위·점수·추천 이유는 RecommendationResult 에 있다. */
export interface RouteCandidate {
  id: string;
  /** 지도·카드·상세에서 같은 경로를 가리키는 식별 글자(A, B, C) */
  label: string;
  /** 경유 도로 요약. 예: "중앙대로 · 한빛대로" */
  via: string;
  path: GeoPoint[];
  distanceM: number;
  durationS: number;
  toll: TollInfo;
  factors: RouteFactors;
  steps: GuidanceStep[];
}

/** 통행 제한 등으로 후보에서 제외된 경로에 대한 안내 */
export interface ExcludedRoute {
  reason: 'restricted';
  description: string;
}

export interface RouteSearchResult {
  candidates: RouteCandidate[];
  excluded: ExcludedRoute[];
}

// ───────────────────────── 사용자 성향 ─────────────────────────

/** 요소별 회피 우선순위: 신경 안 써요 / 보통 / 되도록 피하고 싶어요 */
export type PriorityLevel = 'relaxed' | 'normal' | 'avoid';

export type RoadTypePreference = 'highway' | 'general' | 'none';

export type DrivingFrequency = 'rare' | 'sometimes' | 'often' | 'unknown';

export interface DriverProfile {
  schemaVersion: 1;
  onboardingCompleted: boolean;
  frequency: DrivingFrequency;
  roadTypePreference: RoadTypePreference;
  /** 가장 빠른 경로보다 더 걸려도 되는 시간(분) */
  maxExtraMinutes: number;
  /** 사용자가 직접 정한 요소만 들어 있다. 여기 없는 요소는 자동(기본값 + 모의 학습)으로 계산한다. */
  priorities: Partial<Record<FactorCode, PriorityLevel>>;
  consent: {
    /** 시뮬레이션 기록을 이 기기에 저장 */
    saveRecords: boolean;
    /** 피드백을 추천에 반영(모의 규칙) */
    usePersonalization: boolean;
  };
  updatedAt: string;
}

export interface LearnedAdjustment {
  factor: FactorCode;
  /** 기본 가중치 1.0 에 더해지는 값 */
  delta: number;
  hardCount: number;
  easyCount: number;
  updatedAt: string;
}

export interface LearnedState {
  adjustments: Partial<Record<FactorCode, LearnedAdjustment>>;
  /** 추천에 반영한 피드백 횟수 */
  feedbackCount: number;
}

export type WeightSource = 'user' | 'learned' | 'default';

/** 추천 서비스가 받는 "지금 적용되는" 선호. 프로필과 모의 학습 결과를 합친 값이다. */
export interface EffectivePreferences {
  weights: Record<FactorCode, number>;
  weightSources: Record<FactorCode, WeightSource>;
  roadTypePreference: RoadTypePreference;
  maxExtraMinutes: number;
  /** 선호가 바뀌었는지 비교하기 위한 값 */
  signature: string;
}

// ───────────────────────── 추천 결과 ─────────────────────────

export type BurdenLevel = 'low' | 'medium' | 'high';

export interface ReasonItem {
  id: string;
  kind: 'fewer' | 'none' | 'fastest' | 'preference' | 'fact';
  factor?: FactorCode;
  text: string;
  /** 이 이유가 어떤 설정과 이어지는지 (상세 화면의 "내 설정과의 관계") */
  relatesTo?: { label: string; source: WeightSource };
}

export type TradeoffKind =
  | 'over_limit'
  | 'extra_time'
  | 'toll'
  | 'preference_mismatch'
  | 'more'
  | 'protected_zone'
  | 'accident_zone'
  | 'unknown_info';

export interface TradeoffItem {
  id: string;
  kind: TradeoffKind;
  factor?: FactorCode;
  text: string;
}

export interface SettingsRelationItem {
  factor: FactorCode;
  label: string;
  source: WeightSource;
  /** 이 경로의 값을 사람이 읽는 문장으로 */
  routeValueText: string;
  /** 후보 중 이 경로의 위치 */
  standing: 'lowest' | 'same' | 'higher' | 'unknown';
}

export interface RankedRoute {
  routeId: string;
  rank: number;
  isRecommended: boolean;
  /** 허용한 추가 시간 안에 들어오는지 */
  withinTimeLimit: boolean;
  /** 가장 빠른 후보 대비 추가 시간(분, 표시용으로 반올림한 값끼리의 차이) */
  extraMinutes: number;
  durationMinutes: number;
  burdenLevel: BurdenLevel;
  /** 부담에 가장 크게 반영된 요소 (최대 2개). 예: "비보호 좌회전 2회" */
  burdenDrivers: { factor: FactorCode; text: string }[];
  /** 부담을 판단할 때 확인되지 않은 정보가 있었는지 */
  hasMissingInfo: boolean;
  /** 카드 제목에 쓰는 특징 한 줄. 예: "회전이 적은 길" */
  headline: string;
  reasons: ReasonItem[];
  tradeoffs: TradeoffItem[];
  settingsRelation: SettingsRelationItem[];
}

export interface RecommendationNotice {
  kind: 'over_limit' | 'excluded_restricted' | 'single_candidate' | 'missing_info';
  text: string;
  /** over_limit 일 때 제외된 경로 id */
  routeIds?: string[];
}

export interface RecommendationResult {
  items: RankedRoute[];
  recommendedRouteId: string | null;
  /** 이 결과를 만든 선호의 signature. 현재 선호와 다르면 오래된 결과다. */
  preferenceSignature: string;
  /** 가장 빠른 후보 id */
  fastestRouteId: string | null;
  notices: RecommendationNotice[];
}

// ───────────────────────── 시뮬레이션 기록 ─────────────────────────

export type FeedbackRating = 'easy' | 'normal' | 'hard';

export interface Feedback {
  rating: FeedbackRating;
  /** 평가와 함께 고른 요소. easy 면 쉬웠던 요소, hard 면 어려웠던 요소, normal 이면 신경 쓰인 요소 */
  factors: FactorCode[];
  /** 앞으로의 추천에 반영하기로 했는지 */
  appliedToRecommendations: boolean;
}

export type SimulationOutcome = 'arrived' | 'stopped';

export interface RecordedFactor {
  availability: Measurement['availability'];
  value: number | null;
}

export interface SimulationRecord {
  id: string;
  /** 실제 운전 기록과 섞이지 않도록 항상 'simulation' 이다. */
  kind: 'simulation';
  createdAt: string;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  route: {
    id: string;
    label: string;
    headline: string;
    via: string;
    distanceM: number;
    durationMinutes: number;
    extraMinutes: number;
    burdenLevel: BurdenLevel;
    tollWon: number | null;
    factors: Partial<Record<FactorCode, RecordedFactor>>;
  };
  recommendedRouteId: string | null;
  chosenWasRecommended: boolean;
  outcome: SimulationOutcome;
  /** 0~1 */
  progress: number;
  feedback: Feedback | null;
}
