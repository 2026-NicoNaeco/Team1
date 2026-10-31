import pytest

from app.domain.factors import FactorCode
from app.routing import polyline
from app.routing.dijkstra import DijkstraRouteFinder
from app.routing.graph import RoadGraph
from app.services.cache import MemoryCache
from app.services.places import PlaceSearchService
from app.services.route_service import RouteService
from tests.test_services import CountingProvider

ORIGIN = {"lat": 35.1595, "lng": 126.8526}
DESTINATION = {"lat": 35.1768, "lng": 126.9058}
PROFILE = {
    "road_preference": "LOCAL",
    "hard_factors": ["U_TURN", "NARROW_ROAD", "MERGE_DIVERGE"],
    "easy_factors": ["TRAFFIC_LIGHT"],
    "weights": {"U_TURN": 1.8, "NARROW_ROAD": 1.5},
}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_factors(client):
    factors = client.get("/v1/factors").json()["factors"]
    assert [f["code"] for f in factors] == [c.value for c in FactorCode]
    by_code = {f["code"]: f for f in factors}
    assert by_code["NARROW_ROAD"]["unit"] == "km"
    assert by_code["LANE_COUNT"] == {**by_code["LANE_COUNT"], "unit": "lanes", "scored": False}
    assert by_code["U_TURN"]["scored"] is True


def test_route_search_matches_frontend_shape(client):
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": DESTINATION, "max_routes": 3})
    body = resp.json()
    assert body["excluded"] == []
    routes = body["routes"]
    # 식별 글자는 FE 처럼 소요 시간 순서다 (A 가 가장 빠름). 목록 자체는 rank 순서
    by_time = sorted(routes, key=lambda r: (r["duration_s"], r["distance_m"]))
    assert [r["label"] for r in by_time] == ["A", "B", "C"][: len(routes)]
    for r in routes:
        assert r["via"]
        assert r["toll"] == {"availability": "unknown"}
        assert set(r["factors"]) == {c.value for c in FactorCode}
        for m in r["factors"].values():
            assert m["source"]["kind"] == "demo_sample"
            if m["availability"] == "unknown":
                # "정보 없음" 에는 값이 없다 — 0 으로 오해하지 않게
                assert "value" not in m
            else:
                assert "value" in m and "verification" in m
        assert r["factors"]["LANE_CHANGE"]["availability"] == "unknown"
        offsets = [s["offset_m"] for s in r["steps"]]
        assert offsets == sorted(offsets) and offsets[0] == 0
        for step in r["steps"]:
            assert step["instruction"]
            assert step["road_class"] in {"HIGHWAY", "RAMP", "ARTERIAL", "COLLECTOR", "LOCAL"}
            assert isinstance(step["factors"], dict)
            assert isinstance(step["unknown_factors"], list)


def test_route_search_accepts_every_frontend_factor_code(client):
    # FE 는 모든 요소의 가중치를 보낼 수 있다. 참고 정보(LANE_COUNT·ROAD_TYPE)도 거절하지 않는다
    weights = {c.value: 1.0 for c in FactorCode}
    resp = client.post(
        "/v1/routes/search",
        json={"origin": ORIGIN, "destination": DESTINATION, "profile": {"weights": weights}},
    )
    assert resp.status_code == 200


def test_route_search(client):
    resp = client.post(
        "/v1/routes/search",
        json={"origin": ORIGIN, "destination": DESTINATION, "profile": PROFILE, "max_routes": 3},
    )
    assert resp.status_code == 200
    routes = resp.json()["routes"]
    assert [r["rank"] for r in routes] == list(range(1, len(routes) + 1))
    for r in routes:
        assert r["route_id"].startswith("r_")
        assert r["extra_duration_s"] >= 0
        assert len(r["factors"]) == len(FactorCode)
        assert len(polyline.decode(r["polyline"])) >= 2
        assert r["steps"][0]["maneuver"] == "DEPART"
        assert r["steps"][-1]["maneuver"] == "ARRIVE"
        assert sum(s["distance_m"] for s in r["steps"]) == pytest.approx(r["distance_m"], abs=len(r["steps"]))


