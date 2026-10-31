"""도로망 그래프.

자료정리 파트가 아래 JSON 형식으로 내보내면 GRAPH_PATH 로 바로 불러올 수 있다.

{
  "source": {"kind": "public_data", "name": "국가표준노드링크"},   # 선택. kind 는 Measurement 출처
  "verification": "unverified",                                   # 선택. confirmed / estimated / unverified
  "nodes": [{"id": "n1", "lat": 35.15, "lng": 126.85}, ...],
  "edges": [{
    "id": "e1", "from": "n1", "to": "n2",
    "oneway": false,              # false 면 역방향 엣지 자동 생성 (id + "_r")
    "length_m": 420.0,            # 생략 시 좌표로 계산
    "speed_kph": 40,
    "road_class": "LOCAL",        # HIGHWAY / RAMP / ARTERIAL / COLLECTOR / LOCAL
    "name": "상무대로",
    "geometry": [[lat, lng], ...],  # 선택. 양 끝 노드 사이의 중간 형상점
    "traffic_lights": 1,
    "lanes": 2, "width_m": 6.5,   # 편도 차로 수 · 도로 폭. 좁은 도로 판정과 차로 수
    "narrow": false,              # 선택. 있으면 lanes·width_m 대신 이 값으로 좁은 도로를 판정
    "surface": "asphalt",         # OSM surface 태그
    "protected_zone": false,
    "roundabout": false,
    "accident_zone": false,
    "merge_diverge": 0,           # 구간 안에서 지나는 합류·분기 지점 수 (고속도로 진입·진출 자체는 제외)
    "lane_changes": 0,            # 이 구간에서 필요한 차로 변경 수 (합류·분기 제외)
    "sharp_curves": 0,            # 급커브 수 (교차로 회전이 아니라 도로 자체가 꺾이는 곳)
    "congested": false,           # 평소 차가 많은 구간
    "unprotected_left": false,    # 이 구간 끝 교차로에서 좌회전하면 비보호인지
    "unprotected_left_reverse": false  # 역방향 엣지의 끝(= from 노드) 기준. 생략 시 unprotected_left 와 같음
  }, ...],
  "turn_restrictions": [          # 선택. 금지된 회전 (좌회전·유턴 금지 등)
    {"from": "e1", "to": "e2_r"}  # 방향 엣지 id. from 의 끝 노드에서 to 로 넘어갈 수 없다
  ]
}

**키를 생략한 것과 0/false 는 다르다.** 생략하면 그 구간은 "정보 없음" 으로 응답한다.
고속도로 진입·진출은 road_class 변화(HIGHWAY ↔ 그 외)로 BE 가 직접 세므로 merge_diverge 에 넣지 않는다.
예전 이름 lane_change(합류·분기 지점 수)도 merge_diverge 로 읽는다.
"""

import itertools
import json
import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Any

from app.domain.factors import FactorCode
from app.domain.models import DataSource, DataSourceKind, Point, RoadClass, ServiceArea, Verification
from app.routing.geo import bearing_deg, haversine_m

__all__ = ["Edge", "Node", "RoadClass", "RoadGraph"]

NARROW_MAX_LANES = 1
NARROW_MAX_WIDTH_M = 5.0
PAVED_SURFACES = {"asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett"}

# 소요 시간. 실시간 교통 자료가 없어 일반적인 값을 쓴다 (평소 한산할 때 기준)
# 가감속 때문에 실제 주행속도는 제한속도보다 낮다 (OSRM 자동차 프로필과 같은 비율)
RUNNING_SPEED_RATIO = 0.8
# 신호등 하나의 평균 대기 시간. 주기 150초 중 적색 약 70초에 무작위로 도착한다고 보면 약 16초,
# 출발 지연을 더해 20초
SIGNAL_DELAY_S = 20.0

METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LNG_EQUATOR = 111_320.0

DEFAULT_SOURCE = DataSource(DataSourceKind.PUBLIC_DATA, "도로망 데이터")

# 구간 요소 → 그 요소의 자료가 있다고 볼 JSON 키
_KNOWN_KEYS: dict[FactorCode, tuple[str, ...]] = {
    FactorCode.TRAFFIC_LIGHT: ("traffic_lights",),
    FactorCode.PROTECTED_ZONE: ("protected_zone",),
    FactorCode.NARROW_ROAD: ("narrow", "lanes", "width_m"),
    FactorCode.UNPAVED_ROAD: ("surface",),
    FactorCode.ROUNDABOUT: ("roundabout",),
    FactorCode.LANE_CHANGE: ("lane_changes",),
    FactorCode.MERGE_DIVERGE: ("merge_diverge", "lane_change"),
    FactorCode.ACCIDENT_ZONE: ("accident_zone",),
    FactorCode.SHARP_TURN: ("sharp_curves",),
    FactorCode.TRAFFIC_VOLUME: ("congested",),
    FactorCode.LANE_COUNT: ("lanes",),
    FactorCode.ROAD_TYPE: ("road_class",),
}

