"""좌표 → 도로 위 지점.

가장 가까운 교차로(노드)가 아니라 가장 가까운 **도로 위 지점**에 붙인다. 노드에 붙이면 실제 위치에서
수십 m 떨어진 교차로에서 경로가 시작해 첫 안내와 시간이 틀어진다.

도로 중간에 붙으면 그 구간을 잘라 만든 조각 엣지로 경로를 시작하고 끝낸다.
- 출발 조각: 지점 → 구간 끝 노드. 도착 조각: 구간 시작 노드 → 지점
- 양방향 도로는 두 방향 조각을 모두 둔다. 어느 쪽을 보고 서 있는지 모르기 때문이다
  (재탐색은 진행 방향이 있어 반대쪽 조각은 유턴으로 계산된다)
- 조각 id 는 "원래 id@위도,경도" 다. 회전 금지·이탈 회피는 base_edge_id() 로 원래 구간 기준으로 본다

조각의 요소: km 요소는 길이 비율로 나눈다. 횟수 요소(신호 등)는 위치를 몰라서, 끝 노드를 지나는
출발 조각에만 남긴다 (OSM 변환기는 신호를 구간 안과 끝 노드 기준으로 센다).
"""

import dataclasses
from dataclasses import dataclass

from app.domain.factors import FACTORS, FactorCode, FactorKind, MeasureUnit
from app.domain.models import Point
from app.routing.geo import haversine_m
from app.routing.graph import Edge, EdgeHit, RoadGraph

# 교차로에서 이 거리 안이면 교차로에 붙인다
NODE_SNAP_M = 5.0
# 최근접 지점에서 이 거리 안의 다른 엣지는 같은 도로(반대 방향 등)로 본다
SAME_ROAD_M = 1.0
# 조각 형상에서 이보다 가까운 점은 겹친 점으로 보고 뺀다 (방향 계산이 틀어지지 않게)
MIN_SEGMENT_M = 0.5
PIECE_SEPARATOR = "@"


@dataclass(frozen=True)
class Anchor:
    """출발지나 도착지가 붙은 곳. 교차로이면 node, 도로 중간이면 그 위치의 엣지들."""

    point: Point
    node: str | None = None
    hits: tuple[EdgeHit, ...] = ()


def base_edge_id(edge_id: str) -> str:
    return edge_id.split(PIECE_SEPARATOR, 1)[0]


def snap(graph: RoadGraph, point: Point, max_distance_m: float) -> Anchor | None:
    hits = graph.nearest_edges_within(point, max_distance_m)
    if not hits:
        return None
    best = hits[0]
    for node_id in (best.edge.source, best.edge.target):
        node = graph.nodes[node_id]
        if haversine_m(best.point, node.point) <= NODE_SNAP_M:
            return Anchor(node.point, node=node_id)
    same_road = tuple(
        h for h in hits if h.distance_m <= best.distance_m + SAME_ROAD_M and haversine_m(h.point, best.point) <= SAME_ROAD_M
    )
    return Anchor(best.point, hits=same_road)


def departure_pieces(anchor: Anchor) -> list[Edge]:
    """지점 → 구간 끝."""
    return [_build(h.edge, [h.point, *h.edge.geometry[h.index + 1 :]], keep_counts=True) for h in anchor.hits]


def arrival_pieces(anchor: Anchor) -> list[Edge]:
    """구간 시작 → 지점."""
    return [_build(h.edge, [*h.edge.geometry[: h.index + 1], h.point], keep_counts=False) for h in anchor.hits]


def direct_pieces(origin: Anchor, destination: Anchor) -> list[Edge]:
    """출발지와 도착지가 같은 구간 위에 있고 도착지가 앞쪽이면, 그 사이만 지나는 조각."""
    pieces = []
    for o in origin.hits:
        for d in destination.hits:
            if o.edge.id != d.edge.id or (d.index, d.fraction) <= (o.index, o.fraction):
                continue
            inner = list(o.edge.geometry[o.index + 1 : d.index + 1])
            pieces.append(_build(o.edge, [o.point, *inner, d.point], keep_counts=False))
    return pieces


def _build(edge: Edge, geometry: list[Point], *, keep_counts: bool) -> Edge:
    points = [geometry[0]]
    for p in geometry[1:]:
        if haversine_m(points[-1], p) >= MIN_SEGMENT_M:
            points.append(p)
    if len(points) < 2:
        points = [geometry[0], geometry[-1]]
    full = _geometric_length(edge.geometry)
    ratio = _geometric_length(points) / full if full > 0 else 0.0
    first, last = points[0], points[-1]
    return dataclasses.replace(
        edge,
        id=f"{edge.id}{PIECE_SEPARATOR}{first.lat:.6f},{first.lng:.6f}~{last.lat:.6f},{last.lng:.6f}",
        geometry=tuple(points),
        length_m=edge.length_m * ratio,
        factor_amounts=_split_amounts(edge.factor_amounts, ratio, keep_counts),
    )


def _split_amounts(amounts: dict[FactorCode, float], ratio: float, keep_counts: bool) -> dict[FactorCode, float]:
    split: dict[FactorCode, float] = {}
    for code, n in amounts.items():
        meta = FACTORS[code]
        if meta.unit is MeasureUnit.KM:
            split[code] = n * ratio
        elif meta.kind is FactorKind.ZONE or keep_counts:
            split[code] = n  # 지역은 조각도 그 지역 안이다
    return {code: n for code, n in split.items() if n > 0}


def _geometric_length(points) -> float:
    return sum(haversine_m(points[i], points[i + 1]) for i in range(len(points) - 1))
