import { FACTOR_ORDER } from '../../../domain/factors';
import { emptyLearned } from '../../../domain/learning';
import { createDefaultProfile, resolvePreferences } from '../../../domain/preferences';
import { recommend } from '../../../domain/recommend';
import type { DriverProfile } from '../../../domain/types';
import { RouteProviderError } from '../../types';
import { BackendPlaceSearchProvider } from '../BackendPlaceSearchProvider';
import { BackendRouteProvider } from '../BackendRouteProvider';
import { toApiProfile, toMeasurement, toRouteSearchResult, type ApiRouteSearchResponse } from '../mappers';
import { SAMPLE_ORIGIN, SAMPLE_PLACES } from '../samplePlaces';
// 실제 백엔드(backend/, 샘플 도로망)가 돌려준 응답. 성향 {MERGE_DIVERGE: 5} 라 가장 빠른 길(527초)이 후보에 없다
import fixture from './route-search.fixture.json';

const NOW = '2026-10-24T09:00:00.000Z';
const prefsOf = (patch: Partial<DriverProfile> = {}) => resolvePreferences({ ...createDefaultProfile(NOW), ...patch }, emptyLearned());
const response = fixture as unknown as ApiRouteSearchResponse;

function fakeFetch(status: number, body: unknown, calls: Array<{ url: string; init?: RequestInit }> = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe('백엔드 경로 응답 변환', () => {
  const result = toRouteSearchResult(response);

  it('모든 경로를 앱 후보로 바꾸고, 15개 요소를 모두 채운다', () => {
    expect(result.candidates).toHaveLength(response.routes.length);
    for (const c of result.candidates) {
      expect(Object.keys(c.factors).sort()).toEqual([...FACTOR_ORDER].sort());
      expect(c.path.length).toBeGreaterThanOrEqual(2);
      expect(c.id).toMatch(/^r_/);
    }
  });

  it('필드 이름만 바꾸고 값은 그대로 둔다', () => {
    const raw = response.routes[0]!;
    const c = result.candidates[0]!;
    expect([c.label, c.via, c.distanceM, c.durationS]).toEqual([raw.label, raw.via, raw.distance_m, raw.duration_s]);
    const rawStep = raw.steps[1]!;
    const step = c.steps[1]!;
    expect(step.lengthM).toBe(rawStep.distance_m);
    expect(step.offsetM).toBe(rawStep.offset_m);
    expect(step.point).toEqual({ lat: rawStep.lat, lng: rawStep.lng });
    expect(step.roadClass).toBe(rawStep.road_class.toLowerCase());
  });

  it('이름 없는 도로(null)는 빈 문자열로 바꾼다', () => {
    const steps = result.candidates.flatMap((c) => c.steps);
    expect(steps.some((s) => s.roadName === '')).toBe(true);
    expect(steps.every((s) => typeof s.roadName === 'string')).toBe(true);
  });

  it('"정보 없음"은 값 없이 그대로 두고 0 으로 바꾸지 않는다 (샘플 도로망은 차로 변경 자료가 없다)', () => {
    for (const c of result.candidates) {
      expect(c.factors.LANE_CHANGE.availability).toBe('unknown');
      expect('value' in c.factors.LANE_CHANGE).toBe(false);
    }
  });

  it('모르는 단위·값이 오면 "정보 없음"으로 둔다', () => {
    expect(toMeasurement('TRAFFIC_LIGHT', { availability: 'known', value: null, unit: 'count' }).availability).toBe('unknown');
    expect(toMeasurement('TRAFFIC_LIGHT', undefined).availability).toBe('unknown');
    expect(toMeasurement('NARROW_ROAD', { availability: 'partial', value: 0.4, unit: 'km', coverage: 1.7 })).toMatchObject({ coverage: 1 });
  });

  it('서버가 계산한 실제 최단 시간을 함께 넘긴다 (duration_s − extra_duration_s)', () => {
    const raw = response.routes[0]!;
    expect(result.fastestDurationS).toBe(raw.duration_s - raw.extra_duration_s);
    expect(result.fastestDurationS).toBeLessThan(Math.min(...result.candidates.map((c) => c.durationS)));
  });

  it('추천까지 이어 붙이면, 후보에 없는 가장 빠른 길을 기준으로 추가 시간을 말하고 그 사실을 알린다', () => {
    const rec = recommend(result.candidates, prefsOf(), result.excluded, { fastestDurationS: result.fastestDurationS });
    expect(rec.fastestRouteId).toBeNull();
    expect(rec.items.every((i) => i.extraMinutes > 0)).toBe(true);
    expect(rec.notices.some((n) => n.kind === 'fastest_not_included')).toBe(true);
  });
});

describe('운전 성향 → 백엔드 profile', () => {
  it('도로 유형 선호를 백엔드 값으로 바꾼다', () => {
    expect(toApiProfile(prefsOf({ roadTypePreference: 'highway' })).road_preference).toBe('HIGHWAY');
    expect(toApiProfile(prefsOf({ roadTypePreference: 'general' })).road_preference).toBe('LOCAL');
    expect(toApiProfile(prefsOf({ roadTypePreference: 'none' })).road_preference).toBe('NONE');
  });

  it('점수에 쓰는 요소만 보내고 가중치는 0~5 안이다', () => {
    const { weights } = toApiProfile(prefsOf({ priorities: { UNPROTECTED_LEFT: 'avoid', LANE_CHANGE: 'relaxed' } }));
    expect(weights.LANE_COUNT).toBeUndefined();
    expect(weights.ROAD_TYPE).toBeUndefined();
    for (const w of Object.values(weights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(5);
    }
    expect(weights.UNPROTECTED_LEFT!).toBeGreaterThan(weights.LANE_CHANGE!);
  });
});

describe('BackendRouteProvider', () => {
  it('출발·도착 좌표와 성향을 보내고 결과를 바꿔 돌려준다', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new BackendRouteProvider('http://api.test', fakeFetch(200, response, calls));
    const result = await provider.findRoutes(SAMPLE_ORIGIN, SAMPLE_PLACES[0]!, { preferences: prefsOf({ roadTypePreference: 'highway' }) });
    expect(result.candidates).toHaveLength(response.routes.length);
    expect(calls[0]!.url).toBe('http://api.test/v1/routes/search');
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect(sent.origin).toEqual(SAMPLE_ORIGIN.location);
    expect(sent.profile.road_preference).toBe('HIGHWAY');
    expect(provider.candidatesDependOnPreferences).toBe(true);
  });

  it.each([
    ['SAME_LOCATION', 422, 'SAME_LOCATION', false],
    ['OUT_OF_SERVICE_AREA', 422, 'OUT_OF_SERVICE_AREA', false],
    ['ROUTE_NOT_FOUND', 404, 'ROUTE_NOT_FOUND', false],
    ['INTERNAL', 500, 'NETWORK', true],
  ] as const)('백엔드 오류 %s 를 화면용 오류로 바꾼다', async (code, status, expected, retryable) => {
    const provider = new BackendRouteProvider('http://api.test', fakeFetch(status, { error: { code, message: '서버 문구' } }));
    const error = await provider.findRoutes(SAMPLE_ORIGIN, SAMPLE_PLACES[0]!).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RouteProviderError);
    expect((error as RouteProviderError).code).toBe(expected);
    expect((error as RouteProviderError).retryable).toBe(retryable);
  });

  it('연결이 안 되면 다시 시도할 수 있는 오류로 알린다', async () => {
    const failing = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const error = await new BackendRouteProvider('http://api.test', failing).findRoutes(SAMPLE_ORIGIN, SAMPLE_PLACES[0]!).catch((e: unknown) => e);
    expect((error as RouteProviderError).code).toBe('NETWORK');
    expect((error as RouteProviderError).retryable).toBe(true);
  });

  it('호출한 쪽이 취소하면 AbortError 를 그대로 던진다 (화면은 무시한다)', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const error = await new BackendRouteProvider('http://api.test', fakeFetch(200, response))
      .findRoutes(SAMPLE_ORIGIN, SAMPLE_PLACES[0]!, { signal: ctrl.signal })
      .catch((e: unknown) => e);
    expect((error as Error).name).toBe('AbortError');
  });
});