# 고속도로 계열이 아니면 구간 안의 합류·분기 지점이 없다고 본다
_MERGE_ROAD_CLASSES = {RoadClass.HIGHWAY, RoadClass.RAMP}


@dataclass(frozen=True)
class Node:
    id: str
    point: Point


@dataclass(frozen=True)
class Edge:
    id: str
    source: str
    target: str
    geometry: tuple[Point, ...]  # source ~ target 전체 형상 (양 끝 포함)
    length_m: float
    speed_kph: float
    road_class: RoadClass
    name: str | None
    # 구간 요소의 발생량. 횟수 요소는 횟수, km 요소는 해당 길이(km), 지역(ZONE) 요소는 1
    factor_amounts: dict[FactorCode, float]
    # 자료가 있는 요소. 여기 없는 요소는 이 구간에서 "정보 없음"
    known: frozenset[FactorCode] = frozenset()
    lanes: int | None = None
    # 이 구간 끝 교차로에서 좌회전하면 비보호인지. None 이면 정보 없음
    unprotected_left: bool | None = None

    # 아래 값은 탐색 중 전환마다 쓰이므로 구간마다 한 번만 계산해 둔다 (형상·속도는 바뀌지 않는다)
    @cached_property
    def travel_time_s(self) -> float:
        """이 구간을 지나는 시간. 확인된 신호의 대기 시간을 포함하고 회전 시간은 cost.transition 이 더한다."""
        running = self.length_m / (self.speed_kph * RUNNING_SPEED_RATIO / 3.6)
        return running + self.factor_amounts.get(FactorCode.TRAFFIC_LIGHT, 0) * SIGNAL_DELAY_S

    @cached_property
    def start_bearing(self) -> float:
        return bearing_deg(self.geometry[0], self.geometry[1])

    @cached_property
    def end_bearing(self) -> float:
        return bearing_deg(self.geometry[-2], self.geometry[-1])

    def has(self, code: FactorCode) -> bool:
        return self.factor_amounts.get(code, 0) > 0


class _NodeGrid:
    """균일 격자 기반 최근접 노드 인덱스.

    노드가 수십만 규모가 되면 요청당 선형 스캔 4회가 수초로 불어난다.
    KD-tree(scipy) 대신 격자를 쓴 이유는 외부 의존성 없이 충분히 빠르고
    도로망처럼 고르게 퍼진 점 데이터에 잘 맞기 때문이다.

    중심 셀에서 바깥으로 링을 넓혀 가며 보고, **아직 보지 않은 셀이 현재 최선보다
    가까울 수 없게 되는 순간** 멈춘다. 그래서 전체 스캔과 같은 답을 준다.

    링 수는 질의점과 도로망 사이 칸 수에 비례하고 한 링을 보는 비용도 그만큼 커서,
    도로망에서 아주 먼 좌표는 수십 초가 걸린다. 그래서 요청 좌표는 max_distance_m 을 주어
    도로망 범위로 먼저 거르고 링도 그 거리까지만 넓힌다.
    """

    MIN_CELL_DEG = 0.0005  # 약 55m
    MAX_CELL_DEG = 0.05  # 약 5.5km

    def __init__(self, nodes: Iterable[Node]):
        node_list = list(nodes)
        self._cell = _pick_cell_size(node_list)
        self._buckets: dict[tuple[int, int], list[Node]] = defaultdict(list)
        for node in node_list:
            self._buckets[self._key(node.point)].append(node)
        xs = [key[0] for key in self._buckets]
        ys = [key[1] for key in self._buckets]
        self._x_range = (min(xs), max(xs)) if xs else (0, 0)
        self._y_range = (min(ys), max(ys)) if ys else (0, 0)
        lats = [node.point.lat for node in node_list]
        lngs = [node.point.lng for node in node_list]
        self._bounds = (min(lats), min(lngs), max(lats), max(lngs)) if node_list else None

    def _key(self, point: Point) -> tuple[int, int]:
        return math.floor(point.lat / self._cell), math.floor(point.lng / self._cell)

    def nearest(self, point: Point, max_distance_m: float | None = None) -> tuple[Node, float] | None:
        """가장 가까운 노드와 거리. max_distance_m 안에 노드가 없으면 None."""
        if self._bounds is None:
            return None
        if max_distance_m is not None and self.distance_to_bounds_m(point) > 2 * max_distance_m:
            # 위경도 사각형까지의 거리는 구면에서 정확한 하한이 아니라서 2배 여유를 둔다
            return None

        # 셀 한 변의 실제 길이 중 짧은 쪽(경도)을 쓰면 중단 조건이 보수적이라 안전하다
        lng_m = METERS_PER_DEG_LNG_EQUATOR * max(math.cos(math.radians(point.lat)), 1e-6)
        step_m = self._cell * min(METERS_PER_DEG_LAT, lng_m)

        cx, cy = self._key(point)
        max_radius = 1 + max(
            abs(cx - self._x_range[0]),
            abs(cx - self._x_range[1]),
            abs(cy - self._y_range[0]),
            abs(cy - self._y_range[1]),
        )
        if max_distance_m is not None:
            max_radius = min(max_radius, 1 + math.ceil(max_distance_m / step_m))

        best: Node | None = None
        best_m = math.inf
        for radius in itertools.count():
            # 링 radius 밖의 셀은 최소 (radius-1)*step_m 떨어져 있다
            if best is not None and best_m <= (radius - 1) * step_m:
                break
            if radius > max_radius:
                break
            for cell in _ring(cx, cy, radius):
                for node in self._buckets.get(cell, ()):
                    distance = haversine_m(point, node.point)
                    if distance < best_m:
                        best, best_m = node, distance

        if best is None or (max_distance_m is not None and best_m > max_distance_m):
            return None
        return best, best_m

    def distance_to_bounds_m(self, point: Point) -> float:
        """노드가 있는 위경도 사각형까지의 거리. 노드가 없으면 무한대."""
        if self._bounds is None:
            return math.inf
        min_lat, min_lng, max_lat, max_lng = self._bounds
        clamped = Point(min(max(point.lat, min_lat), max_lat), min(max(point.lng, min_lng), max_lng))
        return haversine_m(point, clamped)


