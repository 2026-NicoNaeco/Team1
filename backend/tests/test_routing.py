import math
import random

import pytest

from app.domain.factors import FactorCode, MeasureUnit
from app.domain.models import Availability, DataSourceKind, Maneuver, Measurement, Point, Profile, RoadClass
from app.routing import polyline
from app.routing.cost import classify_turn
from app.routing.dijkstra import DijkstraRouteFinder
from app.routing.errors import OutOfServiceArea, SameLocation
from app.routing.geo import haversine_m, signed_turn_deg
from app.routing.graph import Node, RoadGraph, _NodeGrid
from app.routing.sample_graph import build_sample_graph

A = Point(35.0, 127.0)
D = Point(35.0036, 127.0044)


def _edge_ids(route) -> list[str]:
    # 경로 좌표로 경유 노드를 판별
    return [f"{p.lat:.4f},{p.lng:.4f}" for p in route.path]


def _via_b(route) -> bool:
    return "35.0036,127.0000" in _edge_ids(route)


def test_polyline_matches_google_reference():
    points = [Point(38.5, -120.2), Point(40.7, -120.95), Point(43.252, -126.453)]
    encoded = polyline.encode(points)
    assert encoded == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    assert polyline.decode(encoded) == points


@pytest.mark.parametrize(
    ("angle", "expected"),
    [
        (10, set()),
        (90, {FactorCode.TURN_COUNT}),
        # 100° 이상 회전도 방향 전환일 뿐이다. SHARP_TURN 은 급커브 구간이라 회전과 무관
        (120, {FactorCode.TURN_COUNT}),
        (175, {FactorCode.TURN_COUNT, FactorCode.U_TURN}),
    ],
)
def test_classify_turn(angle, expected):
    assert set(classify_turn(angle)) == expected


def test_fastest_profile_takes_short_narrow_road(square_graph: RoadGraph):
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, Profile.fastest())
    assert _via_b(route)
    assert route.factor_amounts[FactorCode.NARROW_ROAD] == pytest.approx(0.4)  # km
    assert route.distance_m == 800


def test_hard_factor_avoids_narrow_road(square_graph: RoadGraph):
    profile = Profile(hard_factors=frozenset({FactorCode.NARROW_ROAD}))
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, profile)
    assert not _via_b(route)
    assert route.factor_amounts.get(FactorCode.NARROW_ROAD, 0) == 0
    assert route.difficulty_score == 1.0  # 방향 전환 1회


def test_easy_factor_accepts_narrow_road(square_graph: RoadGraph):
    profile = Profile(easy_factors=frozenset({FactorCode.NARROW_ROAD}))
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, profile)
    assert _via_b(route)
    assert [h.code for h in route.hotspots] == [FactorCode.NARROW_ROAD]


def test_start_heading_counts_u_turn(square_graph: RoadGraph):
    # 남쪽을 향한 상태에서 북쪽(B)으로 출발하면 유턴
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, Profile.fastest(), start_heading_deg=180)
    assert _via_b(route)
    assert route.factor_amounts[FactorCode.U_TURN] == 1


def test_alternatives_are_distinct_and_sorted():
    finder = DijkstraRouteFinder(build_sample_graph())
    routes = finder.find_route(Point(35.1595, 126.8526), Point(35.1768, 126.9058), Profile(), max_routes=3)
    assert len(routes) == 3
    assert len({r.route_id for r in routes}) == 3
    assert [r.cost for r in routes] == sorted(r.cost for r in routes)


def test_out_of_service_area(square_graph: RoadGraph):
    with pytest.raises(OutOfServiceArea):
        DijkstraRouteFinder(square_graph).find_route(A, Point(37.5665, 126.9780), Profile())


def test_same_location(square_graph: RoadGraph):
    with pytest.raises(SameLocation):
        DijkstraRouteFinder(square_graph).find_route(A, Point(35.00001, 127.00001), Profile())


