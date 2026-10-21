"""장소 검색 — 외부 API 프록시. API 키는 서버에만 두고 결과는 캐싱해 호출 쿼터를 아낀다."""

import hashlib
import logging
from dataclasses import asdict, dataclass
from typing import Protocol

import httpx

from app.domain.models import Point
from app.services.cache import Cache

logger = logging.getLogger(__name__)


class PlaceSearchUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    address: str
    road_address: str | None
    category: str | None
    lat: float
    lng: float
    distance_m: int | None


class PlaceSearchProvider(Protocol):
    async def search(self, query: str, near: Point | None, size: int) -> list[Place]: ...


class KakaoPlaceSearch:
    """카카오 로컬 키워드 검색 API."""

    def __init__(self, client: httpx.AsyncClient, api_key: str | None, base_url: str):
        self._client = client
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def search(self, query: str, near: Point | None, size: int) -> list[Place]:
        if not self._api_key:
            raise PlaceSearchUnavailable("장소 검색 API 키가 설정되지 않았습니다.")
        params: dict[str, str | int] = {"query": query, "size": size}
        if near is not None:
            params.update(x=near.lng, y=near.lat, sort="distance")
        try:
            resp = await self._client.get(
                f"{self._base_url}/v2/local/search/keyword.json",
                params=params,
                headers={"Authorization": f"KakaoAK {self._api_key}"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("kakao place search failed: %s", e)
            raise PlaceSearchUnavailable("장소 검색 서비스에 연결할 수 없습니다.") from e
        return [_parse_kakao(doc) for doc in resp.json().get("documents", [])]


def _parse_kakao(doc: dict) -> Place:
    distance = doc.get("distance")
    return Place(
        id=str(doc["id"]),
        name=doc["place_name"],
        address=doc.get("address_name", ""),
        road_address=doc.get("road_address_name") or None,
        category=doc.get("category_name") or None,
        lat=float(doc["y"]),
        lng=float(doc["x"]),
        distance_m=int(distance) if distance else None,
    )


class PlaceSearchService:
    def __init__(self, provider: PlaceSearchProvider, cache: Cache, ttl_s: int):
        self._provider = provider
        self._cache = cache
        self._ttl_s = ttl_s

    async def search(self, query: str, near: Point | None, size: int) -> list[Place]:
        query = query.strip()
        # 근처 검색은 약 100m 단위로 묶어 캐시 적중률을 높인다
        near_key = f"{near.lat:.3f},{near.lng:.3f}" if near else "-"
        digest = hashlib.sha1(f"{query}|{near_key}|{size}".encode()).hexdigest()
        key = f"places:v1:{digest}"

        cached = await self._cache.get(key)
        if cached is not None:
            return [Place(**p) for p in cached]
        places = await self._provider.search(query, near, size)
        await self._cache.set(key, [asdict(p) for p in places], self._ttl_s)
        return places
