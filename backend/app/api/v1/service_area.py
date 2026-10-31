from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_service_area, get_settings
from app.api.schemas import DataSourceOut, LatLng, ServiceAreaOut
from app.config import Settings
from app.domain.models import ServiceArea

router = APIRouter(tags=["service-area"])


@router.get("/service-area", response_model=ServiceAreaOut, summary="경로를 찾을 수 있는 지역")
def service_area(
    area: Annotated[ServiceArea, Depends(get_service_area)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ServiceAreaOut:
    # 도로망 끝 노드에서 스냅 거리만큼은 더 받아 주지만, 영역은 보수적으로 노드 범위만 알린다
    return ServiceAreaOut(
        bbox=(area.min_lng, area.min_lat, area.max_lng, area.max_lat),
        center=LatLng(lat=area.center.lat, lng=area.center.lng),
        max_snap_distance_m=settings.max_snap_distance_m,
        source=DataSourceOut(kind=area.source.kind, name=area.source.name),
    )
