from types import MappingProxyType
from typing import Annotated

from pydantic import BaseModel, Field, model_validator

from app.domain.factors import FactorCode, FactorKind
from app.domain.models import Maneuver, Point, Profile, RoadPreference

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


class FactorListResponse(BaseModel):
    factors: list[FactorOut]


# ---------- places ----------

class PlaceOut(BaseModel):
    id: str
    name: str
    address: str
    road_address: str | None
    category: str | None
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


class FactorCountOut(BaseModel):
    code: FactorCode
    count: int


class RouteHotspotOut(BaseModel):
    code: FactorCode
    lat: float
    lng: float
    note: str


class RouteStepOut(BaseModel):
    index: int
    maneuver: Maneuver
    lat: float
    lng: float
    road_name: str | None = Field(None, description="도로명. 이름 없는 이면도로는 null")
    distance_m: int = Field(description="이 단계를 진행하는 거리")
    duration_s: int
    turn_angle_deg: float = Field(description="회전 각도 (-180~180). 양수는 우회전, 직진·출발·도착은 0")
    factors: list[FactorCountOut] = Field(description="이 단계에서 마주치는 요소 (0 인 요소는 생략)")


class RouteOut(BaseModel):
    route_id: str
    rank: int
    difficulty_score: float
    distance_m: int
    duration_s: int
    extra_duration_s: int
    polyline: str
    factors: list[FactorCountOut]
    hotspots: list[RouteHotspotOut]
    steps: list[RouteStepOut]


class RouteSearchResponse(BaseModel):
    routes: list[RouteOut]


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
