import type { ExcludedRoute, FactorCode, Place, RouteCandidate, RouteSearchResult } from '../domain/types';
import { RouteProviderError, type RequestOptions, type RouteProvider } from '../services/types';
import { CITY } from './demoCity/cityData';
import { buildRoute, type BuildOptions } from './demoCity/buildRoute';
import { buildGraph, type CityGraph, type GraphEdge } from './demoCity/graph';
import { PERSONAS, findPath, pathSimilarity, restrictedEdges } from './demoCity/pathfinding';
import { PLACE_NODE } from './places';
import { HIDDEN_ROAD_INFO, abortableDelay, consumeFailOnce, getScenario } from './scenario';

export const DEMO_GRAPH: CityGraph = buildGraph(CITY);

const LABELS = ['A', 'B', 'C', 'D'];
/** 이 값 이상 겹치는 경로는 같은 경로로 본다 */
const DUPLICATE_SIMILARITY = 0.8;

/**
 * 도로 그래프에서 후보를 만든다 (순수 함수, 지연·시나리오 없음).
 * 같은 입력에는 항상 같은 결과가 나온다.
 */
export function computeRoutes(
  graph: CityGraph,
  originNode: string,
  destinationNode: string,
  options: BuildOptions = {},
): RouteSearchResult {
  const paths: GraphEdge[][] = [];
  for (const persona of PERSONAS) {
    const path = findPath(graph, originNode, destinationNode, { persona, honorRestrictions: true });
    if (path && !paths.some((other) => pathSimilarity(path, other) >= DUPLICATE_SIMILARITY)) paths.push(path);
  }

  // 통행 제한을 무시하면 더 나은 길이 있었는지 확인해 "제외된 경로"로 알린다.
  const excluded: ExcludedRoute[] = [];
  const unrestricted = findPath(graph, originNode, destinationNode, { persona: 'fastest', honorRestrictions: false });
  if (unrestricted) {
    const blocked = restrictedEdges(unrestricted);
    const best = paths[0];
    if (blocked.length > 0 && (!best || pathSimilarity(unrestricted, best) < 0.99)) {
      excluded.push({
        reason: 'restricted',
        description: blocked[0]!.attrs.restrictedNote ?? '통행이 제한된 구간을 지나는 경로예요 (모의)',
      });
    }
  }

  const built = paths.map((path) => buildRoute(graph, path, options));
  built.sort((a, b) => a.durationS - b.durationS || a.distanceM - b.distanceM);
  const candidates: RouteCandidate[] = built.map((route, i) => ({
    ...route,
    id: `${originNode}~${destinationNode}~${LABELS[i]}`,
    label: LABELS[i]!,
  }));
  return { candidates, excluded };
}

/**
 * 데모 경로 제공자. 샘플 도로 그래프에서 후보를 계산한다.
 * 실제 경로 엔진이 아니며, 같은 출발지·목적지에는 항상 같은 후보가 나온다.
 */
export class DemoRouteProvider implements RouteProvider {
  constructor(private readonly graph: CityGraph = DEMO_GRAPH) {}

  async findRoutes(origin: Place, destination: Place, options?: RequestOptions): Promise<RouteSearchResult> {
    const scenario = getScenario();
    await abortableDelay(scenario.routeLatencyMs, options?.signal);

    if (scenario.routeFetch === 'fail_always' || consumeFailOnce()) {
      throw new RouteProviderError('NETWORK', '경로를 불러오지 못했어요 (데모 시나리오)', true);
    }
    if (origin.id === destination.id) {
      throw new RouteProviderError('SAME_LOCATION', '출발지와 도착지가 같아요.', false);
    }
    if (scenario.routeFetch === 'no_eligible') {
      return {
        candidates: [],
        excluded: [{ reason: 'restricted', description: '모든 후보가 통행 제한으로 제외됐어요 (데모 시나리오)' }],
      };
    }

    const originNode = PLACE_NODE[origin.id];
    const destinationNode = PLACE_NODE[destination.id];
    if (!originNode || !destinationNode) {
      throw new RouteProviderError('UNSUPPORTED', '데모 지도에 없는 장소예요.', false);
    }
    const forceUnknown: FactorCode[] = scenario.hideRoadInfo ? HIDDEN_ROAD_INFO : [];
    return computeRoutes(this.graph, originNode, destinationNode, { forceUnknown });
  }
}
