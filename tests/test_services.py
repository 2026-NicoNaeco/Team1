import asyncio

import httpx
import pytest

from app.domain.factors import FactorCode
from app.domain.models import Point, Profile
from app.services.cache import MemoryCache
from app.services.places import KakaoPlaceSearch, Place, PlaceSearchService, PlaceSearchUnavailable
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
        return [Place("1", query, "광주 서구", None, None, 35.15, 126.85, None)]


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


def test_kakao_provider_without_key_is_unavailable():
    async def run():
        async with httpx.AsyncClient() as client:
            await KakaoPlaceSearch(client, None, "https://dapi.kakao.com").search("x", None, 5)

    with pytest.raises(PlaceSearchUnavailable):
        asyncio.run(run())