@dataclass(frozen=True)
class EdgeHit:
    """좌표에서 가장 가까운 도로 위 지점."""

    edge: Edge
    index: int  # edge.geometry[index] ~ [index + 1] 선분 위
    fraction: float  # 선분 안의 위치 (0~1)
    point: Point
    distance_m: float


class _EdgeGrid:
    """도로 선분 격자 인덱스. 선분은 자기가 지나는 칸마다 등록한다.

    찾는 반경을 작게 시작해 넓혀 가고, 찾은 최근접 거리가 반경 안이면 멈춘다.
    그보다 가까운 선분은 반드시 그 반경의 칸들에 등록돼 있으므로 전체 스캔과 같은 답이다.
    """

    CELL_DEG = 0.002  # 약 200m
    FIRST_RADIUS_M = 50.0

    def __init__(self, edges: Iterable[Edge]):
        self._buckets: dict[tuple[int, int], list[tuple[Edge, int]]] = defaultdict(list)
        for edge in edges:
            for i in range(len(edge.geometry) - 1):
                a, b = edge.geometry[i], edge.geometry[i + 1]
                for x in range(self._index(min(a.lat, b.lat)), self._index(max(a.lat, b.lat)) + 1):
                    for y in range(self._index(min(a.lng, b.lng)), self._index(max(a.lng, b.lng)) + 1):
                        self._buckets[(x, y)].append((edge, i))

    def _index(self, deg: float) -> int:
        return math.floor(deg / self.CELL_DEG)

    def nearest(self, point: Point, max_distance_m: float) -> list[EdgeHit]:
        """엣지마다 가장 가까운 지점을, 가까운 순서로. max_distance_m 안의 것만."""
        radius = min(self.FIRST_RADIUS_M, max_distance_m)
        while True:
            hits = self._within(point, radius)
            if hits or radius >= max_distance_m:
                return [h for h in hits if h.distance_m <= max_distance_m]
            radius = min(radius * 4, max_distance_m)

    def _within(self, point: Point, radius_m: float) -> list[EdgeHit]:
        kx = METERS_PER_DEG_LNG_EQUATOR * max(math.cos(math.radians(point.lat)), 1e-6)
        dlat, dlng = radius_m / METERS_PER_DEG_LAT, radius_m / kx
        best: dict[str, EdgeHit] = {}
        for x in range(self._index(point.lat - dlat), self._index(point.lat + dlat) + 1):
            for y in range(self._index(point.lng - dlng), self._index(point.lng + dlng) + 1):
                for edge, i in self._buckets.get((x, y), ()):
                    hit = _project(point, edge, i, kx)
                    if hit.distance_m <= radius_m and (
                        edge.id not in best or hit.distance_m < best[edge.id].distance_m
                    ):
                        best[edge.id] = hit
        return sorted(best.values(), key=lambda h: h.distance_m)


