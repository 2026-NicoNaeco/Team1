from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.domain.factors import FactorCode, FactorKind, MeasureUnit
from app.domain.models import (
    DataSourceKind,
    Maneuver,
    Point,
    Profile,
    RoadClass,
    RoadPreference,
    Verification,
)
from app.services.places import PlaceCategory

Weight = Annotated[float, Field(ge=0.0, le=5.0)]


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    def to_point(self) -> Point:
        return Point(self.lat, self.lng)


class ProfileIn(BaseModel):
    road_preference: RoadPreference = RoadPreference.NONE
    hard_factors: list[FactorCode] = []
    easy_factors: list[FactorCode] = []
    weights: dict[FactorCode, Weight] = Field(
        default_factory=dict, description="운전 기록 분석 결과. 지정 시 hard/easy 기본값보다 우선"
    )

    @model_validator(mode="after")
    def _check_overlap(self) -> "ProfileIn":
        overlap = set(self.hard_factors) & set(self.easy_factors)
        if overlap:
            raise ValueError(f"hard_factors 와 easy_factors 에 동시에 포함된 요소: {sorted(overlap)}")
        return self

    def to_domain(self) -> Profile:
        return Profile(
            road_preference=self.road_preference,
            hard_factors=frozenset(self.hard_factors),
            easy_factors=frozenset(self.easy_factors),
            weights=MappingProxyType(dict(self.weights)),
        )


# ---------- factors ----------

class FactorOut(BaseModel):
    code: FactorCode
    name: str
    description: str
    kind: FactorKind
    unit: MeasureUnit
    scored: bool = Field(description="경로 점수에 쓰이는 요소인지. false 면 참고 정보")


class FactorListResponse(BaseModel):
    factors: list[FactorOut]


# ---------- places ----------

class PlaceOut(BaseModel):
    id: str
    name: str
    address: str
    road_address: str | None
    category: PlaceCategory = Field(description="FE PlaceCategory 와 같은 값. 맞는 분류가 없으면 landmark")
    category_name: str | None = Field(description="카카오 원문 분류")
    lat: float
    lng: float
    distance_m: int | None


class PlaceSearchResponse(BaseModel):
    places: list[PlaceOut]


# ---------- routes ----------

class RouteSearchRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    profile: ProfileIn = Field(default_factory=ProfileIn)
    max_routes: int = Field(3, ge=1, le=5)


class RerouteRequest(BaseModel):
    current: LatLng
    heading_deg: float | None = Field(
        None, ge=0, lt=360, description="현재 진행 방향 (북=0, 시계방향). 반대 방향 출발은 유턴으로 계산"
    )
    destination: LatLng
    profile: ProfileIn = Field(default_factory=ProfileIn)
    previous_route_id: str | None = Field(None, description="이탈한 기존 경로 id (로깅·추적용)")
    previous_polyline: str | None = Field(
        None,
        max_length=20_000,
        description=(
            "이탈한 기존 경로의 polyline. 주면 그 구간을 지나는 비용을 올려 다른 길을 우선 제시한다. "
            "금지가 아니므로 유일한 연결이면 같은 길이 다시 나올 수 있다."
        ),
    )
    max_routes: int = Field(1, ge=1, le=5)


class DataSourceOut(BaseModel):
    kind: DataSourceKind
    name: str


class KnownMeasurementOut(BaseModel):
    availability: Literal["known"] = "known"
    value: int | float = Field(description="경로 전체를 확인한 값. 0 이면 확인한 결과 없음")
    unit: MeasureUnit
    source: DataSourceOut
    verification: Verification


class PartialMeasurementOut(BaseModel):
    availability: Literal["partial"] = "partial"
    value: int | float = Field(description="확인된 구간 기준 값")
    unit: MeasureUnit
    coverage: float = Field(ge=0, le=1, description="확인된 길이 비율 (비보호 좌회전은 좌회전 수 비율)")
    source: DataSourceOut
    verification: Verification


class UnknownMeasurementOut(BaseModel):
    availability: Literal["unknown"] = "unknown"
    unit: MeasureUnit
    source: DataSourceOut


MeasurementOut = Annotated[
    KnownMeasurementOut | PartialMeasurementOut | UnknownMeasurementOut, Field(discriminator="availability")
]


