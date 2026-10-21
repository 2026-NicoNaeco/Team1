"""지도 오버레이용 어려운 지점 조회.

DATABASE_URL 이 있으면 PostGIS 의 hotspots 테이블(db/init.sql)을 조회하고,
없으면 로드된 도로망 그래프의 구간 속성에서 지점을 만든다.
회전 비용 요소(유턴·급회전·방향 전환)는 경로에 따라 달라지므로 정적 지점에 포함되지 않는다.
"""

from collections.abc import Collection
from dataclasses import dataclass
from typing import Protocol

import asyncpg

from app.domain.factors import FACTORS, FactorCode, FactorKind
from app.routing.geo import midpoint
from app.routing.graph import RoadGraph


@dataclass(frozen=True)
class BBox:
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

    @classmethod
    def parse(cls, raw: str) -> "BBox":
        """'minLng,minLat,maxLng,maxLat' 형식."""
        parts = raw.split(",")
        if len(parts) != 4:
            raise ValueError("bbox 는 minLng,minLat,maxLng,maxLat 형식이어야 합니다.")
        try:
            min_lng, min_lat, max_lng, max_lat = (float(p) for p in parts)
        except ValueError as e:
            raise ValueError("bbox 값은 숫자여야 합니다.") from e
        if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
            raise ValueError("bbox 범위가 올바르지 않습니다.")
        return cls(min_lng, min_lat, max_lng, max_lat)

    def contains(self, lat: float, lng: float) -> bool:
        return self.min_lat <= lat <= self.max_lat and self.min_lng <= lng <= self.max_lng


@dataclass(frozen=True)
class HotspotRecord:
    id: str
    code: FactorCode
    lat: float
    lng: float
    note: str


class HotspotRepository(Protocol):
    async def find_in_bbox(
        self, bbox: BBox, codes: Collection[FactorCode] | None, limit: int
    ) -> list[HotspotRecord]: ...

    async def close(self) -> None: ...


class GraphHotspotRepository:
    def __init__(self, graph: RoadGraph):
        self._records = _records_from_graph(graph)

    async def find_in_bbox(
        self, bbox: BBox, codes: Collection[FactorCode] | None, limit: int
    ) -> list[HotspotRecord]:
        result = []
        for rec in self._records:
            if (codes is None or rec.code in codes) and bbox.contains(rec.lat, rec.lng):
                result.append(rec)
                if len(result) >= limit:
                    break
        return result

    async def close(self) -> None:
        pass


def _records_from_graph(graph: RoadGraph) -> list[HotspotRecord]:
    records = []
    seen: set[tuple[frozenset[str], FactorCode]] = set()
    for edge in graph.edges.values():
        for code in edge.factor_counts:
            meta = FACTORS[code]
            if meta.kind is not FactorKind.EDGE or not meta.hotspot:
                continue
            # 양방향 엣지는 한 번만
            key = (frozenset((edge.source, edge.target)), code)
            if key in seen:
                continue
            seen.add(key)
            at = midpoint(edge.geometry)
            records.append(HotspotRecord(f"{edge.id}:{code}", code, at.lat, at.lng, meta.hotspot_note))
    return records


class PostgisHotspotRepository:
    QUERY = """
        SELECT id::text, code, note, ST_Y(geom) AS lat, ST_X(geom) AS lng
        FROM hotspots
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND ($5::text[] IS NULL OR code = ANY($5::text[]))
        LIMIT $6
    """

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "PostgisHotspotRepository":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=5))

    async def find_in_bbox(
        self, bbox: BBox, codes: Collection[FactorCode] | None, limit: int
    ) -> list[HotspotRecord]:
        rows = await self._pool.fetch(
            self.QUERY,
            bbox.min_lng, bbox.min_lat, bbox.max_lng, bbox.max_lat,
            [str(c) for c in codes] if codes is not None else None,
            limit,
        )
        return [
            HotspotRecord(r["id"], FactorCode(r["code"]), r["lat"], r["lng"], r["note"] or "")
            for r in rows
        ]

    async def close(self) -> None:
        await self._pool.close()
