from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_hotspot_repository, get_settings
from app.api.errors import ApiError
from app.api.schemas import ErrorResponse, HotspotListResponse, HotspotOut
from app.config import Settings
from app.domain.factors import FactorCode
from app.services.hotspots import BBox, HotspotRepository

router = APIRouter(tags=["hotspots"])


@router.get(
    "/hotspots",
    response_model=HotspotListResponse,
    responses={422: {"model": ErrorResponse}},
    summary="화면 영역 내 어려운 지점",
)
async def list_hotspots(
    repository: Annotated[HotspotRepository, Depends(get_hotspot_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
    bbox: Annotated[str, Query(description="minLng,minLat,maxLng,maxLat", examples=["126.84,35.15,126.92,35.19"])],
    codes: Annotated[list[FactorCode] | None, Query(description="특정 요소만 조회 (반복 지정)")] = None,
) -> HotspotListResponse:
    try:
        box = BBox.parse(bbox)
    except ValueError as e:
        raise ApiError(422, "INVALID_BBOX", str(e)) from e
    max_deg = settings.hotspots_max_bbox_deg
    if box.max_lng - box.min_lng > max_deg or box.max_lat - box.min_lat > max_deg:
        raise ApiError(422, "BBOX_TOO_LARGE", f"조회 영역은 가로·세로 {max_deg}도 이내여야 합니다.")

    limit = settings.hotspots_limit
    records = await repository.find_in_bbox(box, codes, limit + 1)
    return HotspotListResponse(
        hotspots=[HotspotOut(**asdict(r)) for r in records[:limit]],
        truncated=len(records) > limit,
    )
