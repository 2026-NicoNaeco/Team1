"""
difficulty_weights.py
---------------------
"쉬운 길" 알고리즘의 핵심: 도로 난이도 요소별 가중치 정의 및
사용자 컨텍스트 기반 개인화 레이어.

난이도 점수 계산식:
    edge_cost = base_distance + SUM(factor_weight * factor_count * personal_multiplier)

단, factor가 없으면 base_distance 그대로 사용.
"""

from dataclasses import dataclass, field
from typing import Dict


# ─────────────────────────────────────────────
# 1. 기본 가중치 (DEFAULT BASE WEIGHTS)
#    - 전체 사용자에게 공통 적용되는 기준 수치
#    - 값이 클수록 해당 요소가 "어렵다"고 판단
# ─────────────────────────────────────────────

BASE_WEIGHTS: Dict[str, float] = {
    "traffic_light":        2.0,   # 신호등 1개당
    "protection_zone":      1.5,   # 행정보호구역(스쿨존 등) 통과 시
    "narrow_road":          1.3,   # 좁은 도로(2차로 미만) 구간
    "unpaved_road":         2.5,   # 비포장 도로 구간
    "direction_change":     1.0,   # 방향 전환(좌/우회전) 1회당
    "roundabout":           1.5,   # 회전교차로 1개당
    "u_turn":               2.0,   # 유턴 1회당
    "lane_change":          1.2,   # 차선 변경 1회당 (교통량 연동)
    "accident_zone":        2.0,   # 사고 다발 구역 통과 시
    "sharp_turn":           1.8,   # 급회전 구간 (곡률 임계값 초과)
    # 단속 카메라: 고려 대상 제외 (회의록 기준)
}


# ─────────────────────────────────────────────
# 2. 개인화 컨텍스트 (UserContext)
#    - 앱 초기 설정 시 사용자에게 직접 수집
#    - 로컬 저장소에 보관 (서버 전송 없음)
# ─────────────────────────────────────────────

@dataclass
class UserContext:
    """
    사용자 초기 컨텍스트.
    FE에서 온보딩 화면으로 수집 -> 로컬 JSON 저장 -> 이 객체로 로드.
    """

    # 고속도로 vs 일반도로 선호 (0.0 = 고속도로 완전 선호, 1.0 = 일반도로 완전 선호)
    highway_preference: float = 0.5

    # 사용자가 "어렵다"고 느끼는 요소 목록 -> 해당 요소 가중치 상향
    hard_factors: list = field(default_factory=list)
    # 예: ["u_turn", "roundabout", "lane_change"]

    # 사용자가 "쉽다"고 느끼는 요소 목록 -> 해당 요소 가중치 하향
    easy_factors: list = field(default_factory=list)
    # 예: ["traffic_light", "direction_change"]

    # 개인화 강도 승수 (어렵다고 지정한 요소에 곱해지는 추가 배율)
    personal_hard_multiplier: float = 2.0
    # 개인화 강도 승수 (쉽다고 지정한 요소에 곱해지는 감소 배율)
    personal_easy_multiplier: float = 0.5


# ─────────────────────────────────────────────
# 3. 개인화 가중치 레이어 계산
# ─────────────────────────────────────────────

def build_personalized_weights(context: UserContext) -> Dict[str, float]:
    """
    BASE_WEIGHTS에 사용자 컨텍스트를 반영한 개인화 가중치 딕셔너리를 반환.

    Args:
        context: 사용자 설정 컨텍스트

    Returns:
        factor명 -> 개인화된 가중치 수치 딕셔너리
    """
    weights = BASE_WEIGHTS.copy()

    for factor in context.hard_factors:
        if factor in weights:
            weights[factor] *= context.personal_hard_multiplier

    for factor in context.easy_factors:
        if factor in weights:
            weights[factor] *= context.personal_easy_multiplier

    return weights


# ─────────────────────────────────────────────
# 4. 간선(Edge) 난이도 점수 계산
# ─────────────────────────────────────────────

@dataclass
class EdgeFeatures:
    """
    도로 그래프의 간선 하나가 갖는 난이도 관련 속성.
    실제 지도 API / 도로 데이터에서 파싱해 채운다.
    """
    base_distance_km: float          # 구간 거리 (km)
    traffic_light_count: int = 0     # 신호등 수
    is_protection_zone: bool = False # 보호구역 여부
    is_narrow_road: bool = False     # 좁은 도로 여부
    is_unpaved: bool = False         # 비포장 여부
    direction_change_count: int = 0  # 방향 전환 횟수
    roundabout_count: int = 0        # 회전교차로 수
    u_turn_count: int = 0            # 유턴 횟수
    lane_change_count: int = 0       # 차선 변경 횟수
    is_accident_zone: bool = False   # 사고 다발 여부
    sharp_turn_count: int = 0        # 급회전 횟수
    is_highway: bool = False         # 고속도로 여부


def compute_edge_difficulty(
    features: EdgeFeatures,
    weights: Dict[str, float],
    context: UserContext,
) -> float:
    """
    간선의 난이도 점수(cost)를 계산한다.

    공식:
        difficulty_score = base_distance
                         + SUM(weight_i * count_i)
        고속도로 구간은 highway_preference에 따라 추가 패널티/보너스 적용.

    Args:
        features: 간선 속성
        weights:  개인화된 가중치 (build_personalized_weights 결과)
        context:  사용자 컨텍스트 (고속도로 선호도 참조)

    Returns:
        난이도 점수 (float). 낮을수록 "쉬운" 경로.
    """
    score = features.base_distance_km  # 기본 거리 비용

    # 각 요소별 난이도 누적
    score += weights["traffic_light"]    * features.traffic_light_count
    score += weights["protection_zone"]  * int(features.is_protection_zone)
    score += weights["narrow_road"]      * int(features.is_narrow_road)
    score += weights["unpaved_road"]     * int(features.is_unpaved)
    score += weights["direction_change"] * features.direction_change_count
    score += weights["roundabout"]       * features.roundabout_count
    score += weights["u_turn"]           * features.u_turn_count
    score += weights["lane_change"]      * features.lane_change_count
    score += weights["accident_zone"]    * int(features.is_accident_zone)
    score += weights["sharp_turn"]       * features.sharp_turn_count

    # 고속도로 선호도 반영
    # highway_preference = 0.0: 고속도로 매우 선호 -> 고속도로 비용 대폭 감소
    # highway_preference = 1.0: 일반도로 선호 -> 고속도로 비용 증가
    if features.is_highway:
        highway_penalty = (context.highway_preference - 0.5) * 4.0
        # -2.0 ~ +2.0 범위로 고속도로 구간 비용 조정
        score += highway_penalty * features.base_distance_km

    return max(score, 0.01)  # 음수 방지