@pytest.mark.parametrize(
    ("bearing_from", "bearing_to", "expected"),
    [
        (0, 90, 90),  # 북 → 동 = 우회전
        (0, 270, -90),  # 북 → 서 = 좌회전
        (350, 10, 20),  # 0도를 넘는 경우
        (10, 350, -20),
    ],
)
def test_signed_turn_deg(bearing_from, bearing_to, expected):
    assert signed_turn_deg(bearing_from, bearing_to) == pytest.approx(expected)


def test_signed_turn_deg_opposite_is_180():
    assert abs(signed_turn_deg(0, 180)) == pytest.approx(180)


def test_steps_turn_right_toward_north_then_east(square_graph: RoadGraph):
    # A →(북) B →(동) D
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, Profile.fastest())
    assert [s.maneuver for s in route.steps] == [Maneuver.DEPART, Maneuver.RIGHT, Maneuver.ARRIVE]
    assert route.steps[1].turn_angle_deg > 0
    assert route.steps[0].factor_amounts[FactorCode.NARROW_ROAD] == pytest.approx(0.4)
    # 단계 거리의 합은 경로 전체 거리와 같아야 한다
    assert sum(s.distance_m for s in route.steps) == pytest.approx(route.distance_m)


def test_steps_turn_left_on_clean_branch(square_graph: RoadGraph):
    # A →(동) C →(북) D
    profile = Profile(hard_factors=frozenset({FactorCode.NARROW_ROAD}))
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, profile)
    assert [s.maneuver for s in route.steps] == [Maneuver.DEPART, Maneuver.LEFT, Maneuver.ARRIVE]
    assert route.steps[1].turn_angle_deg < 0


def test_steps_open_with_u_turn_when_heading_opposite(square_graph: RoadGraph):
    [route] = DijkstraRouteFinder(square_graph).find_route(
        A, D, Profile.fastest(), start_heading_deg=180
    )
    assert route.steps[0].maneuver is Maneuver.U_TURN
    assert route.steps[0].point == A


def test_steps_merge_straight_run_on_same_road():
    """같은 도로 직진은 엣지가 여러 개여도 한 단계로 합친다."""
    graph = RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.0, "lng": 127.000},
            {"id": "B", "lat": 35.0, "lng": 127.002},
            {"id": "C", "lat": 35.0, "lng": 127.004},
        ],
        "edges": [
            {"id": "AB", "from": "A", "to": "B", "name": "직진로", "speed_kph": 30},
            {"id": "BC", "from": "B", "to": "C", "name": "직진로", "speed_kph": 30},
        ],
    })
    [route] = DijkstraRouteFinder(graph).find_route(
        Point(35.0, 127.0), Point(35.0, 127.004), Profile()
    )
    assert [s.maneuver for s in route.steps] == [Maneuver.DEPART, Maneuver.ARRIVE]
    assert route.steps[0].road_name == "직진로"
    assert route.steps[0].distance_m == pytest.approx(route.distance_m)


def test_avoid_path_pushes_route_to_other_branch(square_graph: RoadGraph):
    finder = DijkstraRouteFinder(square_graph)
    [first] = finder.find_route(A, D, Profile.fastest())
    assert _via_b(first)

    # FE 는 폴리라인으로 돌려주므로 인코딩을 한 번 거친 좌표로 회피를 요청한다
    [again] = finder.find_route(
        A, D, Profile.fastest(), avoid_path=polyline.decode(polyline.encode(first.path))
    )
    assert not _via_b(again)
    assert again.route_id != first.route_id


def test_avoid_path_matches_both_directions(square_graph: RoadGraph):
    finder = DijkstraRouteFinder(square_graph)
    [first] = finder.find_route(A, D, Profile.fastest())
    # 반대 차선(_r)도 같은 구간으로 보고 함께 피한다
    assert finder._edges_on(first.path) == {"AB", "AB_r", "BD", "BD_r"}


