"""임시 경로 탐색 구현 — 엣지 기반 가중치 다익스트라.

회전 비용(방향 전환·유턴·비보호 좌회전)은 구간 사이 전환에서 생기므로 상태를 노드가 아닌
엣지로 둔다.

후보는 FE 데모(mobile/src/mock/mockRouteProvider.ts)처럼 관점을 바꿔 가며 찾는다.
사용자 선호 → 가장 빠른 길 → 고속도로 위주 순서이고, 그래도 모자라면 이미 찾은 경로의
엣지 비용을 올려 재탐색한다. FE 는 가장 빠른 후보를 기준으로 추가 시간을 보여 주므로
후보가 2개 이상이면 가장 빠른 길이 반드시 들어가야 한다. 비용·점수는 어떤 관점으로 찾았든
항상 사용자 선호 기준으로 매긴다.

알고리즘 파트 구현체가 준비되면 app.main 에서 교체한다.
"""

import dataclasses
import hashlib
import heapq
import itertools
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.domain.factors import FACTORS, FactorCode, FactorKind
from app.domain.models import Hotspot, Point, Profile, RoadPreference, Route
from app.routing.cost import (
    CostModel,
    edge_amounts,
    heading_factors,
    transition,
    transition_factors,
    turn_delay_s,
)
from app.routing.errors import NoRouteFound, OutOfServiceArea, SameLocation
from app.routing.geo import haversine_m, midpoint
from app.routing.graph import Edge, RoadGraph
from app.routing.measure import measure_route
from app.routing.snap import Anchor, arrival_pieces, base_edge_id, departure_pieces, direct_pieces, snap
from app.routing.steps import build_steps

ALTERNATIVE_PENALTY = 1.4
MAX_ATTEMPTS_PER_ROUTE = 3
# 이탈한 기존 경로에 주는 비용 배수. 금지가 아니라 가중치라서
# 그 길이 유일한 연결이면 여전히 반환된다.
AVOID_PENALTY = 5.0
# 폴리라인 인코딩 정밀도(소수 5자리 ≈ 1m)에 맞춰 좌표를 비교한다
COORD_PRECISION = 5
# 짧은 쪽 경로 길이의 이 비율 이상을 함께 지나면 같은 길로 본다 (FE 데모와 같은 기준)
DUPLICATE_SIMILARITY = 0.8
# 도로 위에 붙인 출발지와 도착지가 이보다 가까우면 같은 곳으로 본다
SAME_LOCATION_M = 10.0
FASTEST = Profile.fastest()


def search_personas(profile: Profile) -> list[Profile]:
    """후보를 찾는 관점. 앞에서부터 쓰므로 max_routes=1 이면 사용자 선호 경로만 나온다."""
    return [
        profile,
        FASTEST,
        dataclasses.replace(profile, road_preference=RoadPreference.HIGHWAY),
    ]