class KnownTollOut(BaseModel):
    availability: Literal["known"] = "known"
    won: int


class UnknownTollOut(BaseModel):
    availability: Literal["unknown"] = "unknown"


TollOut = Annotated[KnownTollOut | UnknownTollOut, Field(discriminator="availability")]


class RouteHotspotOut(BaseModel):
    code: FactorCode
    lat: float
    lng: float
    note: str


class RouteStepOut(BaseModel):
    index: int
    maneuver: Maneuver
    instruction: str = Field(description="화면에 그대로 보여 주는 안내 문구. 예: '우회전 · 상무대로'")
    lat: float
    lng: float
    road_name: str | None = Field(None, description="도로명. 이름 없는 이면도로는 null")
    road_class: RoadClass | None
    offset_m: int = Field(description="경로 시작점부터 이 안내 지점까지의 거리")
    distance_m: int = Field(description="이 안내 지점에서 다음 안내 지점까지의 거리. ARRIVE 는 0")
    duration_s: int
    turn_angle_deg: float = Field(description="회전 각도 (-180~180). 양수는 우회전, 직진·출발·도착은 0")
    factors: dict[FactorCode, int | float] = Field(
        description="이 단계에서 마주치는 점수 요소. 횟수 요소는 횟수, km 요소는 km (0 인 요소는 생략)"
    )
    unknown_factors: list[FactorCode] = Field(description="이 단계 구간에 자료가 전혀 없는 점수 요소")


class RouteOut(BaseModel):
    route_id: str
    label: str = Field(description="경로 식별 글자 (A, B, C …). rank 순서")
    rank: int
    via: str = Field(description="경유 도로 요약. 예: '상무대로 · 무진대로'")
    difficulty_score: float
    distance_m: int
    duration_s: int
    extra_duration_s: int
    toll: TollOut
    polyline: str
    factors: dict[FactorCode, MeasurementOut] = Field(description="모든 요소의 측정값")
    hotspots: list[RouteHotspotOut]
    steps: list[RouteStepOut]


class ExcludedRouteOut(BaseModel):
    reason: Literal["restricted"]
    description: str


class RouteSearchResponse(BaseModel):
    routes: list[RouteOut]
    excluded: list[ExcludedRouteOut] = Field(
        default_factory=list, description="통행 제한 등으로 후보에서 뺀 경로 안내. 아직 판정하지 않아 항상 빈 배열"
    )


# ---------- profile ----------

class FactorStatIn(BaseModel):
    code: FactorCode
    encountered: int = Field(ge=0, description="주행 중 해당 요소를 마주친 횟수")
    deviations: int = Field(0, ge=0, description="해당 요소 지점에서 추천 경로를 이탈한 횟수")
    hesitations: int = Field(0, ge=0, description="급감속·장시간 정차 등 머뭇거린 횟수")

    @model_validator(mode="after")
    def _check_counts(self) -> "FactorStatIn":
        if self.deviations > self.encountered or self.hesitations > self.encountered:
            raise ValueError("deviations/hesitations 는 encountered 를 넘을 수 없습니다.")
        return self


class DrivingSummaryIn(BaseModel):
    trip_count: int = Field(0, ge=0)
    factor_stats: list[FactorStatIn] = Field(max_length=len(FactorCode))

    @model_validator(mode="after")
    def _check_unique(self) -> "DrivingSummaryIn":
        codes = [s.code for s in self.factor_stats]
        if len(codes) != len(set(codes)):
            raise ValueError("factor_stats 에 중복된 요소 코드가 있습니다.")
        return self


class ProfileAnalyzeRequest(BaseModel):
    profile: ProfileIn = Field(default_factory=ProfileIn)
    summary: DrivingSummaryIn


class WeightChangeOut(BaseModel):
    code: FactorCode
    before: float
    after: float
    difficulty_rate: float


class ProfileAnalyzeResponse(BaseModel):
    weights: dict[FactorCode, float]
    changes: list[WeightChangeOut]


# ---------- hotspots ----------

class HotspotOut(BaseModel):
    id: str
    code: FactorCode
    lat: float
    lng: float
    note: str


class HotspotListResponse(BaseModel):
    hotspots: list[HotspotOut]
    truncated: bool