def test_avoid_path_is_a_weight_not_a_ban():
    """유일한 연결이면 회피를 요청해도 그 경로를 반환해야 한다."""
    graph = RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.0, "lng": 127.0},
            {"id": "B", "lat": 35.0036, "lng": 127.0},
        ],
        "edges": [{"id": "AB", "from": "A", "to": "B", "length_m": 400, "speed_kph": 30}],
    })
    destination = Point(35.0036, 127.0)
    routes = DijkstraRouteFinder(graph).find_route(
        A, destination, Profile.fastest(), avoid_path=[A, destination]
    )
    assert len(routes) == 1


def test_avoid_path_ignores_degenerate_input(square_graph: RoadGraph):
    finder = DijkstraRouteFinder(square_graph)
    # 구간을 만들 수 없는 입력은 회피 없이 평소대로 탐색한다
    assert finder._edges_on(None) == set()
    assert finder._edges_on([A]) == set()
    [route] = finder.find_route(A, D, Profile.fastest(), avoid_path=[A])
    assert _via_b(route)


def _brute_force_nearest_m(nodes: list[Node], point: Point) -> float:
    return min(haversine_m(point, n.point) for n in nodes)


def test_node_grid_matches_brute_force():
    """격자 인덱스는 전체 스캔과 같은 답을 줘야 한다.

    조용히 다른 노드를 고르면 경로 탐색 전체가 틀어지므로 무작위로 전수 대조한다.
    """
    rng = random.Random(7)
    nodes = [
        Node(f"n{i}", Point(35.0 + rng.uniform(0, 0.5), 126.6 + rng.uniform(0, 0.7)))
        for i in range(2_000)
    ]
    grid = _NodeGrid(nodes)

    queries = [
        # 격자 안쪽, 경계 밖, 아주 먼 곳, 노드 위 정확히
        *(Point(35.0 + rng.uniform(-0.1, 0.6), 126.6 + rng.uniform(-0.1, 0.8)) for _ in range(200)),
        *(nodes[rng.randrange(len(nodes))].point for _ in range(50)),
        Point(37.5665, 126.9780),
        Point(33.0, 126.0),
    ]
    for query in queries:
        found = grid.nearest(query)
        assert found is not None
        assert math.isclose(found[1], _brute_force_nearest_m(nodes, query), rel_tol=1e-9, abs_tol=1e-6)


def test_node_grid_handles_degenerate_graphs():
    assert _NodeGrid([]).nearest(Point(35.0, 127.0)) is None

    only = Node("only", Point(35.0, 127.0))
    node, distance = _NodeGrid([only]).nearest(Point(35.01, 127.01))
    assert node is only
    assert distance == pytest.approx(haversine_m(Point(35.01, 127.01), only.point))


def test_nearest_node_finds_exact_node(square_graph: RoadGraph):
    node, distance = square_graph.nearest_node(Point(35.0036, 127.0044))
    assert node.id == "D"
    assert distance == pytest.approx(0, abs=1e-6)


def test_oneway_edges_are_respected():
    graph = RoadGraph.from_dict({
        "nodes": [{"id": "A", "lat": 35.0, "lng": 127.0}, {"id": "B", "lat": 35.001, "lng": 127.0}],
        "edges": [{"id": "AB", "from": "A", "to": "B", "oneway": True}],
    })
    assert set(graph.edges) == {"AB"}


# ---------- FE 기준 요소 정의 ----------

def _line_graph(*edge_attrs: dict) -> RoadGraph:
    """동쪽으로 곧게 이어진 구간들. 회전 없이 구간 속성만 비교할 때 쓴다."""
    nodes = [{"id": f"N{i}", "lat": 35.0, "lng": 127.0 + 0.002 * i} for i in range(len(edge_attrs) + 1)]
    edges = [
        {"id": f"E{i}", "from": f"N{i}", "to": f"N{i + 1}", "speed_kph": 30, **attrs}
        for i, attrs in enumerate(edge_attrs)
    ]
    return RoadGraph.from_dict({"nodes": nodes, "edges": edges})


