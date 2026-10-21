"""알고리즘 모듈과 BE 사이에서 주고받는 도메인 모델."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType

from app.domain.factors import FactorCode

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
    # 이 단계를 지나는 동안 마주치는 난이도 요소
    factor_counts: Mapping[FactorCode, int]


@dataclass(frozen=True)
class Route:
    route_id: str
    path: tuple[Point, ...]
    distance_m: float
    duration_s: float
    # 프로필 기준 탐색 비용. 낮을수록 해당 사용자에게 쉬운 경로
    cost: float
    difficulty_score: float
    factor_counts: Mapping[FactorCode, int]
    hotspots: tuple[Hotspot, ...]
    # 턴바이턴 안내. 안내를 만들지 않는 RouteFinder 구현체는 비워 둘 수 있다
    steps: tuple[Step, ...] = ()
