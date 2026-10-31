import pytest

from app.domain.factors import FactorCode
from app.domain.models import Point, Profile
from app.routing.dijkstra import DijkstraRouteFinder
from app.routing.errors import NoRouteFound
from app.routing.geo import haversine_m
from app.routing.graph import RoadGraph
from app.routing.snap import arrival_pieces, base_edge_id, departure_pieces, snap

# 동서로 곧은 도로 A ─ B ─ C. 경도 0.004 ≈ 364m (위도 35도)
A, B, C = Point(35.0, 127.000), Point(35.0, 127.004), Point(35.0, 127.008)
AB_M = haversine_m(A, B)


def _line(oneway: bool = False, **attrs) -> RoadGraph:
    return RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": A.lat, "lng": A.lng},
            {"id": "B", "lat": B.lat, "lng": B.lng},
            {"id": "C", "lat": C.lat, "lng": C.lng},
        ],
        "edges": [
            {"id": "AB", "from": "A", "to": "B", "name": "곧은길", "oneway": oneway, **attrs},
            {"id": "BC", "from": "B", "to": "C", "name": "곧은길", "oneway": oneway},
        ],
    })


def _beside(lng: float, north_m: float = 8.0) -> Point:
    """곧은길에서 북쪽으로 north_m 떨어진 지점 (건물 안에서 출발하는 경우)."""
    return Point(35.0 + north_m / 110_574, lng)


def test_snaps_to_point_on_road_not_nearest_junction():
    anchor = snap(_line(), _beside(127.001), max_distance_m=1000)
    assert anchor.node is None
    assert anchor.point.lat == pytest.approx(35.0)
    assert anchor.point.lng == pytest.approx(127.001)
    # 양방향 도로라 두 방향 엣지가 모두 후보다
    assert {h.edge.id for h in anchor.hits} == {"AB", "AB_r"}


def test_snaps_to_junction_when_close():
    anchor = snap(_line(), _beside(127.004, north_m=3), max_distance_m=1000)
    assert anchor.node == "B"


def test_route_starts_and_ends_at_points_on_road():
    graph = _line()
    origin, destination = _beside(127.001), _beside(127.007)
    [route] = DijkstraRouteFinder(graph).find_route(origin, destination, Profile())
    assert route.path[0].lng == pytest.approx(127.001)
    assert route.path[-1].lng == pytest.approx(127.007)
    # 교차로 B 를 지나 C 쪽 지점까지: 0.006 도
    assert route.distance_m == pytest.approx(AB_M * 1.5, rel=1e-3)
    assert route.steps[0].point.lng == pytest.approx(127.001)


def test_same_edge_destination_ahead_uses_only_the_gap():
    [route] = DijkstraRouteFinder(_line()).find_route(_beside(127.001), _beside(127.003), Profile())
    assert route.distance_m == pytest.approx(AB_M / 2, rel=1e-3)


def test_two_way_road_can_start_in_either_direction():
    """도착지가 뒤쪽이어도 양방향 도로면 반대 방향으로 바로 간다."""
    [route] = DijkstraRouteFinder(_line()).find_route(_beside(127.003), _beside(127.001), Profile())
    assert route.distance_m == pytest.approx(AB_M / 2, rel=1e-3)
    assert route.factor_amounts.get(FactorCode.U_TURN, 0) == 0


def test_one_way_road_cannot_go_backward():
    with pytest.raises(NoRouteFound):
        DijkstraRouteFinder(_line(oneway=True)).find_route(_beside(127.003), _beside(127.001), Profile())


def test_heading_away_from_destination_counts_u_turn():
    """재탐색: 동쪽을 보고 달리는 중인데 도착지가 서쪽이면 유턴이다."""
    [route] = DijkstraRouteFinder(_line()).find_route(
        _beside(127.003), _beside(127.001), Profile(), start_heading_deg=90
    )
    assert route.factor_amounts.get(FactorCode.U_TURN) == 1


def test_pieces_split_lengths_and_keep_counts_on_departure_side():
    graph = _line(oneway=True, traffic_lights=1, lanes=1)
    anchor = snap(graph, _beside(127.001), max_distance_m=1000)
    [departure] = departure_pieces(anchor)
    [arrival] = arrival_pieces(anchor)
    assert base_edge_id(departure.id) == base_edge_id(arrival.id) == "AB"
    assert departure.length_m == pytest.approx(AB_M * 0.75, rel=1e-3)
    assert arrival.length_m == pytest.approx(AB_M * 0.25, rel=1e-3)
    # km 요소는 길이 비율로 나눈다
    assert departure.factor_amounts[FactorCode.NARROW_ROAD] == pytest.approx(AB_M * 0.75 / 1000, rel=1e-3)
    # 신호는 끝 노드 쪽이라 출발 조각(→ B)에만 남는다
    assert departure.factor_amounts[FactorCode.TRAFFIC_LIGHT] == 1
    assert FactorCode.TRAFFIC_LIGHT not in arrival.factor_amounts
    assert departure.known == arrival.known == graph.edges["AB"].known


def test_far_point_has_no_anchor():
    assert snap(_line(), Point(0.01, 0.01), max_distance_m=1000) is None


def test_edge_grid_matches_brute_force():
    """선분 격자는 모든 선분을 다 보는 것과 같은 최근접 거리를 줘야 한다."""
    import math
    import random

    from app.routing.graph import METERS_PER_DEG_LNG_EQUATOR, _project
    from app.routing.sample_graph import build_sample_graph

    graph = build_sample_graph()
    area = graph.service_area()
    rng = random.Random(5)
    for _ in range(200):
        query = Point(
            rng.uniform(area.min_lat - 0.005, area.max_lat + 0.005),
            rng.uniform(area.min_lng - 0.005, area.max_lng + 0.005),
        )
        kx = METERS_PER_DEG_LNG_EQUATOR * math.cos(math.radians(query.lat))
        brute = min(
            _project(query, edge, i, kx).distance_m
            for edge in graph.edges.values()
            for i in range(len(edge.geometry) - 1)
        )
        hits = graph.nearest_edges_within(query, 1000)
        if brute <= 1000:
            assert hits[0].distance_m == pytest.approx(brute, abs=1e-6)
        else:
            assert hits == []