def _line_route(graph: RoadGraph):
    end = graph.nodes[f"N{len(graph.nodes) - 1}"].point
    [route] = DijkstraRouteFinder(graph).find_route(Point(35.0, 127.0), end, Profile())
    return route


def test_measurements_distinguish_zero_from_unknown(square_graph: RoadGraph):
    # A→B(lanes 1)→D. BD 에는 속성이 하나도 없다
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, Profile.fastest())
    m = route.measurements

    narrow = m[FactorCode.NARROW_ROAD]
    assert narrow.availability is Availability.PARTIAL
    assert narrow.value == 0.4  # 확인된 구간(AB) 기준 km
    assert narrow.coverage == 0.5

    assert m[FactorCode.TRAFFIC_LIGHT].availability is Availability.UNKNOWN
    assert m[FactorCode.TRAFFIC_LIGHT].value is None
    # 회전은 도로 형상으로 계산하므로 항상 확인된다
    assert m[FactorCode.TURN_COUNT] == Measurement(
        Availability.KNOWN, MeasureUnit.COUNT, square_graph.source, square_graph.verification, value=1
    )
    # 좌회전이 없으면 비보호 좌회전 0회는 확인된 값이다
    assert m[FactorCode.UNPROTECTED_LEFT].availability is Availability.KNOWN
    assert m[FactorCode.UNPROTECTED_LEFT].value == 0
    # 일반 도로에는 합류·분기 지점이 없다고 본다
    assert m[FactorCode.MERGE_DIVERGE].availability is Availability.KNOWN


def test_zone_is_counted_once_per_entry():
    graph = _line_graph(
        {"protected_zone": True}, {"protected_zone": True}, {"protected_zone": False}, {"protected_zone": True}
    )
    route = _line_route(graph)
    # 보호구역 두 구간 연속 = 1곳, 빠져나왔다가 다시 들어가면 1곳 더
    assert route.factor_amounts[FactorCode.PROTECTED_ZONE] == 2
    assert route.measurements[FactorCode.PROTECTED_ZONE].value == 2
    assert [h.code for h in route.hotspots].count(FactorCode.PROTECTED_ZONE) == 2


def test_km_factors_are_lengths():
    graph = _line_graph(
        {"surface": "unpaved", "congested": True, "road_class": "HIGHWAY", "lanes": 2},
        {"surface": "asphalt", "congested": False, "road_class": "HIGHWAY", "lanes": 2},
    )
    route = _line_route(graph)
    first_km = graph.edges["E0"].length_m / 1000
    m = route.measurements
    assert m[FactorCode.UNPAVED_ROAD].value == round(first_km, 2)
    assert m[FactorCode.TRAFFIC_VOLUME].value == round(first_km, 2)
    assert m[FactorCode.ROAD_TYPE].value == round(route.distance_m / 1000, 2)
    assert m[FactorCode.LANE_COUNT].value == 2
    assert m[FactorCode.LANE_COUNT].unit is MeasureUnit.LANES


def test_unprotected_left_is_part_of_turn_count():
    # A →(동) C →(북, 좌회전) D. C 교차로 좌회전은 비보호
    graph = RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.0, "lng": 127.0},
            {"id": "C", "lat": 35.0, "lng": 127.0044},
            {"id": "D", "lat": 35.0036, "lng": 127.0044},
        ],
        "edges": [
            {"id": "AC", "from": "A", "to": "C", "oneway": True, "unprotected_left": True},
            {"id": "CD", "from": "C", "to": "D", "oneway": True},
        ],
    })
    [route] = DijkstraRouteFinder(graph).find_route(A, D, Profile())
    assert route.factor_amounts[FactorCode.TURN_COUNT] == 1
    assert route.factor_amounts[FactorCode.UNPROTECTED_LEFT] == 1
    assert route.measurements[FactorCode.UNPROTECTED_LEFT].availability is Availability.KNOWN
    assert FactorCode.UNPROTECTED_LEFT in {h.code for h in route.hotspots}


