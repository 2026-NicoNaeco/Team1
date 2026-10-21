"""프로필 기반 비용 모델.

탐색 비용 = 주행 시간(도로 선호 보정) + 난이도 점수 × POINT_SECONDS
난이도 점수 = Σ 요소 발생 수 × 요소 기본 점수 × 사용자 가중치
"""

from collections.abc import Mapping

from app.domain.factors import FACTORS, FactorCode
from app.domain.models import Profile, RoadPreference
from app.routing.geo import angle_between
from app.routing.graph import Edge, RoadClass

# 난이도 1점을 몇 초의 우회로 바꿀 의향이 있는지
POINT_SECONDS = 15.0

TURN_MIN_ANGLE = 30.0
SHARP_TURN_MIN_ANGLE = 100.0
U_TURN_MIN_ANGLE = 165.0

ROAD_PREFERENCE_FACTORS: dict[RoadPreference, dict[RoadClass, float]] = {
    RoadPreference.HIGHWAY: {RoadClass.HIGHWAY: 0.8, RoadClass.ARTERIAL: 0.9, RoadClass.LOCAL: 1.1},
    RoadPreference.LOCAL: {RoadClass.HIGHWAY: 1.5, RoadClass.ARTERIAL: 1.15, RoadClass.LOCAL: 1.0},
    RoadPreference.NONE: {RoadClass.HIGHWAY: 1.0, RoadClass.ARTERIAL: 1.0, RoadClass.LOCAL: 1.0},
}


def classify_turn(angle: float, *, reverse: bool = False) -> dict[FactorCode, int]:
    if reverse or angle >= U_TURN_MIN_ANGLE:
        return {FactorCode.U_TURN: 1, FactorCode.TURN_COUNT: 1}
    if angle >= SHARP_TURN_MIN_ANGLE:
        return {FactorCode.SHARP_TURN: 1, FactorCode.TURN_COUNT: 1}
    if angle >= TURN_MIN_ANGLE:
        return {FactorCode.TURN_COUNT: 1}
    return {}


def transition_factors(prev: Edge, nxt: Edge) -> dict[FactorCode, int]:
    # 회전교차로 내부 진행은 방향 전환으로 세지 않는다 (ROUNDABOUT 엣지 비용으로 반영)
    if prev.has(FactorCode.ROUNDABOUT) and nxt.has(FactorCode.ROUNDABOUT):
        return {}
    reverse = nxt.target == prev.source and nxt.source == prev.target
    return classify_turn(angle_between(prev.end_bearing, nxt.start_bearing), reverse=reverse)


def heading_factors(heading_deg: float, first: Edge) -> dict[FactorCode, int]:
    """재탐색 시 현재 진행 방향에서 첫 엣지로 진입하는 전환."""
    return classify_turn(angle_between(heading_deg, first.start_bearing))


class CostModel:
    def __init__(self, profile: Profile):
        self._weights = {code: profile.weight(code) for code in FactorCode}
        self._road_factors = ROAD_PREFERENCE_FACTORS[profile.road_preference]

    def points(self, counts: Mapping[FactorCode, int]) -> float:
        return sum(n * FACTORS[code].base_penalty * self._weights[code] for code, n in counts.items())

    def edge_cost(self, edge: Edge) -> float:
        time = edge.travel_time_s * self._road_factors[edge.road_class]
        return time + self.points(edge.factor_counts) * POINT_SECONDS

    def turn_cost(self, counts: Mapping[FactorCode, int]) -> float:
        return self.points(counts) * POINT_SECONDS
