"""OpenStreetMap XML → 도로망 그래프 JSON (형식은 graph.py 상단).

    python -m app.routing.osm 원본.osm 출력.json [--name 이름]

원본은 OSM XML 이다 (Overpass 결과나 OSM API /api/0.6/map 결과. 받는 방법은 backend/README.md). 차가 다닐 수 있는 도로만 남기고
교차로마다 구간을 나눈다. 영역 경계에서 잘린 일방통행에 갇히지 않도록 가장 큰 강연결 부분만 남긴다.

**OSM 에 태그가 없다고 "없음" 은 아니다.** 태그가 있을 때만 키를 쓰고, 없으면 "정보 없음" 으로 둔다.
- 신호등: OSM 에 빠진 곳이 많아 신호가 있는 구간에만 traffic_lights 를 쓴다. 나머지 구간은 정보 없음
- 좁은 도로: FE 정의(마주 오는 차와 지나가기 빠듯한 길)대로 narrow 를 직접 판정한다.
  폭 태그, 골목(service=alley), 양방향 1차로, 간선·보조간선 등급으로 판정하고 그 밖의 이면도로는 정보 없음
- 회전교차로: 도로 모양 자체라 빠지는 일이 드물어 모든 구간에 쓴다
- 급커브: 태그가 아니라 도로 형상에서 판정하므로 모든 구간에 쓴다. 회전교차로 구간은 회전교차로로만 센다
- 보호구역·사고다발·교통량·비보호 좌회전·차로 변경: OSM 에 없다. 공공데이터로 따로 붙여야 한다

OSM 의 회전 금지(type=restriction, 경유지가 노드인 것)는 turn_restrictions 로 옮긴다.
"""

import argparse
import json
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.domain.models import DataSourceKind, Point, RoadClass, Verification
from app.routing.geo import bearing_deg, haversine_m, signed_turn_deg
from app.routing.graph import NARROW_MAX_WIDTH_M

# highway 값 → (도로 등급, 기본 속도 km/h). 속도는 안전속도 5030(도시 간선 50, 이면도로 30) 기준
ROAD_TYPES: dict[str, tuple[RoadClass, float]] = {
    "motorway": (RoadClass.HIGHWAY, 100),
    "motorway_link": (RoadClass.RAMP, 50),
    "trunk": (RoadClass.ARTERIAL, 70),
    "trunk_link": (RoadClass.ARTERIAL, 40),
    "primary": (RoadClass.ARTERIAL, 50),
    "primary_link": (RoadClass.ARTERIAL, 30),
    "secondary": (RoadClass.COLLECTOR, 50),
    "secondary_link": (RoadClass.COLLECTOR, 30),
    "tertiary": (RoadClass.COLLECTOR, 40),
    "tertiary_link": (RoadClass.COLLECTOR, 30),
    "unclassified": (RoadClass.LOCAL, 30),
    "residential": (RoadClass.LOCAL, 30),
    "living_street": (RoadClass.LOCAL, 20),
    "service": (RoadClass.LOCAL, 20),
}
# 주차장 통로·건물 진입로는 경로로 안내하지 않는다
EXCLUDED_SERVICE = {"parking_aisle", "driveway", "drive-through", "emergency_access"}
NO_ACCESS = {"no", "private"}
WIDE_HIGHWAYS = {"motorway", "trunk", "primary", "secondary"}
ROUNDABOUT_JUNCTIONS = {"roundabout", "circular"}
# 한 구간 안에서 이 거리 안의 신호는 같은 신호로 본다 (교차로 신호와 바로 앞 횡단보도 신호)
SIGNAL_MERGE_M = 30.0
# 교차로가 아닌 곳에서 도로가 이 거리 안에 이 각도 이상 꺾이면 급커브 한 곳으로 센다 (FE 데모 SHARP_CURVE_MIN_ANGLE 과 같은 각도).
# 형상점 여러 개로 그린 굽은 길도 잡도록 거리 안의 회전각을 더한다. 40m 안에 60° 면 곡선 반지름 약 38m 이하다
SHARP_CURVE_MIN_DEG = 60.0
SHARP_CURVE_WINDOW_M = 40.0
MIN_EDGE_M = 0.5
# 회전 금지 종류 → 그 회전의 대표 각도 (양수가 우회전)
RESTRICTION_ANGLES = {"left_turn": -90.0, "right_turn": 90.0, "straight_on": 0.0, "u_turn": 180.0}