def test_left_turn_without_signal_data_is_unknown(square_graph: RoadGraph):
    # A→C→D 의 좌회전 지점(C)에 신호 자료가 없다
    profile = Profile(hard_factors=frozenset({FactorCode.NARROW_ROAD}))
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, profile)
    assert route.measurements[FactorCode.UNPROTECTED_LEFT].availability is Availability.UNKNOWN
    assert FactorCode.UNPROTECTED_LEFT in route.steps[1].unknown_factors


def test_highway_entry_and_exit_are_merge_diverge_not_turns():
    graph = RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.000, "lng": 127.000},
            {"id": "B", "lat": 35.002, "lng": 127.000},
            {"id": "C", "lat": 35.002, "lng": 127.004},
            {"id": "D", "lat": 35.004, "lng": 127.004},
        ],
        "edges": [
            {"id": "AB", "from": "A", "to": "B", "oneway": True, "road_class": "LOCAL", "name": "진입로"},
            {"id": "BC", "from": "B", "to": "C", "oneway": True, "road_class": "HIGHWAY", "name": "고속로"},
            {"id": "CD", "from": "C", "to": "D", "oneway": True, "road_class": "LOCAL", "name": "진출로"},
        ],
    })
    [route] = DijkstraRouteFinder(graph).find_route(
        Point(35.0, 127.0), Point(35.004, 127.004), Profile()
    )
    assert [s.maneuver for s in route.steps] == [
        Maneuver.DEPART, Maneuver.MERGE, Maneuver.DIVERGE, Maneuver.ARRIVE,
    ]
    assert route.factor_amounts[FactorCode.MERGE_DIVERGE] == 2
    assert route.factor_amounts.get(FactorCode.TURN_COUNT, 0) == 0
    assert [s.instruction for s in route.steps] == ["출발 · 진입로", "합류 · 고속로", "진출 · 진출로", "목적지 도착"]
    assert [s.road_class for s in route.steps[:3]] == [RoadClass.LOCAL, RoadClass.HIGHWAY, RoadClass.LOCAL]
    # 고속도로 구간에 merge_diverge 자료가 없으면 그 구간은 정보 없음
    assert route.measurements[FactorCode.MERGE_DIVERGE].availability is Availability.PARTIAL


def test_steps_carry_offsets_and_turn_factors(square_graph: RoadGraph):
    [route] = DijkstraRouteFinder(square_graph).find_route(A, D, Profile.fastest())
    assert [s.offset_m for s in route.steps] == [0, 400, 800]
    assert [s.instruction for s in route.steps] == ["출발", "우회전", "목적지 도착"]
    # 우회전 단계의 요소에는 그 회전 자체가 들어간다
    assert route.steps[1].factor_amounts[FactorCode.TURN_COUNT] == 1
    # 자료가 없는 구간의 점수 요소는 unknown_factors 로 알린다
    assert FactorCode.TRAFFIC_LIGHT in route.steps[1].unknown_factors
    assert FactorCode.TURN_COUNT not in route.steps[1].unknown_factors


def test_sample_graph_reports_demo_source():
    finder = DijkstraRouteFinder(build_sample_graph())
    [route] = finder.find_route(Point(35.1595, 126.8526), Point(35.1768, 126.9058), Profile())
    lane_change = route.measurements[FactorCode.LANE_CHANGE]
    assert lane_change.source.kind is DataSourceKind.DEMO_SAMPLE
    # 샘플 도로망은 필수 차로 변경 자료를 일부러 비워 둔다
    assert lane_change.availability is Availability.UNKNOWN
    assert route.measurements[FactorCode.TRAFFIC_LIGHT].availability is Availability.KNOWN
