from pathlib import Path

import pytest

from app.domain.factors import FactorCode
from app.domain.models import Availability, Point, Profile
from app.routing.dijkstra import DijkstraRouteFinder
from app.routing.graph import RoadGraph
from app.routing.osm import convert

# 십자 교차로 X 하나.
#
#            N2
#            |  골목
#            N
#            |  남북길 (이면도로, 차로 태그 없음)
#   W ------ X -Q--M-- E --> Z (일방통행 막다른 길: 연결 요소에서 빠짐)
#   서쪽대로 |  동쪽대로      \
#            S                P (주차장 통로: 제외)
#
# X 에 신호, Q(X 에서 약 18m)에 신호 횡단보도.
OSM = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
 <node id="W" lat="37.5000" lon="127.0290"/>
 <node id="X" lat="37.5000" lon="127.0300"><tag k="highway" v="traffic_signals"/></node>
 <node id="Q" lat="37.5000" lon="127.0302"><tag k="highway" v="crossing"/><tag k="crossing" v="traffic_signals"/></node>
 <node id="M" lat="37.5000" lon="127.0305"/>
 <node id="E" lat="37.5000" lon="127.0310"/>
 <node id="Z" lat="37.5000" lon="127.0320"/>
 <node id="P" lat="37.4995" lon="127.0310"/>
 <node id="N" lat="37.5010" lon="127.0300"/>
 <node id="N2" lat="37.5020" lon="127.0300"/>
 <node id="S" lat="37.4990" lon="127.0300"/>
 <way id="1"><nd ref="W"/><nd ref="X"/>
  <tag k="highway" v="primary"/><tag k="name" v="서쪽대로"/><tag k="lanes" v="4"/><tag k="surface" v="asphalt"/></way>
 <way id="7"><nd ref="X"/><nd ref="Q"/><nd ref="M"/><nd ref="E"/>
  <tag k="highway" v="primary"/><tag k="name" v="동쪽대로"/><tag k="maxspeed" v="60"/></way>
 <way id="2"><nd ref="S"/><nd ref="X"/><nd ref="N"/>
  <tag k="highway" v="residential"/><tag k="name" v="남북길"/></way>
 <way id="3"><nd ref="N"/><nd ref="N2"/><tag k="highway" v="service"/><tag k="service" v="alley"/></way>
 <way id="4"><nd ref="E"/><nd ref="P"/><tag k="highway" v="service"/><tag k="service" v="parking_aisle"/></way>
 <way id="5"><nd ref="E"/><nd ref="Z"/><tag k="highway" v="residential"/><tag k="oneway" v="yes"/></way>
 <way id="8"><nd ref="W"/><nd ref="S"/><tag k="highway" v="footway"/></way>
 <relation id="r1">
  <member type="way" ref="1" role="from"/><member type="node" ref="X" role="via"/><member type="way" ref="2" role="to"/>
  <tag k="type" v="restriction"/><tag k="restriction" v="no_left_turn"/></relation>
 <relation id="r2">
  <member type="way" ref="7" role="from"/><member type="node" ref="X" role="via"/><member type="way" ref="2" role="to"/>
  <tag k="type" v="restriction"/><tag k="restriction" v="only_right_turn"/></relation>
 <relation id="r3">
  <member type="node" ref="X" role="via"/><member type="way" ref="2" role="to"/>
  <tag k="type" v="restriction"/><tag k="restriction" v="no_u_turn"/></relation>