describe('BackendPlaceSearchProvider', () => {
  it('검색 결과를 앱 장소로 바꾼다', async () => {
    const body = { places: [{ id: '1', name: '광주역', address: '광주 북구', road_address: '광주 북구 무등로', category: 'station', lat: 35.16, lng: 126.9 }] };
    const places = await new BackendPlaceSearchProvider('http://api.test', fakeFetch(200, body)).search('광주역');
    expect(places).toEqual([{ id: 'kakao:1', name: '광주역', address: '광주 북구 무등로', category: 'station', location: { lat: 35.16, lng: 126.9 } }]);
  });

  it('서버에 장소 검색 키가 없으면 샘플 지점 안에서만 찾는다 (없는 장소를 만들지 않는다)', async () => {
    const provider = new BackendPlaceSearchProvider('http://api.test', fakeFetch(503, { error: { code: 'PLACE_SEARCH_UNAVAILABLE', message: '' } }));
    expect((await provider.search('회전교차로')).map((p) => p.id)).toEqual(['sample:roundabout']);
    expect(await provider.search('광주역')).toEqual([]);
  });

  it('데모 도시(0,0 부근)에서 저장된 장소는 경로를 찾을 수 없는 곳으로 거른다', () => {
    const provider = new BackendPlaceSearchProvider('http://api.test');
    expect(provider.isServiceable({ ...SAMPLE_ORIGIN, location: { lat: 0.02, lng: 0.05 } })).toBe(false);
    expect(provider.isServiceable(SAMPLE_ORIGIN)).toBe(true);
  });
});
