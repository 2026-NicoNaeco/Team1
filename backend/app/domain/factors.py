"""난이도 요소 코드. FE·알고리즘 파트와 공유하는 단일 기준이며 /v1/factors 로 노출된다."""

from dataclasses import dataclass
from enum import StrEnum


class FactorCode(StrEnum):
    TRAFFIC_LIGHT = "TRAFFIC_LIGHT"
    PROTECTED_ZONE = "PROTECTED_ZONE"
    NARROW_ROAD = "NARROW_ROAD"
    UNPAVED_ROAD = "UNPAVED_ROAD"
    TURN_COUNT = "TURN_COUNT"
    ROUNDABOUT = "ROUNDABOUT"
    U_TURN = "U_TURN"
    LANE_CHANGE_TRAFFIC = "LANE_CHANGE_TRAFFIC"
    ACCIDENT_ZONE = "ACCIDENT_ZONE"
    SHARP_TURN = "SHARP_TURN"


class FactorKind(StrEnum):
    EDGE = "EDGE"  # 도로 구간 자체의 속성
    TURN = "TURN"  # 구간 사이 전환에서 발생하는 회전 비용


@dataclass(frozen=True)
class FactorMeta:
    code: FactorCode
    name: str
    description: str
    kind: FactorKind
    # 1회 발생당 난이도 점수 (사용자 가중치 1.0 기준)
    base_penalty: float
    # 경로 응답/지도 오버레이에 지점으로 표시할지 여부
    hotspot: bool
    hotspot_note: str


FACTORS: dict[FactorCode, FactorMeta] = {
    meta.code: meta
    for meta in [
        FactorMeta(
            FactorCode.TRAFFIC_LIGHT, "신호등", "경로상 신호등 개수",
            FactorKind.EDGE, 1.0, False, "신호등",
        ),
        FactorMeta(
            FactorCode.PROTECTED_ZONE, "보호구역", "어린이·노인 보호구역 통과",
            FactorKind.EDGE, 3.0, True, "보호구역",
        ),
        FactorMeta(
            FactorCode.NARROW_ROAD, "좁은 도로", "1차로 이하 또는 폭이 좁은 도로",
            FactorKind.EDGE, 4.0, True, "좁은 도로",
        ),
        FactorMeta(
            FactorCode.UNPAVED_ROAD, "비포장 도로", "포장되지 않은 도로",
            FactorKind.EDGE, 5.0, True, "비포장 구간",
        ),
        FactorMeta(
            FactorCode.TURN_COUNT, "방향 전환", "좌·우회전 등 진행 방향 변경",
            FactorKind.TURN, 1.0, False, "방향 전환",
        ),
        FactorMeta(
            FactorCode.ROUNDABOUT, "회전교차로", "회전교차로 통과",
            FactorKind.EDGE, 6.0, True, "회전교차로",
        ),
        FactorMeta(
            FactorCode.U_TURN, "유턴", "같은 도로 반대 방향으로 전환",
            FactorKind.TURN, 8.0, True, "유턴",
        ),
        FactorMeta(
            FactorCode.LANE_CHANGE_TRAFFIC, "차선변경·교통량", "합류·분기 등 차선 변경이 필요한 지점",
            FactorKind.EDGE, 3.0, True, "합류·분기 구간",
        ),
        FactorMeta(
            FactorCode.ACCIDENT_ZONE, "사고다발지역", "도로교통공단 사고다발지역",
            FactorKind.EDGE, 5.0, True, "사고다발지역",
        ),
        FactorMeta(
            FactorCode.SHARP_TURN, "급회전", "진입 각도가 큰 회전",
            FactorKind.TURN, 4.0, True, "급회전 구간",
        ),
    ]
}
