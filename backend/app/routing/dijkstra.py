"""임시 경로 탐색 구현 — 엣지 기반 가중치 다익스트라.

회전 비용(방향 전환·유턴·급회전)은 구간 사이 전환에서 생기므로 상태를 노드가 아닌
엣지로 둔다. 대안 경로는 이미 찾은 경로의 엣지 비용을 올려 재탐색하는 페널티 방식.

알고리즘 파트 구현체가 준비되면 app.main 에서 교체한다.
"""

import hashlib
import heapq
import itertools
from collections import Counter
from collections.abc import Mapping, Sequence

from app.domain.factors import FACTORS, FactorCode, FactorKind
from app.domain.models import Hotspot, Point, Profile, Route
from app.routing.cost import CostModel, heading_factors, transition_factors
from app.routing.errors import NoRouteFound, OutOfServiceArea, SameLocation
from app.routing.geo import midpoint
from app.routing.graph import Edge, RoadGraph
from app.routing.steps import build_steps

ALTERNATIVE_PENALTY = 1.4
MAX_ATTEMPTS_PER_ROUTE = 3
# 이탈한 기존 경로에 주는 비용 배수. 금지가 아니라 가중치라서
# 그 길이 유일한 연결이면 여전히 반환된다.
AVOID_PENALTY = 5.0
# 폴리라인 인코딩 정밀도(소수 5자리 ≈ 1m)에 맞춰 좌표를 비교한다
COORD_PRECISION = 5


