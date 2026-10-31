"""JSON 값 캐시. Redis 가 없거나 장애일 때도 요청은 실패하지 않고 캐시만 건너뛴다."""

import json
import logging
import time
from collections import OrderedDict
from typing import Any, Protocol

import redis.asyncio as redis

logger = logging.getLogger(__name__)


class Cache(Protocol):
    async def get(self, key: str) -> Any | None: ...
    async def set(self, key: str, value: Any, ttl_s: int) -> None: ...
    async def close(self) -> None: ...


class MemoryCache:
    def __init__(self, max_items: int = 1024):
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_items = max_items

    async def get(self, key: str) -> Any | None:
        item = self._items.get(key)
        if item is None:
            return None
        expires_at, value = item
        if expires_at < time.monotonic():
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return value

    async def set(self, key: str, value: Any, ttl_s: int) -> None:
        self._items[key] = (time.monotonic() + ttl_s, value)
        self._items.move_to_end(key)
        while len(self._items) > self._max_items:
            self._items.popitem(last=False)

    async def close(self) -> None:
        self._items.clear()


class RedisCache:
    def __init__(self, url: str):
        self._client = redis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> Any | None:
        try:
            raw = await self._client.get(key)
        except redis.RedisError:
            logger.warning("redis get failed: %s", key, exc_info=True)
            return None
        return None if raw is None else json.loads(raw)

    async def set(self, key: str, value: Any, ttl_s: int) -> None:
        try:
            await self._client.set(key, json.dumps(value, ensure_ascii=False), ex=ttl_s)
        except redis.RedisError:
            logger.warning("redis set failed: %s", key, exc_info=True)

    async def close(self) -> None:
        await self._client.aclose()


def create_cache(redis_url: str | None) -> Cache:
    return RedisCache(redis_url) if redis_url else MemoryCache()