DEFAULT_NAME = "OpenStreetMap"
ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"


@dataclass
class _Edge:
    id: str
    way: str
    nodes: list[str]  # source ~ target
    points: list[Point]
    attrs: dict[str, Any]

    @property
    def source(self) -> str:
        return self.nodes[0]

    @property
    def target(self) -> str:
        return self.nodes[-1]


@dataclass
class ConversionStats:
    ways: int = 0
    edges_dropped: int = 0
    restrictions: int = 0
    # 대상 도로가 원본 범위 밖이라 옮기지 못한 규칙
    restrictions_outside: int = 0
    # 경유지가 도로인 규칙, 일방통행이라 애초에 할 수 없는 회전 등
    restrictions_skipped: int = 0
    signal_edges: int = 0
    narrow_known_edges: int = 0
    sharp_curves: int = 0
    highway: Counter[str] = field(default_factory=Counter)


def convert(xml: str | bytes, name: str = DEFAULT_NAME) -> tuple[dict[str, Any], ConversionStats]:
    root = ET.fromstring(xml)
    stats = ConversionStats()

    points: dict[str, Point] = {}
    signals: set[str] = set()
    for node in root.iter("node"):
        nid = node.get("id")
        points[nid] = Point(float(node.get("lat")), float(node.get("lon")))
        if _is_signal(_tags(node)):
            signals.add(nid)

    ways = [
        (way.get("id"), [nd.get("ref") for nd in way.iter("nd")], tags)
        for way in root.iter("way")
        if _drivable(tags := _tags(way))
    ]
    ways = [(wid, [r for r in refs if r in points], tags) for wid, refs, tags in ways]
    ways = [(wid, refs, tags) for wid, refs, tags in ways if len(refs) >= 2]
    stats.ways = len(ways)

    # 두 도로 이상이 지나거나 도로가 끝나는 노드에서 구간을 나눈다
    usage = Counter(ref for _, refs, _ in ways for ref in refs)
    ends = {ref for _, refs, _ in ways for ref in (refs[0], refs[-1])}

    edges: list[_Edge] = []
    for wid, refs, tags in ways:
        stats.highway[tags["highway"]] += 1
        forward, backward = _directions(tags)
        two_way = forward and backward
        start = 0
        part = 0
        for i in range(1, len(refs)):
            if i < len(refs) - 1 and usage[refs[i]] < 2 and refs[i] not in ends:
                continue
            chunk = refs[start : i + 1]
            start = i
            length = sum(haversine_m(points[a], points[b]) for a, b in zip(chunk, chunk[1:]))
            if length < MIN_EDGE_M:
                continue  # 같은 좌표가 겹친 노드. 방향을 정할 수 없다
            key = f"w{wid}_{part}"
            part += 1
            if forward:
                edges.append(_make_edge(key, wid, chunk, points, signals, tags, two_way, forward=True))
            if backward:
                edges.append(
                    _make_edge(key + "_r", wid, chunk[::-1], points, signals, tags, two_way, forward=False)
                )

    banned = _restrictions(root, edges, stats)

    keep = _largest_component(edges)
    kept_edges = [e for e in edges if e.source in keep and e.target in keep]
    stats.edges_dropped = len(edges) - len(kept_edges)
    kept_ids = {e.id for e in kept_edges}
    banned = sorted((a, b) for a, b in banned if a in kept_ids and b in kept_ids)
    stats.restrictions = len(banned)
    stats.signal_edges = sum("traffic_lights" in e.attrs for e in kept_edges)
    stats.narrow_known_edges = sum("narrow" in e.attrs for e in kept_edges)
    stats.sharp_curves = sum(e.attrs["sharp_curves"] for e in kept_edges)

    node_ids = sorted({n for e in kept_edges for n in (e.source, e.target)})
    data = {
        "source": {"kind": DataSourceKind.PUBLIC_DATA.value, "name": name},
        "verification": Verification.UNVERIFIED.value,
        "attribution": ATTRIBUTION,
        "nodes": [{"id": n, "lat": points[n].lat, "lng": points[n].lng} for n in node_ids],
        "edges": [_edge_json(e) for e in kept_edges],
        "turn_restrictions": [{"from": a, "to": b} for a, b in banned],
    }
    return data, stats