class DijkstraRouteFinder:
    def __init__(self, graph: RoadGraph, max_snap_distance_m: float = 1000.0):
        self.graph = graph
        self.max_snap_distance_m = max_snap_distance_m

    def find_route(
        self,
        origin: Point,
        destination: Point,
        profile: Profile,
        *,
        max_routes: int = 1,
        start_heading_deg: float | None = None,
        avoid_path: Sequence[Point] | None = None,
    ) -> list[Route]:
        start = self._snap(origin, "출발지")
        end = self._snap(destination, "도착지")
        if start == end:
            raise SameLocation("출발지와 도착지가 같은 지점입니다.")

        cost_model = CostModel(profile)
        penalties: dict[str, float] = dict.fromkeys(self._edges_on(avoid_path), AVOID_PENALTY)
        seen: set[tuple[str, ...]] = set()
        routes: list[Route] = []

        for _ in range(max_routes * MAX_ATTEMPTS_PER_ROUTE):
            path = self._search(start, end, cost_model, penalties, start_heading_deg)
            if path is None:
                break
            key = tuple(e.id for e in path)
            if key not in seen:
                seen.add(key)
                routes.append(self._build_route(path, cost_model, start_heading_deg))
                if len(routes) >= max_routes:
                    break
            for edge in path:
                penalties[edge.id] = penalties.get(edge.id, 1.0) * ALTERNATIVE_PENALTY

        if not routes:
            raise NoRouteFound("연결된 경로를 찾을 수 없습니다.")
        return sorted(routes, key=lambda r: r.cost)

    def _edges_on(self, avoid_path: Sequence[Point] | None) -> set[str]:
        """좌표열이 지나는 엣지를 찾는다.

        좌표 하나씩 보면 경로를 가로지르는 엣지까지 걸리므로 **연속한 두 점(구간)**
        단위로 맞춘다. 역방향 구간도 같이 넣어 반대 차선 엣지도 함께 피하게 한다.
        """
        if avoid_path is None or len(avoid_path) < 2:
            return set()

        segments: set[tuple[tuple[float, float], tuple[float, float]]] = set()
        for a, b in zip(avoid_path, avoid_path[1:]):
            key_a, key_b = _coord_key(a), _coord_key(b)
            segments.add((key_a, key_b))
            segments.add((key_b, key_a))

        found = set()
        for edge in self.graph.edges.values():
            geometry = edge.geometry
            if len(geometry) < 2:
                continue
            if all(
                (_coord_key(geometry[i]), _coord_key(geometry[i + 1])) in segments
                for i in range(len(geometry) - 1)
            ):
                found.add(edge.id)
        return found

    def _snap(self, point: Point, label: str) -> str:
        node, distance = self.graph.nearest_node(point)
        if distance > self.max_snap_distance_m:
            raise OutOfServiceArea(f"{label}가 서비스 도로망에서 너무 멉니다 ({distance:.0f}m).")
        return node.id

    def _search(
        self,
        start: str,
        end: str,
        cost_model: CostModel,
        penalties: Mapping[str, float],
        heading: float | None,
    ) -> list[Edge] | None:
        graph = self.graph
        tie = itertools.count()
        dist: dict[str, float] = {}
        prev: dict[str, str | None] = {}
        heap: list[tuple[float, int, str]] = []

        def edge_cost(edge: Edge) -> float:
            return cost_model.edge_cost(edge) * penalties.get(edge.id, 1.0)

        for edge in graph.out_edges.get(start, []):
            cost = edge_cost(edge)
            if heading is not None:
                cost += cost_model.turn_cost(heading_factors(heading, edge))
            if cost < dist.get(edge.id, float("inf")):
                dist[edge.id] = cost
                prev[edge.id] = None
                heapq.heappush(heap, (cost, next(tie), edge.id))

        done: set[str] = set()
        while heap:
            cost, _, edge_id = heapq.heappop(heap)
            if edge_id in done:
                continue
            done.add(edge_id)
            edge = graph.edges[edge_id]
            if edge.target == end:
                return self._unwind(edge_id, prev)
            for nxt in graph.out_edges.get(edge.target, []):
                if nxt.id in done:
                    continue
                new_cost = cost + cost_model.turn_cost(transition_factors(edge, nxt)) + edge_cost(nxt)
                if new_cost < dist.get(nxt.id, float("inf")):
                    dist[nxt.id] = new_cost
                    prev[nxt.id] = edge_id
                    heapq.heappush(heap, (new_cost, next(tie), nxt.id))
        return None

    def _unwind(self, last: str, prev: Mapping[str, str | None]) -> list[Edge]:
        ids: list[str] = []
        cur: str | None = last
        while cur is not None:
            ids.append(cur)
            cur = prev[cur]
        return [self.graph.edges[i] for i in reversed(ids)]

    def _build_route(self, path: list[Edge], cost_model: CostModel, heading: float | None) -> Route:
        counts: Counter[FactorCode] = Counter()
        hotspots: list[Hotspot] = []
        points: list[Point] = [path[0].geometry[0]]
        cost = 0.0

        def add_turn(turn: dict[FactorCode, int], at: Point) -> None:
            nonlocal cost
            counts.update(turn)
            cost += cost_model.turn_cost(turn)
            hotspots.extend(_hotspot(code, at) for code in turn if FACTORS[code].hotspot)

        if heading is not None:
            add_turn(heading_factors(heading, path[0]), path[0].geometry[0])

        for i, edge in enumerate(path):
            if i > 0:
                add_turn(transition_factors(path[i - 1], edge), edge.geometry[0])
            counts.update(edge.factor_counts)
            cost += cost_model.edge_cost(edge)
            points.extend(edge.geometry[1:])
            # 같은 요소가 연속된 구간은 첫 엣지에만 지점 표시
            for code in edge.factor_counts:
                meta = FACTORS[code]
                if meta.kind is FactorKind.EDGE and meta.hotspot and not (i > 0 and path[i - 1].has(code)):
                    hotspots.append(_hotspot(code, midpoint(edge.geometry)))

        edge_ids = "|".join(e.id for e in path)
        return Route(
            route_id="r_" + hashlib.sha1(edge_ids.encode()).hexdigest()[:8],
            path=tuple(points),
            distance_m=sum(e.length_m for e in path),
            duration_s=sum(e.travel_time_s for e in path),
            cost=cost,
            difficulty_score=round(cost_model.points(counts), 1),
            factor_counts=dict(counts),
            hotspots=tuple(hotspots),
            steps=build_steps(path, heading),
        )


def _coord_key(point: Point) -> tuple[float, float]:
    return round(point.lat, COORD_PRECISION), round(point.lng, COORD_PRECISION)


def _hotspot(code: FactorCode, at: Point) -> Hotspot:
    return Hotspot(code=code, point=at, note=FACTORS[code].hotspot_note)
