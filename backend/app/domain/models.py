"""알고리즘 모듈과 BE 사이에서 주고받는 도메인 모델."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType

from app.domain.factors import FactorCode, MeasureUnit

HARD_FACTOR_DEFAULT_WEIGHT = 1.5
EASY_FACTOR_DEFAULT_WEIGHT = 0.5
NEUTRAL_WEIGHT = 1.0


@dataclass(frozen=True)
class Point:
    lat: float
    lng: float


class RoadPreference(StrEnum):
    HIGHWAY = "HIGHWAY"
    LOCAL = "LOCAL"
    NONE = "NONE"


class RoadClass(StrEnum):
    HIGHWAY = "HIGHWAY"
    RAMP = "RAMP"  # 고속도로 진입·진출로
    ARTERIAL = "ARTERIAL"
    COLLECTOR = "COLLECTOR"
    LOCAL = "LOCAL"


@dataclass(frozen=True)
class Profile:
    road_preference: RoadPreference = RoadPreference.NONE
    hard_factors: frozenset[FactorCode] = frozenset()
    easy_factors: frozenset[FactorCode] = frozenset()
    # 운전 기록 분석으로 얻은 가중치. 있으면 hard/easy 기본값보다 우선한다.
    weights: Mapping[FactorCode, float] = field(default_factory=lambda: MappingProxyType({}))

    def weight(self, code: FactorCode) -> float:
        if code in self.weights:
            return self.weights[code]
        if code in self.hard_factors:
            return HARD_FACTOR_DEFAULT_WEIGHT
        if code in self.easy_factors:
            return EASY_FACTOR_DEFAULT_WEIGHT
        return NEUTRAL_WEIGHT

    @classmethod
    def fastest(cls) -> "Profile":
        """난이도를 무시하고 소요 시간만 보는 프로필. extra_duration_s 기준 경로 계산용."""
        return cls(weights=MappingProxyType({code: 0.0 for code in FactorCode}))


# ---------- 측정값: "0회" 와 "정보 없음" 을 구분한다 ----------

class Availability(StrEnum):
    KNOWN = "known"  # 경로 전체를 확인했다. 0 이면 "확인한 결과 없음"
    PARTIAL = "partial"  # 일부 구간만 확인했다. 값은 확인된 구간 기준
    UNKNOWN = "unknown"  # 정보가 없다. 0 이나 "안전함" 으로 해석하면 안 된다


class DataSourceKind(StrEnum):
    DEMO_SAMPLE = "demo_sample"
    PUBLIC_DATA = "public_data"
    MAP_PROVIDER = "map_provider"
    USER_INPUT = "user_input"


class Verification(StrEnum):
    CONFIRMED = "confirmed"
    ESTIMATED = "estimated"
    UNVERIFIED = "unverified"


@dataclass(frozen=True)
class DataSource:
    kind: DataSourceKind
    name: str


@dataclass(frozen=True)
class Measurement:
    availability: Availability
    unit: MeasureUnit
    source: DataSource
    verification: Verification
    # unknown 이면 None
    value: float | None = None
    # partial 일 때만. 확인된 길이(회전 요소는 회전 수) 비율 0~1
    coverage: float | None = None


@dataclass(frozen=True)
class ServiceArea:
    """경로를 찾을 수 있는 지역. 이 밖의 좌표는 OUT_OF_SERVICE_AREA 다."""

    min_lat: float
    min_lng: float
    max_lat: float
    max_lng: float
    # 지도 첫 화면·기본 출발지로 쓸 수 있는 도로 위 지점 (영역 중앙에서 가장 가까운 노드)
    center: Point
    source: DataSource


@dataclass(frozen=True)
class Hotspot:
    code: FactorCode
    point: Point
    note: str


class Maneuver(StrEnum):
    DEPART = "DEPART"
    STRAIGHT = "STRAIGHT"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    SHARP_LEFT = "SHARP_LEFT"
    SHARP_RIGHT = "SHARP_RIGHT"
    U_TURN = "U_TURN"
    ROUNDABOUT = "ROUNDABOUT"
    MERGE = "MERGE"  # 고속도로 진입
    DIVERGE = "DIVERGE"  # 고속도로 진출
    ARRIVE = "ARRIVE"


@dataclass(frozen=True)
class Step:
    """턴바이턴 안내 한 단계. point 에서 maneuver 를 한 뒤 distance_m 만큼 진행한다."""

    index: int
    maneuver: Maneuver
    point: Point
    road_name: str | None
    distance_m: float
    duration_s: float
    # 회전 각도 (-180~180, 양수는 우회전). 직진·출발·도착은 0
    turn_angle_deg: float
    # 이 단계에서 마주치는 점수 요소 (횟수 또는 km). 0 인 요소는 없다
    factor_amounts: Mapping[FactorCode, float]
    # 경로 시작점부터 이 단계 지점까지의 거리
    offset_m: float = 0.0
    road_class: RoadClass | None = None
    # 화면에 그대로 보여 주는 안내 문구. 예: "우회전 · 상무대로"
    instruction: str = ""
    # 이 단계 구간에 자료가 전혀 없는 점수 요소
    unknown_factors: tuple[FactorCode, ...] = ()


@dataclass(frozen=True)
class Route:
    route_id: str
    path: tuple[Point, ...]
    distance_m: float
    duration_s: float
    # 프로필 기준 탐색 비용. 낮을수록 해당 사용자에게 쉬운 경로
    cost: float
    difficulty_score: float
    # 요소별 발생량 (횟수 또는 km). 자료가 없는 구간은 0 으로 더해진다
    factor_amounts: Mapping[FactorCode, float]
    hotspots: tuple[Hotspot, ...]
    # 턴바이턴 안내. 안내를 만들지 않는 RouteFinder 구현체는 비워 둘 수 있다
    steps: tuple[Step, ...] = ()
    # 요소별 측정값. 비워 두면 BE 가 factor_amounts 를 출처 미상의 확인값으로 내보낸다
    measurements: Mapping[FactorCode, Measurement] = field(default_factory=lambda: MappingProxyType({}))