def _tags(element: ET.Element) -> dict[str, str]:
    return {t.get("k"): t.get("v") for t in element.iter("tag")}


def _is_signal(tags: dict[str, str]) -> bool:
    if tags.get("highway") == "traffic_signals":
        return True
    # 차량 신호가 있는 횡단보도
    return tags.get("highway") == "crossing" and tags.get("crossing") == "traffic_signals"


def _drivable(tags: dict[str, str]) -> bool:
    if tags.get("highway") not in ROAD_TYPES or tags.get("area") == "yes":
        return False
    if tags.get("highway") == "service" and tags.get("service") in EXCLUDED_SERVICE:
        return False
    access = tags.get("motor_vehicle") or tags.get("motorcar") or tags.get("access")
    return access not in NO_ACCESS


def _directions(tags: dict[str, str]) -> tuple[bool, bool]:
    """(정방향 통행, 역방향 통행)"""
    oneway = tags.get("oneway")
    if oneway in ("yes", "true", "1"):
        return True, False
    if oneway in ("-1", "reverse"):
        return False, True
    if oneway == "no":
        return True, True
    implied = tags.get("junction") in ROUNDABOUT_JUNCTIONS or tags["highway"] in ("motorway", "motorway_link")
    return True, not implied


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value.split(";")[0].strip())
    except ValueError:
        return None


def _speed_kph(tags: dict[str, str]) -> float:
    raw = tags.get("maxspeed", "")
    if raw.endswith("mph"):
        mph = _number(raw[:-3])
        if mph:
            return round(mph * 1.609, 1)
    speed = _number(raw.removesuffix("km/h"))
    return speed if speed else ROAD_TYPES[tags["highway"]][1]


