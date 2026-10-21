"""장소 검색 — 외부 API 프록시. API 키는 서버에만 두고 결과는 캐싱해 호출 쿼터를 아낀다."""

import hashlib
import logging
from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Protocol

import httpx

from app.domain.models import Point
from app.services.cache import Cache

logger = logging.getLogger(__name__)


class PlaceSearchUnavailable(Exception):
    pass


class PlaceCategory(StrEnum):
    """FE(mobile/src/domain/types.ts PlaceCategory)와 같은 값. 맞는 분류가 없으면 LANDMARK."""

    STATION = "station"
    UNIVERSITY = "university"
    SCHOOL = "school"
    PARK = "park"
    MARKET = "market"
    HOSPITAL = "hospital"
    MART = "mart"
    LANDMARK = "landmark"
    PARKING = "parking"


# 카카오 category_group_code → 분류
_KAKAO_GROUPS: dict[str, PlaceCategory] = {
    "SW8": PlaceCategory.STATION,  # 지하철역
    "SC4": PlaceCategory.SCHOOL,  # 학교 (대학교는 category_name 으로 따로 가린다)
    "PS3": PlaceCategory.SCHOOL,  # 어린이집·유치원
    "AC5": PlaceCategory.SCHOOL,  # 학원
    "HP8": PlaceCategory.HOSPITAL,
    "PM9": PlaceCategory.HOSPITAL,  # 약국
    "MT1": PlaceCategory.MART,
    "CS2": PlaceCategory.MART,  # 편의점
    "PK6": PlaceCategory.PARKING,
}
# category_name 경로("교통,수송 > 기차,철도 > 기차역")에 이 단어가 있으면 그 분류로 본다. 위에서부터 우선
_KAKAO_NAME_KEYWORDS: tuple[tuple[str, PlaceCategory], ...] = (
    ("대학교", PlaceCategory.UNIVERSITY),
    ("공원", PlaceCategory.PARK),
    ("시장", PlaceCategory.MARKET),
    ("기차역", PlaceCategory.STATION),
    ("지하철역", PlaceCategory.STATION),
    ("터미널", PlaceCategory.STATION),
    ("주차장", PlaceCategory.PARKING),
)


def kakao_category(group_code: str | None, category_name: str | None) -> PlaceCategory:
    segments = [s.strip() for s in (category_name or "").split(">")]
    for keyword, category in _KAKAO_NAME_KEYWORDS:
        if any(keyword in s for s in segments):
            return category
    return _KAKAO_GROUPS.get(group_code or "", PlaceCategory.LANDMARK)


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    address: str
    road_address: str | None
    category: PlaceCategory
    # 카카오 원문 분류. 예: "교통,수송 > 지하철,전철 > 광주도시철도1호선"
    category_name: str | None
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
        category=kakao_category(doc.get("category_group_code"), doc.get("category_name")),
        category_name=doc.get("category_name") or None,
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
        # Place 형식이 바뀌면 버전을 올려 예전 캐시를 읽지 않게 한다
        key = f"places:v2:{digest}"

        cached = await self._cache.get(key)
        if cached is not None:
            return [Place(**{**p, "category": PlaceCategory(p["category"])}) for p in cached]
        places = await self._provider.search(query, near, size)
        await self._cache.set(key, [asdict(p) for p in places], self._ttl_s)
        return places
