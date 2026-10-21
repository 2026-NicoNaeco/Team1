from dataclasses import dataclass

import httpx
from fastapi import Request

from app.config import Settings
from app.services.cache import Cache
from app.services.hotspots import HotspotRepository
from app.services.places import PlaceSearchService
from app.services.route_service import RouteService


@dataclass
class Container:
    settings: Settings
    route_service: RouteService
    place_service: PlaceSearchService
    hotspot_repository: HotspotRepository
    cache: Cache
    http_client: httpx.AsyncClient


def get_container(request: Request) -> Container:
    return request.app.state.container


def get_settings(request: Request) -> Settings:
    return get_container(request).settings


def get_route_service(request: Request) -> RouteService:
    return get_container(request).route_service


def get_place_service(request: Request) -> PlaceSearchService:
    return get_container(request).place_service


def get_hotspot_repository(request: Request) -> HotspotRepository:
    return get_container(request).hotspot_repository
