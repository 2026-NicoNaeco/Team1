"""
ez_router.py
------------
"쉬운 길" 탐색 알고리즘 핵심 모듈.

- EasyRouter: 난이도 가중치 기반 Dijkstra로 "가장 쉬운 길" 탐색
- FastRouter: 거리/시간 기반 Dijkstra로 "가장 빠른 길" 탐색 (기존 알고리즘 위임)
- RouteResult: 두 결과를 함께 담는 응답 객체

그래프 구조:
    nodes: Dict[node_id, (lat, lng)]
    edges: Dict[node_id, List[(neighbor_id, EdgeFeatures)]]
"""

import heapq
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from difficulty_weights import (
    EdgeFeatures,
    UserContext,
    build_personalized_weights,
    compute_edge_difficulty,
)


# ─────────────────────────────────────────────
# 그래프 타입 정의
# ─────────────────────────────────────────────

NodeId = str  # 노드 ID (예: "N001", 또는 좌표 문자열)

Graph = Dict[NodeId, List[Tuple[NodeId, EdgeFeatures]]]
# { "A": [("B", EdgeFeatures(...)), ("C", EdgeFeatures(...))], ... }


# ─────────────────────────────────────────────
# 경로 탐색 결과 객체
# ─────────────────────────────────────────────

@dataclass
class RouteResult:
    """단일 경로 탐색 결과."""
    path: List[NodeId]         # 노드 ID 순서 (출발 -> 도착)
    total_cost: float          # 탐색 기준 총 비용 (난이도 or 거리)
    total_distance_km: float   # 실제 이동 거리 (km)
    route_type: str            # "easy" | "fast"


@dataclass
class DualRouteResult:
    """사용자에게 제공하는 두 경로 묶음."""
    easy_route: Optional[RouteResult]  # 가장 쉬운 길
    fast_route: Optional[RouteResult]  # 가장 빠른 길


# ─────────────────────────────────────────────
# 난이도 기반 Dijkstra (쉬운 길)
# ─────────────────────────────────────────────

def _dijkstra_difficulty(
    graph: Graph,
    source: NodeId,
    target: NodeId,
    weights: Dict[str, float],
    context: UserContext,
) -> Optional[RouteResult]:
    """
    난이도 점수를 edge cost로 사용하는 Dijkstra 알고리즘.

    Returns:
        RouteResult (경로 찾으면) or None (경로 없으면)
    """
    # (누적 난이도 점수, 현재 노드)
    heap: List[Tuple[float, NodeId]] = [(0.0, source)]
    best_cost: Dict[NodeId, float] = {source: 0.0}
    prev: Dict[NodeId, Optional[NodeId]] = {source: None}
    dist_km: Dict[NodeId, float] = {source: 0.0}  # 실제 거리 추적

    while heap:
        cost, node = heapq.heappop(heap)

        if node == target:
            break

        if cost > best_cost.get(node, float("inf")):
            continue  # 이미 더 좋은 경로로 방문함

        for neighbor, features in graph.get(node, []):
            edge_cost = compute_edge_difficulty(features, weights, context)
            new_cost = cost + edge_cost
            new_dist = dist_km[node] + features.base_distance_km

            if new_cost < best_cost.get(neighbor, float("inf")):
                best_cost[neighbor] = new_cost
                prev[neighbor] = node
                dist_km[neighbor] = new_dist
                heapq.heappush(heap, (new_cost, neighbor))

    if target not in best_cost:
        return None  # 경로 없음

    # 역추적으로 path 복원
    path = []
    cur = target
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    path.reverse()

    return RouteResult(
        path=path,
        total_cost=best_cost[target],
        total_distance_km=dist_km[target],
        route_type="easy",
    )


# ─────────────────────────────────────────────
# 거리 기반 Dijkstra (빠른 길)
# ─────────────────────────────────────────────

def _dijkstra_distance(
    graph: Graph,
    source: NodeId,
    target: NodeId,
) -> Optional[RouteResult]:
    """
    base_distance_km만을 edge cost로 사용하는 일반 최단거리 Dijkstra.
    기존 널리 알려진 알고리즘과 동일한 방식으로 처리.

    Returns:
        RouteResult (경로 찾으면) or None (경로 없으면)
    """
    heap: List[Tuple[float, NodeId]] = [(0.0, source)]
    best_dist: Dict[NodeId, float] = {source: 0.0}
    prev: Dict[NodeId, Optional[NodeId]] = {source: None}

    while heap:
        dist, node = heapq.heappop(heap)

        if node == target:
            break

        if dist > best_dist.get(node, float("inf")):
            continue

        for neighbor, features in graph.get(node, []):
            new_dist = dist + features.base_distance_km
            if new_dist < best_dist.get(neighbor, float("inf")):
                best_dist[neighbor] = new_dist
                prev[neighbor] = node
                heapq.heappush(heap, (new_dist, neighbor))

    if target not in best_dist:
        return None

    path = []
    cur = target
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    path.reverse()

    return RouteResult(
        path=path,
        total_cost=best_dist[target],
        total_distance_km=best_dist[target],
        route_type="fast",
    )


# ─────────────────────────────────────────────
# 메인 라우터 클래스
# ─────────────────────────────────────────────

class EZRouter:
    """
    EZ_load 핵심 라우터.
    사용자 컨텍스트를 받아 "가장 쉬운 길"과 "가장 빠른 길"을 함께 반환.

    Usage:
        router = EZRouter(graph, user_context)
        result = router.find_routes("start_node", "end_node")
        print(result.easy_route.path)
        print(result.fast_route.path)
    """

    def __init__(self, graph: Graph, context: UserContext):
        self.graph = graph
        self.context = context
        self.weights = build_personalized_weights(context)

    def find_routes(self, source: NodeId, target: NodeId) -> DualRouteResult:
        """
        출발지 -> 목적지 경로를 두 가지 기준으로 탐색.

        Args:
            source: 출발 노드 ID
            target: 목적 노드 ID

        Returns:
            DualRouteResult (easy_route, fast_route)
        """
        easy = _dijkstra_difficulty(
            self.graph, source, target, self.weights, self.context
        )
        fast = _dijkstra_distance(self.graph, source, target)
        return DualRouteResult(easy_route=easy, fast_route=fast)

    def update_context(self, new_context: UserContext) -> None:
        """
        사용자 컨텍스트 변경 시 가중치 재계산.
        (운전 기록 분석 후 선호도 업데이트에도 사용)
        """
        self.context = new_context
        self.weights = build_personalized_weights(new_context)