def _project(point: Point, edge: Edge, index: int, kx: float) -> EdgeHit:
    """선분 위 수선의 발. 짧은 거리라 질의점 기준 평면으로 근사한다."""
    a, b = edge.geometry[index], edge.geometry[index + 1]
    ax, ay = (a.lng - point.lng) * kx, (a.lat - point.lat) * METERS_PER_DEG_LAT
    bx, by = (b.lng - point.lng) * kx, (b.lat - point.lat) * METERS_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else min(max(-(ax * dx + ay * dy) / length2, 0.0), 1.0)
    foot = Point(a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng))
    return EdgeHit(edge, index, t, foot, math.hypot(ax + t * dx, ay + t * dy))


def _pick_cell_size(nodes: list[Node]) -> float:
    """셀당 노드 1개 정도가 되도록 격자 크기를 고른다."""
    if len(nodes) < 2:
        return _NodeGrid.MAX_CELL_DEG
    lats = [n.point.lat for n in nodes]
    lngs = [n.point.lng for n in nodes]
    area = max(max(lats) - min(lats), 1e-9) * max(max(lngs) - min(lngs), 1e-9)
    cell = math.sqrt(area / len(nodes))
    return min(max(cell, _NodeGrid.MIN_CELL_DEG), _NodeGrid.MAX_CELL_DEG)


def _ring(cx: int, cy: int, radius: int) -> Iterable[tuple[int, int]]:
    """중심에서 체비셰프 거리가 정확히 radius 인 셀들 (둘레만 O(radius))."""
    if radius == 0:
        yield cx, cy
        return
    for dx in range(-radius, radius + 1):
        yield cx + dx, cy - radius
        yield cx + dx, cy + radius
    for dy in range(-radius + 1, radius):
        yield cx - radius, cy + dy
        yield cx + radius, cy + dy


