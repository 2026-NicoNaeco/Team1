import { resolvePreferences, createDefaultProfile } from '../../domain/preferences';
import { emptyLearned } from '../../domain/learning';
import type { Place, RouteSearchResult } from '../../domain/types';
import { RouteProviderError, type RouteProvider, type RouteRequestOptions } from '../types';
import { BackendError, requestJson } from './http';
import { ApiShapeError, toApiProfile, toRouteSearchResult, type ApiRouteSearchResponse } from './mappers';

const MAX_ROUTES = 3;

/** 백엔드 오류 → 화면이 다루는 경로 오류. 문구는 사용자에게 그대로 보인다 */
export function toRouteProviderError(error: unknown): RouteProviderError {
  if (error instanceof RouteProviderError) return error;
  if (error instanceof ApiShapeError) return new RouteProviderError('UNSUPPORTED', '경로 정보를 읽지 못했어요.', false);
  if (error instanceof BackendError) {
    switch (error.code) {
      case 'SAME_LOCATION':
        return new RouteProviderError('SAME_LOCATION', '출발지와 도착지가 같아요.', false);
      case 'OUT_OF_SERVICE_AREA':
        return new RouteProviderError('OUT_OF_SERVICE_AREA', '아직 경로를 찾을 수 없는 지역이에요. 지원하는 지역 안에서 출발지와 도착지를 골라 주세요.', false);
      case 'ROUTE_NOT_FOUND':
        return new RouteProviderError('ROUTE_NOT_FOUND', '두 지점을 잇는 경로를 찾지 못했어요.', false);
      case 'TIMEOUT':
        return new RouteProviderError('TIMEOUT', '서버가 제때 응답하지 않았어요.', true);
      case 'VALIDATION_ERROR':
        return new RouteProviderError('UNSUPPORTED', '경로를 찾을 수 없는 요청이에요.', false);
      default:
        // 연결 실패·서버 오류(5xx)는 다시 시도해 볼 만하다
        return new RouteProviderError('NETWORK', '경로를 불러오지 못했어요.', error.status === 0 || error.status >= 500);
    }
  }
  return new RouteProviderError('NETWORK', '경로를 불러오지 못했어요.', true);
}

/**
 * 백엔드 경로 탐색 (POST /v1/routes/search).
 * 첫 실행 설문부터 이어지는 운전 성향을 profile 로 보내, 후보 자체가 성향을 반영하게 한다.
 * 그래서 설정이 바뀌면 후보를 다시 받아 와야 한다 (candidatesDependOnPreferences).
 * 순위·추천 이유는 앱의 RecommendationService 가 만든다.
 */
export class BackendRouteProvider implements RouteProvider {
  readonly candidatesDependOnPreferences = true;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async findRoutes(origin: Place, destination: Place, options?: RouteRequestOptions): Promise<RouteSearchResult> {
    const preferences = options?.preferences ?? resolvePreferences(createDefaultProfile(new Date().toISOString()), emptyLearned());
    try {
      const body = await requestJson<ApiRouteSearchResponse>(`${this.baseUrl}/v1/routes/search`, {
        method: 'POST',
        body: {
          origin: origin.location,
          destination: destination.location,
          profile: toApiProfile(preferences),
          max_routes: MAX_ROUTES,
        },
        signal: options?.signal,
        fetchImpl: this.fetchImpl,
      });
      return toRouteSearchResult(body);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') throw error;
      throw toRouteProviderError(error);
    }
  }
}
