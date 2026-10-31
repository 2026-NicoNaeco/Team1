"""프로필 기반 비용 모델.

탐색 비용 = 주행 시간(도로 선호 보정) + 회전 시간 + 난이도 점수 × POINT_SECONDS
난이도 점수 = Σ 요소 발생량(횟수 또는 km) × 요소 기본 점수 × 사용자 가중치

구간 사이 전환에서 생기는 요소(회전·지역 진입·고속도로 진입/진출)는 transition() 이 한곳에서
판정한다. 탐색 비용, 경로 합계, 안내 단계가 모두 이 함수를 써서 서로 어긋나지 않는다.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from app.domain.factors import FACTORS, ZONE_CODES, FactorCode
from app.domain.models import Maneuver, Profile, RoadClass, RoadPreference
from app.routing.geo import angle_between, signed_turn_deg
from app.routing.graph import Edge

# 난이도 1점을 몇 초의 우회로 바꿀 의향이 있는지
POINT_SECONDS = 15.0

TURN_MIN_ANGLE = 30.0
SHARP_TURN_MIN_ANGLE = 100.0  # 안내 문구(급좌·우회전) 기준. 점수 요소 SHARP_TURN(급커브)과는 무관
U_TURN_MIN_ANGLE = 165.0

# 회전할 때 감속·대기로 더 걸리는 시간 (교통 자료가 없어 일반적인 값을 쓴다)
RIGHT_TURN_DELAY_S = 5.0
LEFT_TURN_DELAY_S = 10.0
U_TURN_DELAY_S = 20.0

ROAD_PREFERENCE_FACTORS: dict[RoadPreference, dict[RoadClass, float]] = {
    RoadPreference.HIGHWAY: {
        RoadClass.HIGHWAY: 0.8, RoadClass.RAMP: 0.85, RoadClass.ARTERIAL: 0.9,
        RoadClass.COLLECTOR: 1.0, RoadClass.LOCAL: 1.1,
    },
    RoadPreference.LOCAL: {
        RoadClass.HIGHWAY: 1.5, RoadClass.RAMP: 1.4, RoadClass.ARTERIAL: 1.15,
        RoadClass.COLLECTOR: 1.05, RoadClass.LOCAL: 1.0,
    },
    RoadPreference.NONE: dict.fromkeys(RoadClass, 1.0),
}


@dataclass(frozen=True)
class Transition:
    factors: dict[FactorCode, float]
    # 비보호 여부를 따져야 하는 교차로 좌회전이었는지 (측정값의 정보 유무 판단용)
    left_turn: bool = False

    @property
    def delay_s(self) -> float:
        return turn_delay_s(self.factors, left=self.left_turn)


def turn_delay_s(factors: Mapping[FactorCode, float], *, left: bool = False) -> float:
    """회전에 드는 시간. 소요 시간·탐색 비용·안내 단계가 모두 이 값을 쓴다."""
    if factors.get(FactorCode.U_TURN):
        return U_TURN_DELAY_S
    if factors.get(FactorCode.TURN_COUNT):
        return LEFT_TURN_DELAY_S if left else RIGHT_TURN_DELAY_S
    return 0.0


def classify_turn(
    angle: float, *, reverse: bool = False, left: bool = False, unprotected: bool = False
) -> dict[FactorCode, float]:
    """교차로 회전. U_TURN·UNPROTECTED_LEFT 는 TURN_COUNT 의 부분집합이라 함께 센다."""
    if reverse or angle >= U_TURN_MIN_ANGLE:
        return {FactorCode.U_TURN: 1, FactorCode.TURN_COUNT: 1}
    if angle >= TURN_MIN_ANGLE:
        if left and unprotected:
            return {FactorCode.UNPROTECTED_LEFT: 1, FactorCode.TURN_COUNT: 1}
        return {FactorCode.TURN_COUNT: 1}
    return {}


def road_transition(prev: Edge, nxt: Edge) -> Maneuver | None:
    """고속도로 진입·진출. 방향 전환이 아니라 합류·분기로 센다."""
    if nxt.road_class is RoadClass.HIGHWAY and prev.road_class is not RoadClass.HIGHWAY:
        return Maneuver.MERGE
    if prev.road_class is RoadClass.HIGHWAY and nxt.road_class is not RoadClass.HIGHWAY:
        return Maneuver.DIVERGE
    return None


def is_reverse(prev: Edge, nxt: Edge) -> bool:
    return nxt.target == prev.source and nxt.source == prev.target


def transition(prev: Edge | None, nxt: Edge) -> Transition:
    """prev 에서 nxt 로 넘어갈 때 생기는 요소. prev 가 None 이면 경로 시작."""
    # 지역은 들어갈 때 한 번만 센다 (보호구역 안의 구간이 여러 개여도 "1곳")
    factors: dict[FactorCode, float] = {
        code: 1 for code in ZONE_CODES if nxt.has(code) and not (prev is not None and prev.has(code))
    }
    if prev is None:
        return Transition(factors)
    # 회전교차로 내부 진행은 방향 전환으로 세지 않는다
    if prev.has(FactorCode.ROUNDABOUT) and nxt.has(FactorCode.ROUNDABOUT):
        return Transition(factors)
    reverse = is_reverse(prev, nxt)
    if not reverse and road_transition(prev, nxt) is not None:
        factors[FactorCode.MERGE_DIVERGE] = 1
        return Transition(factors)

    signed = signed_turn_deg(prev.end_bearing, nxt.start_bearing)
    left = not reverse and signed < 0 and TURN_MIN_ANGLE <= -signed < U_TURN_MIN_ANGLE
    factors.update(
        classify_turn(abs(signed), reverse=reverse, left=left, unprotected=bool(prev.unprotected_left))
    )
    return Transition(factors, left_turn=left)


def transition_factors(prev: Edge | None, nxt: Edge) -> dict[FactorCode, float]:
    return transition(prev, nxt).factors


def heading_factors(heading_deg: float, first: Edge) -> dict[FactorCode, float]:
    """재탐색 시 현재 진행 방향에서 첫 엣지로 진입하는 전환."""
    return classify_turn(angle_between(heading_deg, first.start_bearing))


def edge_amounts(edge: Edge) -> dict[FactorCode, float]:
    """구간 자체에서 더하는 요소. 지역(ZONE) 요소는 transition() 에서 진입할 때 센다."""
    return {code: n for code, n in edge.factor_amounts.items() if code not in ZONE_CODES}


class CostModel:
    def __init__(self, profile: Profile):
        self._weights = {code: profile.weight(code) for code in FactorCode}
        self._road_factors = ROAD_PREFERENCE_FACTORS[profile.road_preference]
        # 주행 시간에 곱하는 가장 작은 배율. 탐색이 남은 비용의 하한을 잡을 때 쓴다
        self.min_road_factor = min(self._road_factors.values())
        # 탐색 중 같은 구간·같은 전환 요소 조합을 여러 번 매기므로 계산한 값을 둔다
        self._edge_costs: dict[str, float] = {}
        self._move_costs: dict[tuple[tuple[tuple[FactorCode, float], ...], bool], float] = {}

    def points(self, amounts: Mapping[FactorCode, float]) -> float:
        return sum(n * FACTORS[code].base_penalty * self._weights[code] for code, n in amounts.items())

    def edge_cost(self, edge: Edge) -> float:
        cost = self._edge_costs.get(edge.id)
        if cost is None:
            time = edge.travel_time_s * self._road_factors[edge.road_class]
            cost = self._edge_costs[edge.id] = time + self.points(edge_amounts(edge)) * POINT_SECONDS
        return cost

    def move_cost(self, factors: tuple[tuple[FactorCode, float], ...], left: bool) -> float:
        """transition() 결과(요소 항목·좌회전 여부)의 비용. 조합이 몇 가지뿐이라 한 번씩만 계산한다."""
        cost = self._move_costs.get((factors, left))
        if cost is None:
            cost = self._move_costs[(factors, left)] = self.turn_cost(dict(factors), left=left)
        return cost

    def turn_cost(self, amounts: Mapping[FactorCode, float], *, left: bool = False) -> float:
        """구간 전환의 비용: 회전 시간 + 난이도 점수."""
        return turn_delay_s(amounts, left=left) + self.points(amounts) * POINT_SECONDS
