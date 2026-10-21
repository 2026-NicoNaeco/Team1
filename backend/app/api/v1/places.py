from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_place_service
from app.api.errors import ApiError
from app.api.schemas import ErrorResponse, PlaceOut, PlaceSearchResponse
from app.domain.models import Point
from app.services.places import PlaceSearchService

router = APIRouter(tags=["places"])


@router.get(
    "/places/search",
    response_model=PlaceSearchResponse,
    responses={503: {"model": ErrorResponse}},
    summary="장소 검색 (외부 API 프록시)",
)
async def search_places(
    service: Annotated[PlaceSearchService, Depends(get_place_service)],
    q: Annotated[str, Query(min_length=1, max_length=100, description="검색어")],
    lat: Annotated[float | None, Query(ge=-90, le=90, description="기준 위치 (가까운 순 정렬)")] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    size: Annotated[int, Query(ge=1, le=15)] = 10,
) -> PlaceSearchResponse:
    if (lat is None) != (lng is None):
        raise ApiError(422, "VALIDATION_ERROR", "lat 과 lng 는 함께 지정해야 합니다.")
    if not q.strip():
        raise ApiError(422, "VALIDATION_ERROR", "검색어가 비어 있습니다.")
    near = Point(lat, lng) if lat is not None and lng is not None else None
    places = await service.search(q, near, size)
    return PlaceSearchResponse(places=[PlaceOut(**asdict(p)) for p in places])
