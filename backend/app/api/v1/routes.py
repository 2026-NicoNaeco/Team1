import logging
import string
from collections import defaultdict
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_route_service
from app.api.errors import ApiError
from app.api.schemas import (
    DataSourceOut,
    ErrorResponse,
    KnownMeasurementOut,
    MeasurementOut,
    PartialMeasurementOut,
    RerouteRequest,
    RouteHotspotOut,
    RouteOut,
    RouteSearchRequest,
    RouteSearchResponse,
    RouteStepOut,
    UnknownMeasurementOut,
    UnknownTollOut,
)
from app.domain.factors import FACTORS, FactorCode
from app.domain.models import (
    Availability,
    DataSource,
    DataSourceKind,
    Measurement,
    Point,
    Route,
    Step,
    Verification,
)
from app.routing import polyline
from app.routing.measure import round_amount
from app.services.route_service import RankedRoute, RouteService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routes", tags=["routes"])

# 구현체가 측정값을 주지 않았을 때의 출처
FALLBACK_SOURCE = DataSource(DataSourceKind.PUBLIC_DATA, "경로 탐색 결과")
VIA_ROAD_COUNT = 2
VIA_UNNAMED = "이름 없는 도로"

ERROR_RESPONSES: dict[int | str, dict] = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


# 경로 계산은 CPU 작업이므로 동기 함수로 두어 스레드풀에서 실행되게 한다.
@router.post("/search", response_model=RouteSearchResponse, responses=ERROR_RESPONSES, summary="쉬운 경로 탐색")
def search_routes(
    body: RouteSearchRequest, service: Annotated[RouteService, Depends(get_route_service)]
) -> RouteSearchResponse:
    ranked = service.search(
        body.origin.to_point(), body.destination.to_point(), body.profile.to_domain(), body.max_routes
    )
    return _response(ranked)


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
    return _response(ranked)


def _decode_avoid_path(encoded: str | None) -> list[Point] | None:
    if not encoded:
        return None
    try:
        path = polyline.decode(encoded)
    except (IndexError, ValueError) as e:
        raise ApiError(422, "VALIDATION_ERROR", "previous_polyline 을 해석할 수 없습니다.") from e
    # 한 점만으로는 구간을 만들 수 없어 회피에 쓸 수 없다
    return path if len(path) >= 2 else None


def _response(ranked: Sequence[RankedRoute]) -> RouteSearchResponse:
    # 목록은 사용자 선호 순위(rank) 순서, 식별 글자는 FE 처럼 소요 시간 순서 (A 가 가장 빠름)
    by_time = sorted(ranked, key=lambda r: (r.route.duration_s, r.route.distance_m))
    labels = {r.route.route_id: _label(i) for i, r in enumerate(by_time, start=1)}
    return RouteSearchResponse(routes=[_to_out(r, labels[r.route.route_id]) for r in ranked], excluded=[])


def _to_out(ranked: RankedRoute, label: str) -> RouteOut:
    route = ranked.route
    return RouteOut(
        route_id=route.route_id,
        label=label,
        rank=ranked.rank,
        via=_via(route.steps),
        difficulty_score=route.difficulty_score,
        distance_m=round(route.distance_m),
        duration_s=round(route.duration_s),
        extra_duration_s=round(ranked.extra_duration_s),
        # 통행료 자료가 아직 없다
        toll=UnknownTollOut(),
        polyline=polyline.encode(route.path),
        # 모든 요소를 고정 순서로 내려 FE 가 "유턴 0회" 와 "정보 없음" 을 구분해 표시하게 한다
        factors={code: _measurement_out(_measurement(route, code)) for code in FACTORS},
        hotspots=[
            RouteHotspotOut(code=h.code, lat=h.point.lat, lng=h.point.lng, note=h.note)
            for h in route.hotspots
        ],
        steps=[_step_out(s) for s in route.steps],
    )


def _label(order: int) -> str:
    letters = string.ascii_uppercase
    return letters[order - 1] if order <= len(letters) else str(order)


def _via(steps: Sequence[Step]) -> str:
    """가장 길게 지나는 도로 이름 몇 개를 지나는 순서대로."""
    length: dict[str, float] = defaultdict(float)
    for step in steps:
        if step.road_name:
            length[step.road_name] += step.distance_m
    top = set(sorted(length, key=lambda name: -length[name])[:VIA_ROAD_COUNT])
    # dict 는 처음 지나간 순서를 유지한다
    return " · ".join(name for name in length if name in top) or VIA_UNNAMED


def _measurement(route: Route, code: FactorCode) -> Measurement:
    if code in route.measurements:
        return route.measurements[code]
    # 측정값을 주지 않는 구현체: 합계를 그대로 확인값으로 본다
    return Measurement(
        Availability.KNOWN,
        FACTORS[code].unit,
        FALLBACK_SOURCE,
        Verification.UNVERIFIED,
        value=round_amount(code, route.factor_amounts.get(code, 0)),
    )


def _measurement_out(m: Measurement) -> MeasurementOut:
    source = DataSourceOut(kind=m.source.kind, name=m.source.name)
    if m.availability is Availability.UNKNOWN or m.value is None:
        return UnknownMeasurementOut(unit=m.unit, source=source)
    if m.availability is Availability.PARTIAL:
        return PartialMeasurementOut(
            value=m.value, unit=m.unit, coverage=m.coverage or 0.0, source=source, verification=m.verification
        )
    return KnownMeasurementOut(value=m.value, unit=m.unit, source=source, verification=m.verification)


def _step_out(step: Step) -> RouteStepOut:
    return RouteStepOut(
        index=step.index,
        maneuver=step.maneuver,
        instruction=step.instruction,
        lat=step.point.lat,
        lng=step.point.lng,
        road_name=step.road_name,
        road_class=step.road_class,
        offset_m=round(step.offset_m),
        distance_m=round(step.distance_m),
        duration_s=round(step.duration_s),
        turn_angle_deg=step.turn_angle_deg,
        # 경로 전체와 달리 단계는 마주치는 요소만 내린다 (응답 크기)
        factors={code: round_amount(code, n) for code, n in step.factor_amounts.items()},
        unknown_factors=list(step.unknown_factors),
    )