</osm>
"""


@pytest.fixture
def converted():
    return convert(OSM, "테스트 OSM")


def _edges(data) -> dict[str, dict]:
    return {e["id"]: e for e in data["edges"]}


def test_splits_ways_at_junctions_and_writes_both_directions(converted):
    data, _ = converted
    edges = _edges(data)
    # 교차로 X 에서 남북길이 둘로 나뉘고, 양방향 도로는 역방향을 따로 쓴다
    assert {"w2_0", "w2_0_r", "w2_1", "w2_1_r"} <= edges.keys()
    assert (edges["w2_0"]["from"], edges["w2_0"]["to"]) == ("S", "X")
    assert (edges["w2_0_r"]["from"], edges["w2_0_r"]["to"]) == ("X", "S")
    assert all(e["oneway"] for e in edges.values())
    # 중간 노드는 형상점으로만 남는다
    assert edges["w7_0"]["geometry"] == [[37.5, 127.0302], [37.5, 127.0305]]
    assert {n["id"] for n in data["nodes"]} == {"W", "X", "E", "N", "N2", "S"}


def test_drops_non_drivable_and_dead_end_roads(converted):
    data, stats = converted
    ids = {e["id"] for e in data["edges"]}
    assert not any(i.startswith(("w4_", "w8_")) for i in ids)  # 주차장 통로, 보도
    assert not any(i.startswith("w5_") for i in ids)  # 빠져나올 수 없는 일방통행
    assert stats.edges_dropped == 1


def test_road_attributes(converted):
    edges = _edges(converted[0])
    west = edges["w1_0"]
    assert west["road_class"] == "ARTERIAL"
    assert west["speed_kph"] == 50  # maxspeed 가 없으면 등급 기본값
    assert west["lanes"] == 2  # OSM lanes 는 양방향 합계
    assert west["narrow"] is False
    assert west["surface"] == "asphalt"
    assert west["roundabout"] is False
    assert edges["w7_0"]["speed_kph"] == 60
    assert edges["w3_0"]["narrow"] is True  # 골목


def test_missing_tags_stay_unknown(converted):
    """태그가 없으면 키를 쓰지 않는다. 0 이나 false 로 채우면 "확인한 결과 없음" 이 된다."""
    side = _edges(converted[0])["w2_1"]  # X→N: 시작 노드 X 의 신호는 세지 않는다
    for key in ("lanes", "narrow", "surface", "traffic_lights", "protected_zone", "accident_zone", "congested"):
        assert key not in side


def test_traffic_signals_count_once_per_direction(converted):
    edges = _edges(converted[0])
    assert edges["w1_0"]["traffic_lights"] == 1  # W→X: 끝 노드 X 의 신호
    assert "traffic_lights" not in edges["w1_0_r"]  # X→W: 시작 노드 신호는 앞 구간이 셌다
    assert edges["w7_0"]["traffic_lights"] == 1  # X→E: 횡단보도 Q
    assert edges["w7_0_r"]["traffic_lights"] == 1  # E→X: Q 와 X 는 18m 거리라 한 번


def test_turn_restrictions(converted):
    data, stats = converted
    banned = {(r["from"], r["to"]) for r in data["turn_restrictions"]}
    # 서쪽대로에서 남북길 좌회전 금지: 남북길이 X 를 지나므로 북쪽(좌회전) 방향을 고른다
    assert ("w1_0", "w2_1") in banned
    assert ("w1_0", "w2_0_r") not in banned
    # 동쪽대로에서는 우회전(북쪽)만 허용: 나머지 전부 금지
    assert {("w7_0_r", "w1_0_r"), ("w7_0_r", "w2_0_r"), ("w7_0_r", "w7_0")} <= banned
    assert ("w7_0_r", "w2_1") not in banned
    assert stats.restrictions_outside == 1


def test_router_never_takes_banned_turn(converted):
    graph = RoadGraph.from_dict(converted[0])
    finder = DijkstraRouteFinder(graph)
    w, n = graph.nodes["W"].point, graph.nodes["N"].point
    [route] = finder.find_route(w, n, Profile.fastest())
    # 바로 좌회전하면 약 200m. 금지라서 돌아간다
    assert route.distance_m > 250
    assert route.steps[1].maneuver.value != "LEFT"


def test_banned_turn_holds_when_starting_mid_road(converted):
    """도로 중간에서 출발해도(조각 엣지) 원래 구간의 회전 금지를 지킨다."""
    graph = RoadGraph.from_dict(converted[0])
    [route] = DijkstraRouteFinder(graph).find_route(Point(37.5, 127.0295), graph.nodes["N"].point, Profile.fastest())
    # 바로 좌회전하면 약 155m
    assert route.distance_m > 200
    assert route.steps[1].maneuver.value != "LEFT"


def test_measurements_reflect_osm_coverage(converted):
    graph = RoadGraph.from_dict(converted[0])
    w, s = graph.nodes["W"].point, graph.nodes["S"].point
    [route] = DijkstraRouteFinder(graph).find_route(w, s, Profile.fastest())
    # W→X 는 신호 1, X→S 는 신호 정보 없음
    lights = route.measurements[FactorCode.TRAFFIC_LIGHT]
    assert lights.availability is Availability.PARTIAL
    assert lights.value == 1
    assert route.measurements[FactorCode.PROTECTED_ZONE].availability is Availability.UNKNOWN
    assert graph.source.name == "테스트 OSM"


def test_graph_rejects_restriction_that_is_not_a_turn(converted):
    data = dict(converted[0])
    data["turn_restrictions"] = [{"from": "w1_0", "to": "w3_0"}]  # W→X 다음에 N→N2 는 이어지지 않는다
    with pytest.raises(ValueError):
        RoadGraph.from_dict(data)


def test_narrow_key_overrides_lane_rule():
    graph = RoadGraph.from_dict({
        "nodes": [{"id": "A", "lat": 35.0, "lng": 127.0}, {"id": "B", "lat": 35.001, "lng": 127.0}],
        "edges": [{"id": "AB", "from": "A", "to": "B", "lanes": 1, "narrow": False}],
    })
    edge = graph.edges["AB"]
    assert FactorCode.NARROW_ROAD in edge.known
    assert not edge.has(FactorCode.NARROW_ROAD)


GANGNAM = Path(__file__).resolve().parents[1] / "data" / "gangnam.json"


def test_bundled_gangnam_graph_routes_between_stations():
    """data/gangnam.json (강남역·역삼역 일대 OSM) 이 지금 형식으로 읽히고 길을 찾는다."""
    graph = RoadGraph.from_json_file(GANGNAM)
    assert graph.banned_turns  # 회전 금지가 들어 있다
    area = graph.service_area()
    gangnam, yeoksam = Point(37.4979, 127.0276), Point(37.5006, 127.0364)
    for p in (gangnam, yeoksam):
        assert area.min_lat <= p.lat <= area.max_lat and area.min_lng <= p.lng <= area.max_lng
    routes = DijkstraRouteFinder(graph).find_route(gangnam, yeoksam, Profile(), max_routes=3)
    assert routes
    assert all(r.steps for r in routes)