def test_route_steps_are_navigable(client):
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": DESTINATION, "max_routes": 1})
    [route] = resp.json()["routes"]
    steps = route["steps"]
    assert [s["index"] for s in steps] == list(range(len(steps)))
    # 도착 단계만 거리가 0 이고, 회전 단계는 좌/우 부호가 들어 있다
    assert steps[-1]["distance_m"] == 0
    assert all(s["distance_m"] > 0 for s in steps[:-1])
    # 고속도로 진입·진출(MERGE/DIVERGE)도 방향을 바꾸는 단계다
    turns = [
        s for s in steps
        if s["maneuver"] in {"LEFT", "RIGHT", "SHARP_LEFT", "SHARP_RIGHT", "U_TURN", "MERGE", "DIVERGE"}
    ]
    assert turns, "샘플 그래프 경로에는 회전이 최소 한 번 있어야 한다"
    assert all(s["turn_angle_deg"] != 0 for s in turns)
    assert all(abs(s["turn_angle_deg"]) <= 180 for s in steps)


def test_reroute_steps_open_with_turn_when_heading_given(client):
    resp = client.post(
        "/v1/routes/reroute",
        json={"current": {"lat": 35.166, "lng": 126.875}, "heading_deg": 180, "destination": DESTINATION},
    )
    [route] = resp.json()["routes"]
    # 진행 방향을 주면 첫 단계가 출발이 아니라 실제 회전 안내가 될 수 있다
    assert route["steps"][0]["maneuver"] in {
        "DEPART", "LEFT", "RIGHT", "SHARP_LEFT", "SHARP_RIGHT", "U_TURN",
    }


def test_route_search_defaults_profile(client):
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": DESTINATION})
    assert resp.status_code == 200
    assert len(resp.json()["routes"]) == 3


def test_route_search_rejects_conflicting_factors(client):
    profile = {"hard_factors": ["U_TURN"], "easy_factors": ["U_TURN"]}
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": DESTINATION, "profile": profile})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_route_search_rejects_unknown_factor(client):
    profile = {"weights": {"SPEED_CAMERA": 2.0}}
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": DESTINATION, "profile": profile})
    assert resp.status_code == 422


def test_route_search_out_of_service_area(client):
    seoul = {"lat": 37.5665, "lng": 126.9780}
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": seoul})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "OUT_OF_SERVICE_AREA"


def test_route_search_same_location(client):
    resp = client.post("/v1/routes/search", json={"origin": ORIGIN, "destination": ORIGIN})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "SAME_LOCATION"


