from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "easy-route-api"
    cors_origins: list[str] = ["*"]

    # 도로망 그래프 JSON 경로. 비어 있으면 샘플 그래프 사용
    graph_path: str | None = None
    # 출발/도착 좌표를 그래프 노드에 붙일 때 허용하는 최대 거리
    max_snap_distance_m: float = 1000.0

    # 비어 있으면 인메모리 캐시 / 그래프 기반 핫스팟 저장소로 대체
    redis_url: str | None = None
    database_url: str | None = None

    kakao_rest_api_key: str | None = None
    kakao_base_url: str = "https://dapi.kakao.com"
    places_cache_ttl_s: int = 60 * 60 * 24
    places_timeout_s: float = 3.0

    hotspots_max_bbox_deg: float = 0.5
    hotspots_limit: int = 500


@lru_cache
def get_settings() -> Settings:
    return Settings()
