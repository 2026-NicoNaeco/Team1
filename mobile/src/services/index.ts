import { DemoNavigationSimulator } from '../mock/navigationSimulator';
import { DemoPlaceSearchProvider } from '../mock/mockPlaceSearch';
import { DemoRecommendationService } from '../mock/mockRecommendation';
import { DemoRouteProvider } from '../mock/mockRouteProvider';
import { getScenario } from '../mock/scenario';
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

let current: Services | null = null;

export function getServices(): Services {
  if (!current) current = createDemoServices();
  return current;
}

/** 테스트에서 가짜 서비스를 주입한다 */
export function setServices(services: Services | null): void {
  current = services;
}
