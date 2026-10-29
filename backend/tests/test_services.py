import asyncio

import httpx
import pytest

from app.domain.factors import FactorCode
from app.domain.models import Point, Profile
from app.services.cache import MemoryCache
from app.services.hotspots import BBox, PostgisHotspotRepository
from app.services.places import (
    KakaoPlaceSearch,
    Place,
    PlaceCategory,
    PlaceSearchService,
    PlaceSearchUnavailable,
    kakao_category,
)
from app.services.profile_analyzer import FactorStat, analyze


def test_analyze_moves_weight_toward_observed_difficulty():
    profile = Profile(hard_factors=frozenset({FactorCode.U_TURN}))
    result = analyze(profile, [FactorStat(FactorCode.U_TURN, encountered=4, deviations=4)])
    # 1.5 + 0.3 × (3.0 - 1.5)
    assert result.weights[FactorCode.U_TURN] == 1.95
    assert result.changes[0].before == 1.5
    assert result.changes[0].difficulty_rate == 1.0


def test_analyze_lowers_weight_for_easy_factor():
    result = analyze(Profile(), [FactorStat(FactorCode.TRAFFIC_LIGHT, encountered=20)])
    # 1.0 + 0.3 × (0.5 - 1.0)
    assert result.weights[FactorCode.TRAFFIC_LIGHT] == 0.85


def test_analyze_ignores_small_samples():
    result = analyze(Profile(), [FactorStat(FactorCode.U_TURN, encountered=2, deviations=2)])
    assert result.changes == []
    assert result.weights[FactorCode.U_TURN] == 1.0
    assert set(result.weights) == set(FactorCode)


class CountingProvider:
    def __init__(self):
        self.calls = 0

    async def search(self, query: str, near: Point | None, size: int) -> list[Place]:
        self.calls += 1
        return [Place("1", query, "광주 서구", None, PlaceCategory.LANDMARK, None, 35.15, 126.85, None)]


def test_place_search_is_cached():
    provider = CountingProvider()
    service = PlaceSearchService(provider, MemoryCache(), ttl_s=60)

    async def run():
        first = await service.search("광주시청", None, 10)
        second = await service.search(" 광주시청 ", None, 10)
        return first, second

    first, second = asyncio.run(run())
    assert first == second
    assert provider.calls == 1


def test_kakao_provider_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "KakaoAK test-key"
        assert request.url.params["sort"] == "distance"
        return httpx.Response(200, json={"documents": [{
            "id": "123", "place_name": "광주광역시청", "address_name": "광주 서구 치평동 1200",
            "road_address_name": "광주 서구 내방로 111", "category_name": "공공기관",
            "x": "126.851675", "y": "35.160032", "distance": "532",
        }]})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = KakaoPlaceSearch(client, "test-key", "https://dapi.kakao.com")
            return await provider.search("시청", Point(35.16, 126.85), 5)

    [place] = asyncio.run(run())
    assert place.name == "광주광역시청"
    assert place.lat == pytest.approx(35.160032)
    assert place.distance_m == 532
    assert place.category is PlaceCategory.LANDMARK
    assert place.category_name == "공공기관"


def test_kakao_provider_without_key_is_unavailable():
    async def run():
        async with httpx.AsyncClient() as client:
            await KakaoPlaceSearch(client, None, "https://dapi.kakao.com").search("x", None, 5)

    with pytest.raises(PlaceSearchUnavailable):
        asyncio.run(run())


@pytest.mark.parametrize(
    ("group_code", "category_name", "expected"),
    [
        ("SW8", "교통,수송 > 지하철,전철 > 광주도시철도1호선", PlaceCategory.STATION),
        ("", "교통,수송 > 기차,철도 > 기차역 > KTX정차역", PlaceCategory.STATION),
        ("SC4", "교육,학문 > 학교 > 대학교", PlaceCategory.UNIVERSITY),
        ("SC4", "교육,학문 > 학교 > 초등학교", PlaceCategory.SCHOOL),
        ("", "여행 > 공원 > 도시근린공원", PlaceCategory.PARK),
        ("", "가정,생활 > 시장 > 전통시장", PlaceCategory.MARKET),
        ("HP8", "의료,건강 > 종합병원", PlaceCategory.HOSPITAL),
        ("MT1", "가정,생활 > 슈퍼마켓 > 대형마트", PlaceCategory.MART),
        ("PK6", "교통,수송 > 주차장", PlaceCategory.PARKING),
        ("PO3", "사회,공공기관 > 행정기관", PlaceCategory.LANDMARK),
        (None, None, PlaceCategory.LANDMARK),
    ],
)
def test_kakao_category(group_code, category_name, expected):
    assert kakao_category(group_code, category_name) is expected


class FakePool:
    def __init__(self, rows):
        self.rows = rows

    async def fetch(self, *args):
        return self.rows


def test_postgis_hotspots_skip_rows_with_retired_codes():
    """요소 코드가 바뀌기 전에 적재한 행이 있어도 나머지 지점은 보여야 한다."""
    rows = [
        {"id": "1", "code": "PROTECTED_ZONE", "lat": 35.15, "lng": 126.85, "note": "보호구역"},
        {"id": "2", "code": "LANE_CHANGE_TRAFFIC", "lat": 35.16, "lng": 126.86, "note": None},
    ]
    repo = PostgisHotspotRepository(FakePool(rows))
    records = asyncio.run(repo.find_in_bbox(BBox(126.8, 35.1, 126.9, 35.2), None, 10))
    assert [r.code for r in records] == [FactorCode.PROTECTED_ZONE]