class RoadGraph:
    def __init__(
        self,
        nodes: list[Node],
        edges: list[Edge],
        source: DataSource = DEFAULT_SOURCE,
        verification: Verification = Verification.UNVERIFIED,
        banned_turns: Iterable[tuple[str, str]] = (),
    ):
        self.source = source
        self.verification = verification
        self.nodes: dict[str, Node] = {n.id: n for n in nodes}
        self.edges: dict[str, Edge] = {}
        self.out_edges: dict[str, list[Edge]] = defaultdict(list)
        for edge in edges:
            if edge.source not in self.nodes or edge.target not in self.nodes:
                raise ValueError(f"edge {edge.id} references unknown node")
            if edge.id in self.edges:
                raise ValueError(f"duplicate edge id {edge.id}")
            self.edges[edge.id] = edge
            self.out_edges[edge.source].append(edge)
        # (들어온 엣지 id, 나갈 엣지 id). 탐색이 이 전환을 건너뛴다
        self.banned_turns: frozenset[tuple[str, str]] = frozenset(banned_turns)
        for from_id, to_id in self.banned_turns:
            if from_id not in self.edges or to_id not in self.edges:
                raise ValueError(f"turn restriction {from_id} -> {to_id} references unknown edge")
            if self.edges[from_id].target != self.edges[to_id].source:
                raise ValueError(f"turn restriction {from_id} -> {to_id} is not a turn at one node")
        self._node_grid = _NodeGrid(self.nodes.values())
        self._edge_grid = _EdgeGrid(self.edges.values())

    def service_area(self) -> ServiceArea:
        if not self.nodes:
            raise ValueError("그래프에 노드가 없습니다.")
        lats = [n.point.lat for n in self.nodes.values()]
        lngs = [n.point.lng for n in self.nodes.values()]
        middle = Point((min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2)
        # 영역 한가운데는 도로가 아닐 수 있으므로 가장 가까운 노드를 준다
        center, _ = self.nearest_node(middle)
        return ServiceArea(min(lats), min(lngs), max(lats), max(lngs), center.point, self.source)

    def nearest_node(self, point: Point) -> tuple[Node, float]:
        found = self._node_grid.nearest(point)
        if found is None:
            raise ValueError("그래프에 노드가 없습니다.")
        return found

    def nearest_edges_within(self, point: Point, max_distance_m: float) -> list[EdgeHit]:
        """요청 좌표 스냅용. 엣지마다 가장 가까운 도로 위 지점을 가까운 순서로 준다.

        도로망 범위에서 먼 좌표는 격자를 보지 않고 바로 빈 목록을 준다.
        """
        if self._node_grid.distance_to_bounds_m(point) > 2 * max_distance_m:
            return []
        return self._edge_grid.nearest(point, max_distance_m)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RoadGraph":
        nodes = [Node(str(n["id"]), Point(float(n["lat"]), float(n["lng"]))) for n in data["nodes"]]
        by_id = {n.id: n for n in nodes}
        edges: list[Edge] = []
        for raw in data["edges"]:
            source, target = str(raw["from"]), str(raw["to"])
            inner = tuple(Point(float(lat), float(lng)) for lat, lng in raw.get("geometry", []))
            geometry = (by_id[source].point, *inner, by_id[target].point)
            edges.append(_build_edge(str(raw["id"]), source, target, geometry, raw, raw.get("unprotected_left")))
            if not raw.get("oneway", False):
                reverse_left = raw.get("unprotected_left_reverse", raw.get("unprotected_left"))
                edges.append(_build_edge(f"{raw['id']}_r", target, source, geometry[::-1], raw, reverse_left))
        raw_source = data.get("source")
        source = (
            DataSource(DataSourceKind(raw_source["kind"]), str(raw_source["name"]))
            if raw_source
            else DEFAULT_SOURCE
        )
        verification = Verification(data.get("verification", Verification.UNVERIFIED))
        banned = [(str(r["from"]), str(r["to"])) for r in data.get("turn_restrictions", [])]
        return cls(nodes, edges, source, verification, banned)

    @classmethod
    def from_json_file(cls, path: str | Path) -> "RoadGraph":
        with open(path, encoding="utf-8") as f:
            return cls.from_dict(json.load(f))


def _build_edge(
    edge_id: str,
    source: str,
    target: str,
    geometry: tuple[Point, ...],
    raw: dict[str, Any],
    unprotected_left: bool | None,
) -> Edge:
    length = raw.get("length_m")
    if length is None:
        length = sum(haversine_m(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1))
    road_class = RoadClass(raw.get("road_class", RoadClass.LOCAL))
    lanes = raw.get("lanes")
    return Edge(
        id=edge_id,
        source=source,
        target=target,
        geometry=geometry,
        length_m=float(length),
        speed_kph=float(raw.get("speed_kph", 30)),
        road_class=road_class,
        name=raw.get("name"),
        factor_amounts=_edge_factor_amounts(raw, float(length) / 1000, road_class),
        known=_edge_known(raw, road_class),
        lanes=int(lanes) if lanes is not None else None,
        unprotected_left=None if unprotected_left is None else bool(unprotected_left),
    )


def _edge_known(raw: dict[str, Any], road_class: RoadClass) -> frozenset[FactorCode]:
    known = {code for code, keys in _KNOWN_KEYS.items() if any(k in raw for k in keys)}
    if road_class not in _MERGE_ROAD_CLASSES:
        known.add(FactorCode.MERGE_DIVERGE)
    return frozenset(known)


def _edge_factor_amounts(raw: dict[str, Any], length_km: float, road_class: RoadClass) -> dict[FactorCode, float]:
    lanes = raw.get("lanes")
    width = raw.get("width_m")
    if "narrow" in raw:
        narrow = bool(raw["narrow"])
    else:
        narrow = (lanes is not None and lanes <= NARROW_MAX_LANES) or (
            width is not None and width < NARROW_MAX_WIDTH_M
        )
    surface = raw.get("surface")
    unpaved = surface is not None and surface not in PAVED_SURFACES
    amounts = {
        FactorCode.TRAFFIC_LIGHT: int(raw.get("traffic_lights", 0)),
        FactorCode.PROTECTED_ZONE: int(bool(raw.get("protected_zone", False))),
        FactorCode.NARROW_ROAD: length_km if narrow else 0.0,
        FactorCode.UNPAVED_ROAD: length_km if unpaved else 0.0,
        FactorCode.ROUNDABOUT: int(bool(raw.get("roundabout", False))),
        FactorCode.LANE_CHANGE: int(raw.get("lane_changes", 0)),
        FactorCode.MERGE_DIVERGE: int(raw.get("merge_diverge", raw.get("lane_change", 0))),
        FactorCode.ACCIDENT_ZONE: int(bool(raw.get("accident_zone", False))),
        FactorCode.SHARP_TURN: int(raw.get("sharp_curves", 0)),
        FactorCode.TRAFFIC_VOLUME: length_km if raw.get("congested", False) else 0.0,
        FactorCode.ROAD_TYPE: length_km if road_class is RoadClass.HIGHWAY else 0.0,
    }
    return {code: n for code, n in amounts.items() if n > 0}
