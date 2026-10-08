/**
 * 화면(UI)이 의존하는 서비스 인터페이스.
 * 데모에서는 src/mock 의 구현을 쓰고, 후속 팀은 같은 인터페이스를 구현해 services/index.ts 에서 교체한다.
 * 화면 코드는 이 파일의 타입만 알면 된다.
 */

import type {
  DriverProfile,
  EffectivePreferences,
  ExcludedRoute,
  GeoPoint,
  GuidanceStep,
  LearnedState,
  Place,
  RecommendationResult,
  RouteCandidate,
  RouteSearchResult,
  SimulationRecord,
} from '../domain/types';

export interface RequestOptions {
  signal?: AbortSignal;
}

// ───────────── 장소 검색 ─────────────

export interface PlaceSearchProvider {
  /** 처음 앱을 열었을 때의 출발지. 데모에서는 실제 위치 권한 없이 가상의 위치를 쓴다. */
  getDefaultOrigin(): Place;
  /** 검색어와 일치하는 장소. 일치하는 장소가 없으면 빈 배열을 돌려준다 (없는 장소를 만들어 내지 않는다). */
  search(query: string, options?: RequestOptions): Promise<Place[]>;
  /** 처음 화면에서 고를 수 있는 샘플 장소 */
  listSamples(options?: RequestOptions): Promise<Place[]>;
}

// ───────────── 경로 조회 ─────────────

export type RouteProviderErrorCode = 'NETWORK' | 'TIMEOUT' | 'SAME_LOCATION' | 'UNSUPPORTED';

export class RouteProviderError extends Error {
  readonly code: RouteProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: RouteProviderErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'RouteProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface RouteProvider {
  /**
   * 출발지와 목적지 사이의 경로 후보와 도로 특성을 돌려준다.
   * 법규·통행 제한을 어기는 경로는 candidates 에 넣지 않고 excluded 로 알린다.
   * 후보가 없으면 candidates 가 빈 배열이다 (오류가 아니다).
   * 순위·추천 이유는 여기서 만들지 않는다 (RecommendationService 의 책임).
   */
  findRoutes(origin: Place, destination: Place, options?: RequestOptions): Promise<RouteSearchResult>;
}

// ───────────── 추천 ─────────────

export interface RecommendationInput {
  candidates: readonly RouteCandidate[];
  preferences: EffectivePreferences;
  excluded?: readonly ExcludedRoute[];
}

export interface RecommendationService {
  recommend(input: RecommendationInput): Promise<RecommendationResult>;
}

// ───────────── 주행 시뮬레이션 ─────────────

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'arrived' | 'stopped';

export interface SimulationSnapshot {
  status: SimulationStatus;
  /** 경로 시작점부터 진행한 거리(m) */
  progressM: number;
  totalM: number;
  /** 0~1 */
  fraction: number;
  position: GeoPoint;
  headingDeg: number;
  /** 가장 최근에 지나온 안내 단계 */
  currentStep: GuidanceStep;
  /** 다음 안내. 도착 직전에는 ARRIVE 단계다. 이미 도착했으면 null */
  nextStep: GuidanceStep | null;
  /** 그다음 안내(미리보기). 없으면 null */
  thenStep: GuidanceStep | null;
  distanceToNextM: number;
  remainingM: number;
  remainingS: number;
}

export interface NavigationSimulator {
  /** 선택한 경로 위에서 시뮬레이션을 시작한다. fromProgressM 로 중간에서 이어갈 수 있다. */
  start(route: RouteCandidate, options?: { fromProgressM?: number }): void;
  pause(): void;
  resume(): void;
  /** 사용자가 중간에 끝낸다 */
  stop(): void;
  getSnapshot(): SimulationSnapshot | null;
  subscribe(listener: (snapshot: SimulationSnapshot) => void): () => void;
  dispose(): void;
}

// ───────────── 로컬 저장 ─────────────

export interface PersistedData {
  profile: DriverProfile | null;
  learned: LearnedState | null;
  records: SimulationRecord[];
  recents: Place[];
}

export interface LoadResult {
  data: PersistedData;
  /** 읽을 수 없어 버린 항목 (손상된 저장값 등) */
  discarded: string[];
}

export interface LocalRepository {
  load(): Promise<LoadResult>;
  saveProfile(profile: DriverProfile): Promise<void>;
  saveLearned(learned: LearnedState): Promise<void>;
  saveRecords(records: SimulationRecord[]): Promise<void>;
  saveRecents(places: Place[]): Promise<void>;
  /** 시뮬레이션 기록만 지운다 */
  clearRecords(): Promise<void>;
  /** 모의 개인화 결과만 지운다 */
  clearLearned(): Promise<void>;
  /** 뉴비맵이 저장한 모든 값(성향·기록·피드백·개인화 결과·캐시)을 지운다 */
  clearAll(): Promise<void>;
}