def test_route_search_not_found_when_disconnected(client):
    """연결이 없는 도로망이면 404 ROUTE_NOT_FOUND."""
    islands = RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.000, "lng": 127.0},
            {"id": "B", "lat": 35.002, "lng": 127.0},
            {"id": "X", "lat": 35.004, "lng": 127.0},
            {"id": "Y", "lat": 35.006, "lng": 127.0},
        ],
        "edges": [
            {"id": "AB", "from": "A", "to": "B", "oneway": True, "length_m": 200, "speed_kph": 30},
            {"id": "XY", "from": "X", "to": "Y", "oneway": True, "length_m": 200, "speed_kph": 30},
        ],
    })
    client.app.state.container.route_service = RouteService(DijkstraRouteFinder(islands))

    resp = client.post(
        "/v1/routes/search",
        json={"origin": {"lat": 35.0, "lng": 127.0}, "destination": {"lat": 35.006, "lng": 127.0}},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "ROUTE_NOT_FOUND"


def test_reroute(client):
    resp = client.post(
        "/v1/routes/reroute",
        json={
            "current": {"lat": 35.166, "lng": 126.875},
            "heading_deg": 90,
            "destination": DESTINATION,
            "profile": PROFILE,
            "previous_route_id": "r_deadbeef",
        },
    )
    assert resp.status_code == 200
    assert len(resp.json()["routes"]) == 1


def test_reroute_avoids_previous_route(client):
    search = client.post(
        "/v1/routes/search",
        json={"origin": ORIGIN, "destination": DESTINATION, "profile": PROFILE, "max_routes": 1},
    )
    [previous] = search.json()["routes"]

    resp = client.post(
        "/v1/routes/reroute",
        json={
            "current": ORIGIN,
            "destination": DESTINATION,
            "profile": PROFILE,
            "previous_route_id": previous["route_id"],
            "previous_polyline": previous["polyline"],
        },
    )
    assert resp.status_code == 200
    [rerouted] = resp.json()["routes"]
    assert rerouted["route_id"] != previous["route_id"]
    # 회피는 금지가 아니므로 경로 자체는 계속 나와야 한다
    assert rerouted["distance_m"] > 0
    assert rerouted["steps"]


def test_reroute_without_polyline_keeps_previous_behaviour(client):
    resp = client.post(
        "/v1/routes/reroute",
        json={"current": ORIGIN, "destination": DESTINATION, "profile": PROFILE},
    )
    assert resp.status_code == 200
    assert len(resp.json()["routes"]) == 1


def test_reroute_rejects_malformed_polyline(client):
    resp = client.post(
        "/v1/routes/reroute",
        json={"current": ORIGIN, "destination": DESTINATION, "previous_polyline": "_"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_profile_analyze(client):
    resp = client.post(
        "/v1/profile/analyze",
        json={
            "profile": PROFILE,
            "summary": {
                "trip_count": 5,
                "factor_stats": [
                    {"code": "U_TURN", "encountered": 4, "deviations": 2, "hesitations": 1},
                    {"code": "SHARP_TURN", "encountered": 30},
                    # 이미 쉬운 요소(0.5)로 설정돼 있어 변화 없음
                    {"code": "TRAFFIC_LIGHT", "encountered": 30},
                ],
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["weights"]) == {c.value for c in FactorCode}
    assert {c["code"] for c in body["changes"]} == {"U_TURN", "SHARP_TURN"}
    assert body["weights"]["TRAFFIC_LIGHT"] == 0.5


def test_profile_analyze_rejects_inconsistent_counts(client):
    resp = client.post(
        "/v1/profile/analyze",
        json={"summary": {"factor_stats": [{"code": "U_TURN", "encountered": 1, "deviations": 3}]}},
    )
    assert resp.status_code == 422


def test_hotspots(client):
    resp = client.get("/v1/hotspots", params={"bbox": "126.84,35.14,126.92,35.19"})
    assert resp.status_code == 200
    hotspots = resp.json()["hotspots"]
    assert hotspots
    assert all(126.84 <= h["lng"] <= 126.92 and 35.14 <= h["lat"] <= 35.19 for h in hotspots)


def test_hotspots_code_filter(client):
    resp = client.get(
        "/v1/hotspots", params=[("bbox", "126.84,35.14,126.92,35.19"), ("codes", "PROTECTED_ZONE")]
    )
    codes = {h["code"] for h in resp.json()["hotspots"]}
    assert codes == {"PROTECTED_ZONE"}


def test_hotspots_invalid_bbox(client):
    assert client.get("/v1/hotspots", params={"bbox": "1,2,3"}).json()["error"]["code"] == "INVALID_BBOX"
    too_large = client.get("/v1/hotspots", params={"bbox": "126,35,128,36"})
    assert too_large.json()["error"]["code"] == "BBOX_TOO_LARGE"


def test_places_without_api_key(client):
    resp = client.get("/v1/places/search", params={"q": "광주시청"})
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "PLACE_SEARCH_UNAVAILABLE"


def test_places_search(client):
    client.app.state.container.place_service = PlaceSearchService(CountingProvider(), MemoryCache(), 60)
    resp = client.get("/v1/places/search", params={"q": "광주시청", "lat": 35.16, "lng": 126.85})
    assert resp.status_code == 200
    assert resp.json()["places"][0]["name"] == "광주시청"


def test_places_requires_both_coordinates(client):
    resp = client.get("/v1/places/search", params={"q": "광주시청", "lat": 35.16})
    assert resp.status_code == 422


def test_service_area(client):
    """FE 는 이 영역 안에서 기본 출발지·지도 첫 화면을 잡아야 OUT_OF_SERVICE_AREA 가 나지 않는다."""
    body = client.get("/v1/service-area").json()
    min_lng, min_lat, max_lng, max_lat = body["bbox"]
    assert min_lng < max_lng and min_lat < max_lat
    center = body["center"]
    assert min_lat <= center["lat"] <= max_lat and min_lng <= center["lng"] <= max_lng
    assert body["source"]["kind"] == "demo_sample"
    # 중심점은 도로 위 지점이라 그대로 출발지로 쓸 수 있다
    resp = client.post("/v1/routes/search", json={"origin": center, "destination": DESTINATION})
    assert resp.status_code == 200
