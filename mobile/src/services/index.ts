import { DemoNavigationSimulator } from '../mock/navigationSimulator';
import { DemoPlaceSearchProvider } from '../mock/mockPlaceSearch';
import { DemoRecommendationService } from '../mock/mockRecommendation';
import { DemoRouteProvider } from '../mock/mockRouteProvider';
import { getScenario } from '../mock/scenario';
import { BackendPlaceSearchProvider } from './backend/BackendPlaceSearchProvider';
import { BackendRouteProvider } from './backend/BackendRouteProvider';
import { API_BASE_URL, DATA_SOURCE } from './config';
import { AsyncStorageRepository } from './repository/AsyncStorageRepository';
import { FaultInjectingRepository } from './repository/FaultInjectingRepository';
import type {
  LocalRepository,
  NavigationSimulator,
  PlaceSearchProvider,
  RecommendationService,
  RouteProvider,
} from './types';

/**
 * 서비스 조립 지점 (composition root).
 * 후속 팀이 실제 구현으로 바꿀 때 이 파일의 createDemoServices 만 고치면 화면 코드는 그대로 쓸 수 있다.
 *
 *   places         장소 검색          → 카카오 로컬/자체 검색 API
 *   routes         경로 후보·도로 특성 → 백엔드 /v1/routes/search (README 의 연결 지점 참고)
 *   recommendation 순위·추천 이유      → 추천·개인화 모델
 *   createSimulator 주행 시뮬레이션   → 실제 위치 기반 안내로 교체할 때 대체
 *   repository     로컬 저장          → 필요하면 보안 저장소로 교체
 */
export interface Services {
  places: PlaceSearchProvider;
  routes: RouteProvider;
  recommendation: RecommendationService;
  createSimulator: () => NavigationSimulator;
  repository: LocalRepository;
}

export function createDemoServices(): Services {
  return {
    places: new DemoPlaceSearchProvider(),
    routes: new DemoRouteProvider(),
    recommendation: new DemoRecommendationService(),
    createSimulator: () => new DemoNavigationSimulator(),
    repository: new FaultInjectingRepository(new AsyncStorageRepository(), () => getScenario().storageFails),
  };
}

/**
 * 백엔드(/v1)로 장소·경로를 받는 조립. 추천·시뮬레이션·저장은 데모와 같은 구현을 쓴다.
 * 성향은 경로 요청에 함께 보내고(BackendRouteProvider), 순위·이유는 앱이 만든다.
 */
export function createBackendServices(baseUrl: string = API_BASE_URL): Services {
  return {
    ...createDemoServices(),
    places: new BackendPlaceSearchProvider(baseUrl),
    routes: new BackendRouteProvider(baseUrl),
  };
}

/** 설정(services/config.ts 의 EXPO_PUBLIC_DATA_SOURCE)에 따라 고른다. 기본은 데모 */
export function createServices(): Services {
  return DATA_SOURCE === 'backend' ? createBackendServices() : createDemoServices();
}

let current: Services | null = null;

export function getServices(): Services {
  if (!current) current = createServices();
  return current;
}

/** 테스트에서 가짜 서비스를 주입한다 */
export function setServices(services: Services | null): void {
  current = services;
}
