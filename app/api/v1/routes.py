import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_route_service
from app.api.errors import ApiError
from app.api.schemas import (
    ErrorResponse,
    FactorCountOut,
    RerouteRequest,
    RouteHotspotOut,
    RouteOut,
    RouteSearchRequest,
    RouteSearchResponse,
    RouteStepOut,
)
from app.domain.factors import FACTORS
from app.domain.models import Point, Step
from app.routing import polyline
from app.services.route_service import RankedRoute, RouteService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routes", tags=["routes"])

ERROR_RESPONSES: dict[int | str, dict] = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


# 경로 계산은 CPU 작업이므로 동기 함수로 두어 스레드풀에서 실행되게 한다.
@router.post("/search", response_model=RouteSearchResponse, responses=ERROR_RESPONSES, summary="쉬운 경로 탐색")
def search_routes(
    body: RouteSearchRequest, service: Annotated[RouteService, Depends(get_route_service)]
) -> RouteSearchResponse:
    ranked = service.search(
        body.origin.to_point(), body.destination.to_point(), body.profile.to_domain(), body.max_routes
    )
    return RouteSearchResponse(routes=[_to_out(r) for r in ranked])


@router.post("/reroute", response_model=RouteSearchResponse, responses=ERROR_RESPONSES, summary="경로 이탈 시 재탐색")
def reroute(
    body: RerouteRequest, service: Annotated[RouteService, Depends(get_route_service)]
) -> RouteSearchResponse:
    if body.previous_route_id:
        logger.info("reroute from %s", body.previous_route_id)
    ranked = service.search(
        body.current.to_point(),
        body.destination.to_point(),
        body.profile.to_domain(),
        body.max_routes,
        start_heading_deg=body.heading_deg,
        avoid_path=_decode_avoid_path(body.previous_polyline),
    )
    return RouteSearchResponse(routes=[_to_out(r) for r in ranked])


def _decode_avoid_path(encoded: str | None) -> list[Point] | None:
    if not encoded:
        return None
    try:
        path = polyline.decode(encoded)
    except (IndexError, ValueError) as e:
        raise ApiError(422, "VALIDATION_ERROR", "previous_polyline 을 해석할 수 없습니다.") from e
    # 한 점만으로는 구간을 만들 수 없어 회피에 쓸 수 없다
    return path if len(path) >= 2 else None


def _to_out(ranked: RankedRoute) -> RouteOut:
    route = ranked.route
    return RouteOut(
        route_id=route.route_id,
        rank=ranked.rank,
        difficulty_score=route.difficulty_score,
        distance_m=round(route.distance_m),
        duration_s=round(route.duration_s),
        extra_duration_s=round(ranked.extra_duration_s),
        polyline=polyline.encode(route.path),
        # 모든 요소를 고정 순서로 내려 FE 가 "유턴 0회" 같은 표시를 할 수 있게 한다
        factors=[FactorCountOut(code=code, count=route.factor_counts.get(code, 0)) for code in FACTORS],
        hotspots=[
            RouteHotspotOut(code=h.code, lat=h.point.lat, lng=h.point.lng, note=h.note)
            for h in route.hotspots
        ],
        steps=[_step_out(s) for s in route.steps],
    )


def _step_out(step: Step) -> RouteStepOut:
    return RouteStepOut(
        index=step.index,
        maneuver=step.maneuver,
        lat=step.point.lat,
        lng=step.point.lng,
        road_name=step.road_name,
        distance_m=round(step.distance_m),
        duration_s=round(step.duration_s),
        turn_angle_deg=step.turn_angle_deg,
        # 경로 전체와 달리 단계는 마주치는 요소만 내린다 (응답 크기)
        factors=[FactorCountOut(code=code, count=n) for code, n in step.factor_counts.items()],
    )
