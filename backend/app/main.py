import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import v1
from app.api.deps import Container
from app.api.errors import register_error_handlers
from app.config import Settings, get_settings
from app.routing.dijkstra import DijkstraRouteFinder
from app.routing.graph import RoadGraph
from app.routing.sample_graph import build_sample_graph
from app.services.cache import create_cache
from app.services.hotspots import GraphHotspotRepository, HotspotRepository, PostgisHotspotRepository
from app.services.places import KakaoPlaceSearch, PlaceSearchService
from app.services.route_service import RouteService

logger = logging.getLogger(__name__)


def load_graph(settings: Settings) -> RoadGraph:
    if settings.graph_path:
        logger.info("loading road graph from %s", settings.graph_path)
        return RoadGraph.from_json_file(settings.graph_path)
    logger.warning("GRAPH_PATH not set — using sample road graph")
    return build_sample_graph()


async def build_container(settings: Settings) -> Container:
    graph = load_graph(settings)
    # 알고리즘 파트 구현체가 준비되면 이 줄만 교체
    finder = DijkstraRouteFinder(graph, max_snap_distance_m=settings.max_snap_distance_m)

    cache = create_cache(settings.redis_url)
    http_client = httpx.AsyncClient(timeout=settings.places_timeout_s)
    places = PlaceSearchService(
        KakaoPlaceSearch(http_client, settings.kakao_rest_api_key, settings.kakao_base_url),
        cache,
        settings.places_cache_ttl_s,
    )

    hotspots: HotspotRepository
    if settings.database_url:
        hotspots = await PostgisHotspotRepository.connect(settings.database_url)
    else:
        hotspots = GraphHotspotRepository(graph)

    return Container(
        settings=settings,
        route_service=RouteService(finder),
        place_service=places,
        hotspot_repository=hotspots,
        cache=cache,
        http_client=http_client,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # 테스트에서 미리 주입한 컨테이너가 있으면 그대로 사용
        owned = not hasattr(app.state, "container")
        if owned:
            app.state.container = await build_container(settings)
        yield
        if owned:
            container: Container = app.state.container
            await container.http_client.aclose()
            await container.cache.close()
            await container.hotspot_repository.close()

    app = FastAPI(title="쉬운 길 지도 API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(v1.router)

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