def _lanes(tags: dict[str, str], two_way: bool, forward: bool) -> int | None:
    """이 방향의 차로 수. OSM lanes 는 양방향 합계다."""
    if two_way:
        own = _number(tags.get("lanes:forward" if forward else "lanes:backward"))
        if own:
            return int(own)
    total = _number(tags.get("lanes"))
    if not total:
        return None
    return int(total) if not two_way else max(1, int(total) // 2)


def _narrow(tags: dict[str, str], two_way: bool) -> bool | None:
    width = _number(tags.get("width"))
    if width:
        return width < NARROW_MAX_WIDTH_M
    if tags.get("service") == "alley":
        return True
    total = _number(tags.get("lanes"))
    if not total:
        # 간선·보조간선 도로는 등급 자체가 좁은 길이 아니라는 뜻이다. 이면도로는 알 수 없다
        return False if tags["highway"].removesuffix("_link") in WIDE_HIGHWAYS else None
    # 일방통행은 마주 오는 차가 없으니 차로 수만으로는 좁다고 하지 않는다
    return two_way and total <= 1


def _make_edge(
    edge_id: str,
    way_id: str,
    nodes: list[str],
    points: dict[str, Point],
    signals: set[str],
    tags: dict[str, str],
    two_way: bool,
    *,
    forward: bool,
) -> _Edge:
    road_class, _ = ROAD_TYPES[tags["highway"]]
    geometry = [points[n] for n in nodes]
    roundabout = tags.get("junction") in ROUNDABOUT_JUNCTIONS
    attrs: dict[str, Any] = {
        "oneway": True,  # 방향마다 신호 수가 달라서 역방향도 따로 쓴다
        "speed_kph": _speed_kph(tags),
        "road_class": road_class.value,
        "roundabout": roundabout,
        # 회전교차로는 원래 계속 꺾이는 길이라 회전교차로 요소로만 센다
        "sharp_curves": 0 if roundabout else _sharp_curves(geometry),
    }
    if tags.get("name"):
        attrs["name"] = tags["name"]
    if lanes := _lanes(tags, two_way, forward):
        attrs["lanes"] = lanes
    if (narrow := _narrow(tags, two_way)) is not None:
        attrs["narrow"] = narrow
    if tags.get("surface"):
        attrs["surface"] = tags["surface"]
    if count := _signal_count(nodes, geometry, signals):
        attrs["traffic_lights"] = count
    return _Edge(edge_id, way_id, nodes, geometry, attrs)


def _signal_count(nodes: list[str], geometry: list[Point], signals: set[str]) -> int:
    """구간 안과 끝 노드의 신호 수. 시작 노드 신호는 앞 구간이 이미 셌다."""
    count = 0
    offset = 0.0
    last_at: float | None = None
    for i in range(1, len(nodes)):
        offset += haversine_m(geometry[i - 1], geometry[i])
        if nodes[i] in signals:
            if last_at is None or offset - last_at > SIGNAL_MERGE_M:
                count += 1
            last_at = offset
    return count


def _sharp_curves(geometry: list[Point]) -> int:
    """구간 안에서 도로가 급하게 꺾이는 곳의 수. 교차로 회전은 구간 사이 전환이라 여기서 세지 않는다."""
    segments = [(bearing_deg(a, b), haversine_m(a, b)) for a, b in zip(geometry, geometry[1:])]
    segments = [s for s in segments if s[1] >= MIN_EDGE_M]
    # 형상점마다 (구간 시작부터의 거리, 꺾인 각도)
    bends: list[tuple[float, float]] = []
    offset = 0.0
    for (before, length), (after, _) in zip(segments, segments[1:]):
        offset += length
        bends.append((offset, signed_turn_deg(before, after)))

    count = 0
    i = 0
    while i < len(bends):
        start, total = bends[i][0], 0.0
        end = None
        for j in range(i, len(bends)):
            if bends[j][0] - start > SHARP_CURVE_WINDOW_M:
                break
            total += bends[j][1]
            if abs(total) >= SHARP_CURVE_MIN_DEG:
                end = j
                break
        if end is None:
            i += 1
        else:
            count += 1
            i = end + 1  # 같은 굴곡을 두 번 세지 않는다
    return count


def _restrictions(root: ET.Element, edges: list[_Edge], stats: ConversionStats) -> set[tuple[str, str]]:
    by_way: dict[str, list[_Edge]] = defaultdict(list)
    out_edges: dict[str, list[_Edge]] = defaultdict(list)
    for edge in edges:
        by_way[edge.way].append(edge)
        out_edges[edge.source].append(edge)

    banned: set[tuple[str, str]] = set()
    for rel in root.iter("relation"):
        tags = _tags(rel)
        if tags.get("type") != "restriction":
            continue
        kind = tags.get("restriction:motorcar") or tags.get("restriction")
        if not kind or "motorcar" in tags.get("except", ""):
            continue
        members = [(m.get("type"), m.get("ref"), m.get("role")) for m in rel.iter("member")]
        froms = [ref for t, ref, role in members if role == "from" and t == "way"]
        vias = [(t, ref) for t, ref, role in members if role == "via"]
        tos = [ref for t, ref, role in members if role == "to" and t == "way"]
        prohibit = kind.startswith("no_")
        angle = RESTRICTION_ANGLES.get(kind.removeprefix("no_").removeprefix("only_"))
        if len(froms) != 1 or len(tos) != 1 or len(vias) != 1 or vias[0][0] != "node" or angle is None:
            # OSM API 는 범위 밖 구성원을 빼고 주므로 from/to 가 비어 있으면 범위 밖이다
            if not froms or not tos:
                stats.restrictions_outside += 1
            else:
                stats.restrictions_skipped += 1  # 경유지가 도로인 것 등은 아직 옮기지 않는다
            continue
        if froms[0] not in by_way or tos[0] not in by_way:
            stats.restrictions_outside += 1
            continue
        via = vias[0][1]
        to_candidates = [e for e in by_way.get(tos[0], []) if e.source == via]
        applied = False
        for from_edge in (e for e in by_way.get(froms[0], []) if e.target == via):
            to_edge = _pick_turn(from_edge, to_candidates, angle)
            if to_edge is None:
                continue
            applied = True
            if prohibit:
                banned.add((from_edge.id, to_edge.id))
            else:
                banned.update((from_edge.id, o.id) for o in out_edges[via] if o.id != to_edge.id)
        if not applied:
            stats.restrictions_skipped += 1
    return banned


def _pick_turn(from_edge: _Edge, candidates: list[_Edge], angle: float) -> _Edge | None:
    """to 도로가 경유 노드를 지나쳐 양쪽으로 나가면, 금지 종류의 각도에 가까운 쪽을 고른다."""
    if len(candidates) <= 1:
        return candidates[0] if candidates else None
    heading_in = bearing_deg(from_edge.points[-2], from_edge.points[-1])

    def gap(edge: _Edge) -> float:
        turn = signed_turn_deg(heading_in, bearing_deg(edge.points[0], edge.points[1]))
        if angle == 180.0:
            return 180.0 - abs(turn)
        return abs(turn - angle)

    return min(candidates, key=gap)


def _largest_component(edges: list[_Edge]) -> set[str]:
    """가장 큰 강연결 요소의 노드 (Kosaraju, 반복문)."""
    forward: dict[str, list[str]] = defaultdict(list)
    backward: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        forward[e.source].append(e.target)
        backward[e.target].append(e.source)
    nodes = list(dict.fromkeys(n for e in edges for n in (e.source, e.target)))

    order: list[str] = []
    seen: set[str] = set()
    for start in nodes:
        if start in seen:
            continue
        seen.add(start)
        stack = [(start, iter(forward[start]))]
        while stack:
            node, it = stack[-1]
            nxt = next((n for n in it if n not in seen), None)
            if nxt is None:
                order.append(node)
                stack.pop()
            else:
                seen.add(nxt)
                stack.append((nxt, iter(forward[nxt])))

    best: set[str] = set()
    assigned: set[str] = set()
    for start in reversed(order):
        if start in assigned:
            continue
        component = {start}
        assigned.add(start)
        stack = [start]
        while stack:
            for prev in backward[stack.pop()]:
                if prev not in assigned:
                    assigned.add(prev)
                    component.add(prev)
                    stack.append(prev)
        if len(component) > len(best):
            best = component
    return best


def _edge_json(edge: _Edge) -> dict[str, Any]:
    return {
        "id": edge.id,
        "from": edge.source,
        "to": edge.target,
        "geometry": [[p.lat, p.lng] for p in edge.points[1:-1]],
        **edge.attrs,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="OSM XML 을 도로망 그래프 JSON 으로 바꾼다")
    parser.add_argument("source", type=Path, help="OSM XML (/api/0.6/map 결과)")
    parser.add_argument("output", type=Path, help="GRAPH_PATH 로 쓸 JSON")
    parser.add_argument("--name", default=DEFAULT_NAME, help="측정값 출처 이름")
    args = parser.parse_args(argv)

    data, stats = convert(args.source.read_bytes(), args.name)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    print(f"도로 {stats.ways}개 {dict(stats.highway)}")
    print(f"노드 {len(data['nodes'])}개, 방향 구간 {len(data['edges'])}개 (연결 안 된 구간 {stats.edges_dropped}개 제외)")
    print(
        f"회전 금지 {stats.restrictions}개 "
        f"(범위 밖 도로라 못 옮긴 규칙 {stats.restrictions_outside}개, 해당 없는 규칙 {stats.restrictions_skipped}개)"
    )
    print(f"신호 정보가 있는 구간 {stats.signal_edges}개, 좁은 도로 판정이 있는 구간 {stats.narrow_known_edges}개")
    print(f"급커브 {stats.sharp_curves}곳 (방향 구간마다 따로 셈)")


if __name__ == "__main__":
    main()
