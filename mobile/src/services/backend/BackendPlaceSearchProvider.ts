import type { Place } from '../../domain/types';
import type { PlaceSearchProvider, RequestOptions } from '../types';
import { BackendError, requestJson } from './http';
import { toPlace, type ApiPlace } from './mappers';
import { SAMPLE_ORIGIN, SAMPLE_PLACES, SERVICE_BBOX } from './samplePlaces';

/**
 * 백엔드 장소 검색 (GET /v1/places/search, 카카오 로컬 프록시).
 * 서버에 카카오 키가 없으면(503 PLACE_SEARCH_UNAVAILABLE) 개발용 샘플 지점 안에서만 찾는다.
 * 그때도 없는 장소를 만들어 내지 않는다.
 */
export class BackendPlaceSearchProvider implements PlaceSearchProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  getDefaultOrigin(): Place {
    return SAMPLE_ORIGIN;
  }

  async listSamples(): Promise<Place[]> {
    return SAMPLE_PLACES;
  }

  /** 도로망 범위 밖(데모 도시의 최근 목적지, 예전 광주 샘플 지점, 범위 밖 검색 결과)은 경로를 찾을 수 없다 */
  isServiceable(place: Place): boolean {
    const { lat, lng } = place.location;
    return lat >= SERVICE_BBOX.minLat && lat <= SERVICE_BBOX.maxLat && lng >= SERVICE_BBOX.minLng && lng <= SERVICE_BBOX.maxLng;
  }

  async search(query: string, options?: RequestOptions): Promise<Place[]> {
    const q = query.trim();
    if (!q) return [];
    const near = SAMPLE_ORIGIN.location;
    const url = `${this.baseUrl}/v1/places/search?q=${encodeURIComponent(q)}&lat=${near.lat}&lng=${near.lng}&size=15`;
    try {
      const body = await requestJson<{ places: ApiPlace[] }>(url, { signal: options?.signal, fetchImpl: this.fetchImpl });
      return (body.places ?? []).map(toPlace);
    } catch (error) {
      if (error instanceof BackendError && error.code === 'PLACE_SEARCH_UNAVAILABLE') {
        return [SAMPLE_ORIGIN, ...SAMPLE_PLACES].filter((p) => p.name.includes(q));
      }
      throw error;
    }
  }
}
