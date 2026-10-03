"""도로망 그래프.

자료정리 파트가 아래 JSON 형식으로 내보내면 GRAPH_PATH 로 바로 불러올 수 있다.

{
  "nodes": [{"id": "n1", "lat": 35.15, "lng": 126.85}, ...],
  "edges": [{
    "id": "e1", "from": "n1", "to": "n2",
    "oneway": false,              # false 면 역방향 엣지 자동 생성 (id + "_r")
    "length_m": 420.0,            # 생략 시 좌표로 계산
    "speed_kph": 40,
    "road_class": "LOCAL",        # HIGHWAY / ARTERIAL / LOCAL
    "name": "상무대로",
    "geometry": [[lat, lng], ...],  # 선택. 양 끝 노드 사이의 중간 형상점
    "traffic_lights": 1,
    "lanes": 2, "width_m": 6.5,   # 좁은 도로 판정
    "surface": "asphalt",         # OSM surface 태그
    "protected_zone": false,
    "roundabout": false,
    "lane_change": 0,             # 합류·분기 지점 수
    "accident_zone": false
  }, ...]
}
"""

import itertools
import json
import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from app.domain.factors import FactorCode
from app.domain.models import Point
from app.routing.geo import bearing_deg, haversine_m

NARROW_MAX_LANES = 1
NARROW_MAX_WIDTH_M = 5.0
PAVED_SURFACES = {"asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett"}

METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LNG_EQUATOR = 111_320.0


class RoadClass(StrEnum):
    HIGHWAY = "HIGHWAY"
    ARTERIAL = "ARTERIAL"
    LOCAL = "LOCAL"


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
    factor_counts: dict[FactorCode, int]

    @property
    def travel_time_s(self) -> float:
        return self.length_m / (self.speed_kph / 3.6)

    @property
    def start_bearing(self) -> float:
        return bearing_deg(self.geometry[0], self.geometry[1])

    @property
    def end_bearing(self) -> float:
        return bearing_deg(self.geometry[-2], self.geometry[-1])

    def has(self, code: FactorCode) -> bool:
        return self.factor_counts.get(code, 0) > 0


class _NodeGrid:
    """균일 격자 기반 최근접 노드 인덱스.

    노드가 수십만 규모가 되면 요청당 선형 스캔 4회가 수초로 불어난다.
    KD-tree(scipy) 대신 격자를 쓴 이유는 외부 의존성 없이 충분히 빠르고
    도로망처럼 고르게 퍼진 점 데이터에 잘 맞기 때문이다.

    중심 셀에서 바깥으로 링을 넓혀 가며 보고, **아직 보지 않은 셀이 현재 최선보다
    가까울 수 없게 되는 순간** 멈춘다. 그래서 전체 스캔과 같은 답을 준다.
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

    def _key(self, point: Point) -> tuple[int, int]:
        return math.floor(point.lat / self._cell), math.floor(point.lng / self._cell)

    def nearest(self, point: Point) -> tuple[Node, float] | None:
        if not self._buckets:
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

        return None if best is None else (best, best_m)


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
    def __init__(self, nodes: list[Node], edges: list[Edge]):
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
        self._node_grid = _NodeGrid(self.nodes.values())

    def nearest_node(self, point: Point) -> tuple[Node, float]:
        found = self._node_grid.nearest(point)
        if found is None:
            raise ValueError("그래프에 노드가 없습니다.")
        return found

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RoadGraph":
        nodes = [Node(str(n["id"]), Point(float(n["lat"]), float(n["lng"]))) for n in data["nodes"]]
        by_id = {n.id: n for n in nodes}
        edges: list[Edge] = []
        for raw in data["edges"]:
            source, target = str(raw["from"]), str(raw["to"])
            inner = tuple(Point(float(lat), float(lng)) for lat, lng in raw.get("geometry", []))
            geometry = (by_id[source].point, *inner, by_id[target].point)
            edges.append(_build_edge(str(raw["id"]), source, target, geometry, raw))
            if not raw.get("oneway", False):
                edges.append(_build_edge(f"{raw['id']}_r", target, source, geometry[::-1], raw))
        return cls(nodes, edges)

    @classmethod
    def from_json_file(cls, path: str | Path) -> "RoadGraph":
        with open(path, encoding="utf-8") as f:
            return cls.from_dict(json.load(f))


def _build_edge(
    edge_id: str, source: str, target: str, geometry: tuple[Point, ...], raw: dict[str, Any]
) -> Edge:
    length = raw.get("length_m")
    if length is None:
        length = sum(haversine_m(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1))
    return Edge(
        id=edge_id,
        source=source,
        target=target,
        geometry=geometry,
        length_m=float(length),
        speed_kph=float(raw.get("speed_kph", 30)),
        road_class=RoadClass(raw.get("road_class", RoadClass.LOCAL)),
        name=raw.get("name"),
        factor_counts=_edge_factor_counts(raw),
    )


def _edge_factor_counts(raw: dict[str, Any]) -> dict[FactorCode, int]:
    lanes = raw.get("lanes")
    width = raw.get("width_m")
    narrow = (lanes is not None and lanes <= NARROW_MAX_LANES) or (
        width is not None and width < NARROW_MAX_WIDTH_M
    )
    surface = raw.get("surface")
    unpaved = surface is not None and surface not in PAVED_SURFACES
    counts = {
        FactorCode.TRAFFIC_LIGHT: int(raw.get("traffic_lights", 0)),
        FactorCode.PROTECTED_ZONE: int(bool(raw.get("protected_zone", False))),
        FactorCode.NARROW_ROAD: int(narrow),
        FactorCode.UNPAVED_ROAD: int(unpaved),
        FactorCode.ROUNDABOUT: int(bool(raw.get("roundabout", False))),
        FactorCode.LANE_CHANGE_TRAFFIC: int(raw.get("lane_change", 0)),
        FactorCode.ACCIDENT_ZONE: int(bool(raw.get("accident_zone", False))),
    }
    return {code: n for code, n in counts.items() if n > 0}
