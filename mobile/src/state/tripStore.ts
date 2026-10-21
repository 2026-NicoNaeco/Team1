import { create } from 'zustand';
import { resolvePreferences } from '../domain/preferences';
import type {
  ExcludedRoute,
  Place,
  RankedRoute,
  RecommendationResult,
  RouteCandidate,
  SimulationOutcome,
} from '../domain/types';
import { getServices } from '../services';
import { RouteProviderError } from '../services/types';
import { useAppStore } from './appStore';

/**
 * 지금 계획 중인 이동: 출발지·목적지, 조회한 경로 후보, 추천 결과, 선택한 경로.
 *
 * - 도로 특성(candidates)과 추천 결과(recommendation)는 따로 보관한다. 설정이 바뀌면 후보는 그대로 두고 추천만 다시 계산한다.
 * - 새 검색(출발지·목적지 변경)은 이전 후보·추천·선택을 즉시 지우고, 오래된 응답은 요청 번호로 버린다.
 */

export type TripStatus = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

export interface TripError {
  code: string;
  message: string;
  retryable: boolean;
}

/** 도착 화면과 기록에 쓰는 시뮬레이션 결과 요약 (메모리에만 둔다) */
export interface RunSummary {
  route: RouteCandidate;
  ranked: RankedRoute;
  recommendedRouteId: string | null;
  origin: Place;
  destination: Place;
  outcome: SimulationOutcome;
  /** 0~1 */
  progress: number;
  progressM: number;
}

interface TripState {
  origin: Place;
  destination: Place | null;
  status: TripStatus;
  error: TripError | null;
  candidates: RouteCandidate[];
  excluded: ExcludedRoute[];
  recommendation: RecommendationResult | null;
  selectedRouteId: string | null;
  /** auto: 추천 경로를 따라감 / manual: 사용자가 직접 고름 (설정이 바뀌어도 유지) */
  selectionMode: 'auto' | 'manual';
  recomputeNotice: string | null;
  lastRun: RunSummary | null;

  setOrigin: (place: Place) => void;
  setDestination: (place: Place) => void;
  loadRoutes: () => Promise<void>;
  selectRoute: (id: string) => void;
  refreshRecommendation: () => Promise<void>;
  clearRecomputeNotice: () => void;
  setLastRun: (run: RunSummary | null) => void;
  /** 목적지와 조회 결과를 비우고 처음 상태로 돌린다 */
  resetTrip: () => void;
}

const clearedResult = {
  status: 'idle' as TripStatus,
  error: null,
  candidates: [] as RouteCandidate[],
  excluded: [] as ExcludedRoute[],
  recommendation: null,
  selectedRouteId: null,
  selectionMode: 'auto' as const,
  recomputeNotice: null,
};

let controller: AbortController | null = null;
let requestSeq = 0;
let recommendSeq = 0;

function currentPreferences() {
  const { profile, learned } = useAppStore.getState();
  return resolvePreferences(profile, learned);
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

export const useTripStore = create<TripState>()((set, get) => ({
  origin: getServices().places.getDefaultOrigin(),
  destination: null,
  lastRun: null,
  ...clearedResult,

  setOrigin: (place) => {
    controller?.abort();
    requestSeq++;
    set({ origin: place, ...clearedResult });
  },

  setDestination: (place) => {
    controller?.abort();
    requestSeq++;
    set({ destination: place, ...clearedResult });
    useAppStore.getState().addRecent(place);
  },

  loadRoutes: async () => {
    const { origin, destination } = get();
    if (!destination) return;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    const seq = ++requestSeq;
    set({ ...clearedResult, status: 'loading' });

    const services = getServices();
    try {
      const result = await services.routes.findRoutes(origin, destination, { signal: ctrl.signal });
      if (seq !== requestSeq) return;
      if (result.candidates.length === 0) {
        set({ status: 'empty', excluded: result.excluded });
        return;
      }
      const recommendation = await services.recommendation.recommend({
        candidates: result.candidates,
        preferences: currentPreferences(),
        excluded: result.excluded,
      });
      if (seq !== requestSeq) return;
      set({
        status: 'ready',
        candidates: result.candidates,
        excluded: result.excluded,
        recommendation,
        selectedRouteId: recommendation.recommendedRouteId,
        selectionMode: 'auto',
      });
    } catch (error) {
      if (seq !== requestSeq || isAbort(error)) return;
      const tripError: TripError =
        error instanceof RouteProviderError
          ? { code: error.code, message: error.message, retryable: error.retryable }
          : { code: 'UNKNOWN', message: '경로를 불러오지 못했어요.', retryable: true };
      set({ status: 'error', error: tripError });
    }
  },

  selectRoute: (id) => {
    if (!get().candidates.some((c) => c.id === id)) return;
    set({ selectedRouteId: id, selectionMode: 'manual' });
  },

  refreshRecommendation: async () => {
    const { status, candidates, excluded, recommendation } = get();
    if (status !== 'ready') return;
    const preferences = currentPreferences();
    if (recommendation?.preferenceSignature === preferences.signature) return;

    const seq = ++recommendSeq;
    const next = await getServices().recommendation.recommend({ candidates, preferences, excluded });
    // 그 사이 새 검색이 시작됐거나 다른 재계산이 끝났다면 이 결과는 버린다
    if (seq !== recommendSeq || get().candidates !== candidates) return;

    const { selectedRouteId, selectionMode } = get();
    const keepManual =
      selectionMode === 'manual' && selectedRouteId !== null && next.items.some((i) => i.routeId === selectedRouteId);
    set({
      recommendation: next,
      selectedRouteId: keepManual ? selectedRouteId : next.recommendedRouteId,
      recomputeNotice: '설정이 바뀌어 추천을 다시 계산했어요.',
    });
  },

  clearRecomputeNotice: () => set({ recomputeNotice: null }),

  setLastRun: (run) => set({ lastRun: run }),

  resetTrip: () => {
    controller?.abort();
    requestSeq++;
    set({ destination: null, ...clearedResult });
  },
}));

let synced = false;

/** 설정·모의 학습 결과가 바뀌면 조회해 둔 후보의 추천을 다시 계산한다 (앱 시작 시 한 번 호출) */
export function initTripSync(): void {
  if (synced) return;
  synced = true;
  useAppStore.subscribe((state, prev) => {
    if (state.profile !== prev.profile || state.learned !== prev.learned) {
      void useTripStore.getState().refreshRecommendation();
    }
  });
}