def path_similarity(a: Sequence[Edge], b: Sequence[Edge]) -> float:
    """두 경로가 함께 지나는 길이 / 짧은 쪽 경로 길이."""
    shorter = min(sum(e.length_m for e in a), sum(e.length_m for e in b))
    if shorter <= 0:
        return 1.0
    ids_b = {e.id for e in b}
    return sum(e.length_m for e in a if e.id in ids_b) / shorter


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
        if haversine_m(start.point, end.point) < SAME_LOCATION_M:
            raise SameLocation("출발지와 도착지가 같은 지점입니다.")
        terminals = self._terminals(start, end)

        # 순위·점수는 어떤 관점으로 찾았든 사용자 선호 기준
        cost_model = CostModel(profile)
        avoid: dict[str, float] = dict.fromkeys(self._edges_on(avoid_path), AVOID_PENALTY)
        paths: list[list[Edge]] = []

        def add(path: list[Edge]) -> None:
            if all(path_similarity(path, other) < DUPLICATE_SIMILARITY for other in paths):
                paths.append(path)

        for persona in search_personas(profile)[:max_routes]:
            path = self._search(terminals, CostModel(persona), avoid, start_heading_deg)
            if path is None:
                break  # 연결이 없으면 어떤 관점으로도 없다
            if persona is FASTEST:
                # FE 는 가장 빠른 후보를 "가장 빠름"·허용 추가 시간의 기준으로 쓰므로, 사용자 선호 경로와
                # 많이 겹쳐도 넣는다. 겹친다고 빼면 선호 경로가 최단 시간 자리를 대신해 기준이 틀어진다.
                if all([e.id for e in path] != [e.id for e in other] for other in paths):
                    paths.append(path)
            else:
                add(path)

        # 관점을 바꿔도 같은 길뿐이면, 찾은 길의 비용을 올려 사용자 선호로 대안을 더 찾는다
        penalties = dict(avoid)

        def penalize(path: list[Edge]) -> None:
            for edge in path:
                base = base_edge_id(edge.id)
                penalties[base] = penalties.get(base, 1.0) * ALTERNATIVE_PENALTY

        for path in paths:
            penalize(path)
        for _ in range(max_routes * MAX_ATTEMPTS_PER_ROUTE):
            if len(paths) >= max_routes or not paths:
                break
            path = self._search(terminals, cost_model, penalties, start_heading_deg)
            if path is None:
                break
            add(path)
            penalize(path)

        if not paths:
            raise NoRouteFound("연결된 경로를 찾을 수 없습니다.")
        routes = [self._build_route(path, cost_model, start_heading_deg) for path in paths]
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

    def _snap(self, point: Point, label: str) -> Anchor:
        anchor = snap(self.graph, point, self.max_snap_distance_m)
        if anchor is None:
            raise OutOfServiceArea(
                f"{label}가 서비스 도로망에서 너무 멉니다 ({self.max_snap_distance_m:.0f}m 안에 도로가 없음)."
            )
        return anchor

    def _terminals(self, start: Anchor, end: Anchor) -> "_Terminals":
        arrivals = arrival_pieces(end) if end.node is None else []
        direct = direct_pieces(start, end)
        by_source: dict[str, list[Edge]] = defaultdict(list)
        for piece in arrivals:
            by_source[piece.source].append(piece)
        if start.node is not None:
            starts = [*self.graph.out_edges.get(start.node, []), *by_source.get(start.node, [])]
        else:
            starts = [*departure_pieces(start), *direct]
        return _Terminals(
            starts=tuple(starts),
            end_node=end.node,
            arrivals={node: tuple(pieces) for node, pieces in by_source.items()},
            end_ids=frozenset(p.id for p in [*arrivals, *direct]),
        )

    def _search(
        self,
        terminals: "_Terminals",
        cost_model: CostModel,
        penalties: Mapping[str, float],
        heading: float | None,
    ) -> list[Edge] | None:
        graph = self.graph
        tie = itertools.count()
        dist: dict[str, float] = {}
        prev: dict[str, str | None] = {}
        seen: dict[str, Edge] = {}
        heap: list[tuple[float, int, str]] = []

        def edge_cost(edge: Edge) -> float:
            return cost_model.edge_cost(edge) * penalties.get(base_edge_id(edge.id), 1.0)

        for edge in terminals.starts:
            cost = edge_cost(edge) + cost_model.turn_cost(transition_factors(None, edge))
            if heading is not None:
                cost += cost_model.turn_cost(heading_factors(heading, edge))
            if cost < dist.get(edge.id, float("inf")):
                dist[edge.id] = cost
                prev[edge.id] = None
                seen[edge.id] = edge
                heapq.heappush(heap, (cost, next(tie), edge.id))

        done: set[str] = set()
        while heap:
            cost, _, edge_id = heapq.heappop(heap)
            if edge_id in done:
                continue
            done.add(edge_id)
            edge = seen[edge_id]
            if terminals.reached(edge):
                return self._unwind(edge_id, prev, seen)
            base = base_edge_id(edge_id)
            for nxt in (*graph.out_edges.get(edge.target, ()), *terminals.arrivals.get(edge.target, ())):
                if nxt.id in done or (base, base_edge_id(nxt.id)) in graph.banned_turns:
                    continue
                new_cost = cost + cost_model.transition_cost(transition(edge, nxt)) + edge_cost(nxt)
                if new_cost < dist.get(nxt.id, float("inf")):
                    dist[nxt.id] = new_cost
                    prev[nxt.id] = edge_id
                    seen[nxt.id] = nxt
                    heapq.heappush(heap, (new_cost, next(tie), nxt.id))
        return None

    @staticmethod
    def _unwind(last: str, prev: Mapping[str, str | None], seen: Mapping[str, Edge]) -> list[Edge]:
        ids: list[str] = []
        cur: str | None = last
        while cur is not None:
            ids.append(cur)
            cur = prev[cur]
        return [seen[i] for i in reversed(ids)]

    def _build_route(self, path: list[Edge], cost_model: CostModel, heading: float | None) -> Route:
        amounts: Counter[FactorCode] = Counter()
        hotspots: list[Hotspot] = []
        points: list[Point] = [path[0].geometry[0]]
        cost = 0.0
        duration = 0.0

        def add_transition(factors: dict[FactorCode, float], edge: Edge, *, left: bool = False) -> None:
            nonlocal cost, duration
            amounts.update(factors)
            cost += cost_model.turn_cost(factors, left=left)
            duration += turn_delay_s(factors, left=left)
            for code in factors:
                meta = FACTORS[code]
                if meta.hotspot:
                    # 지역 진입은 구간 가운데, 회전·합류는 전환 지점에 표시
                    at = midpoint(edge.geometry) if meta.kind is FactorKind.ZONE else edge.geometry[0]
                    hotspots.append(_hotspot(code, at))

        if heading is not None:
            add_transition(heading_factors(heading, path[0]), path[0])

        for i, edge in enumerate(path):
            t = transition(path[i - 1] if i > 0 else None, edge)
            add_transition(t.factors, edge, left=t.left_turn)
            own = edge_amounts(edge)
            amounts.update(own)
            cost += cost_model.edge_cost(edge)
            duration += edge.travel_time_s
            points.extend(edge.geometry[1:])
            # 같은 요소가 연속된 구간은 첫 엣지에만 지점 표시
            for code in own:
                meta = FACTORS[code]
                if meta.hotspot and not (i > 0 and path[i - 1].has(code)):
                    hotspots.append(_hotspot(code, midpoint(edge.geometry)))

        edge_ids = "|".join(e.id for e in path)
        return Route(
            route_id="r_" + hashlib.sha1(edge_ids.encode()).hexdigest()[:8],
            path=tuple(points),
            distance_m=sum(e.length_m for e in path),
            duration_s=duration,
            cost=cost,
            difficulty_score=round(cost_model.points(amounts), 1),
            factor_amounts=dict(amounts),
            hotspots=tuple(hotspots),
            steps=build_steps(path, heading),
            measurements=measure_route(path, heading, self.graph.source, self.graph.verification),
        )


@dataclass(frozen=True)
class _Terminals:
    """한 번의 탐색에서 쓰는 출발 엣지 후보와 도착 조건."""

    starts: tuple[Edge, ...]
    # 도착지가 교차로에 붙었으면 그 노드, 도로 중간이면 None (end_ids 의 조각에 닿으면 도착)
    end_node: str | None
    # 노드 → 그 노드에서 도착 지점으로 들어가는 조각
    arrivals: Mapping[str, tuple[Edge, ...]]
    end_ids: frozenset[str]

    def reached(self, edge: Edge) -> bool:
        return edge.id in self.end_ids or (self.end_node is not None and edge.target == self.end_node)


def _coord_key(point: Point) -> tuple[float, float]:
    return round(point.lat, COORD_PRECISION), round(point.lng, COORD_PRECISION)


def _hotspot(code: FactorCode, at: Point) -> Hotspot:
    return Hotspot(code=code, point=at, note=FACTORS[code].hotspot_note)
