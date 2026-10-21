"""난이도 요소 코드. FE·알고리즘 파트와 공유하는 단일 기준이며 /v1/factors 로 노출된다.

코드·단위·의미는 FE(mobile/src/domain/factors.ts)와 같다. 중복 가산을 막는 규칙:
- TURN_COUNT 는 교차로 방향 전환의 "전체" 횟수다. UNPROTECTED_LEFT·U_TURN 은 그 부분집합이다.
- SHARP_TURN 은 교차로 회전이 아니라 "도로 자체가 급하게 꺾이는 구간"이다. 회전 횟수와 겹치지 않는다.
- MERGE_DIVERGE(합류·분기, 고속도로 진입·진출 포함)는 TURN_COUNT 에 넣지 않는다.
- LANE_CHANGE 는 합류·분기를 제외하고 다음 회전·진출을 위해 필요한 차로 변경만 센다.
- LANE_COUNT·ROAD_TYPE 은 점수에 쓰지 않는 참고 정보다. 도로 유형 선호는 road_preference 로 반영한다.
"""

from dataclasses import dataclass
from enum import StrEnum


class FactorCode(StrEnum):
    TURN_COUNT = "TURN_COUNT"
    UNPROTECTED_LEFT = "UNPROTECTED_LEFT"
    U_TURN = "U_TURN"
    SHARP_TURN = "SHARP_TURN"
    ROUNDABOUT = "ROUNDABOUT"
    LANE_CHANGE = "LANE_CHANGE"
    MERGE_DIVERGE = "MERGE_DIVERGE"
    LANE_COUNT = "LANE_COUNT"
    NARROW_ROAD = "NARROW_ROAD"
    UNPAVED_ROAD = "UNPAVED_ROAD"
    ROAD_TYPE = "ROAD_TYPE"
    TRAFFIC_LIGHT = "TRAFFIC_LIGHT"
    TRAFFIC_VOLUME = "TRAFFIC_VOLUME"
    PROTECTED_ZONE = "PROTECTED_ZONE"
    ACCIDENT_ZONE = "ACCIDENT_ZONE"


class FactorKind(StrEnum):
    EDGE = "EDGE"  # 도로 구간의 속성. 구간마다 더한다 (횟수 또는 km)
    ZONE = "ZONE"  # 연속한 구간을 하나로 보는 지역. 들어갈 때 한 번 센다
    TURN = "TURN"  # 구간 사이 전환(교차로 회전)에서 생긴다
    INFO = "INFO"  # 점수에 쓰지 않는 참고 정보


class MeasureUnit(StrEnum):
    COUNT = "count"
    KM = "km"
    LANES = "lanes"


@dataclass(frozen=True)
class FactorMeta:
    code: FactorCode
    name: str
    description: str
    kind: FactorKind
    unit: MeasureUnit
    # 1회(km 단위 요소는 1km)당 난이도 점수 (사용자 가중치 1.0 기준). 0 이면 점수에 쓰지 않는다
    base_penalty: float
    # 경로 응답/지도 오버레이에 지점으로 표시할지 여부
    hotspot: bool
    hotspot_note: str

    @property
    def scored(self) -> bool:
        return self.base_penalty > 0


FACTORS: dict[FactorCode, FactorMeta] = {
    meta.code: meta
    for meta in [
        FactorMeta(
            FactorCode.TURN_COUNT, "방향 전환", "교차로 좌·우회전 횟수 (비보호 좌회전·유턴 포함)",
            FactorKind.TURN, MeasureUnit.COUNT, 1.0, False, "방향 전환",
        ),
        FactorMeta(
            FactorCode.UNPROTECTED_LEFT, "비보호 좌회전", "좌회전 신호 없이 하는 좌회전",
            FactorKind.TURN, MeasureUnit.COUNT, 4.0, True, "비보호 좌회전",
        ),
        FactorMeta(
            FactorCode.U_TURN, "유턴", "반대 방향으로 돌아 나가는 전환",
            FactorKind.TURN, MeasureUnit.COUNT, 8.0, True, "유턴",
        ),
        FactorMeta(
            FactorCode.SHARP_TURN, "급회전", "도로 자체가 급하게 꺾이는 구간 (교차로 회전과 별개)",
            FactorKind.EDGE, MeasureUnit.COUNT, 3.0, True, "급커브 구간",
        ),
        FactorMeta(
            FactorCode.ROUNDABOUT, "회전교차로", "회전교차로 통과",
            FactorKind.ZONE, MeasureUnit.COUNT, 6.0, True, "회전교차로",
        ),
        FactorMeta(
            FactorCode.LANE_CHANGE, "필수 차로 변경", "다음 회전·진출을 위해 필요한 차로 변경 (합류·분기 제외)",
            FactorKind.EDGE, MeasureUnit.COUNT, 3.0, False, "차로 변경",
        ),
        FactorMeta(
            FactorCode.MERGE_DIVERGE, "합류·분기", "고속도로 진입·진출처럼 차로가 합쳐지거나 갈라지는 지점",
            FactorKind.EDGE, MeasureUnit.COUNT, 4.0, True, "합류·분기 지점",
        ),
        FactorMeta(
            FactorCode.LANE_COUNT, "차로 수", "주로 지나는 도로의 편도 차로 수 (참고 정보)",
            FactorKind.INFO, MeasureUnit.LANES, 0.0, False, "차로 수",
        ),
        FactorMeta(
            FactorCode.NARROW_ROAD, "좁은 도로", "1차로 이하 또는 폭이 좁은 도로의 길이",
            FactorKind.EDGE, MeasureUnit.KM, 10.0, True, "좁은 도로",
        ),
        FactorMeta(
            FactorCode.UNPAVED_ROAD, "비포장 도로", "포장되지 않은 도로의 길이",
            FactorKind.EDGE, MeasureUnit.KM, 12.0, True, "비포장 구간",
        ),
        FactorMeta(
            FactorCode.ROAD_TYPE, "도로 유형", "고속도로를 지나는 길이 (참고 정보)",
            FactorKind.EDGE, MeasureUnit.KM, 0.0, False, "고속도로",
        ),
        FactorMeta(
            FactorCode.TRAFFIC_LIGHT, "신호등", "경로상 신호등 개수",
            FactorKind.EDGE, MeasureUnit.COUNT, 1.0, False, "신호등",
        ),
        FactorMeta(
            FactorCode.TRAFFIC_VOLUME, "교통량", "평소 차가 많은 구간의 길이 (실시간 아님)",
            FactorKind.EDGE, MeasureUnit.KM, 4.0, False, "혼잡 구간",
        ),
        FactorMeta(
            FactorCode.PROTECTED_ZONE, "보호구역", "어린이·노인·장애인 보호구역 통과",
            FactorKind.ZONE, MeasureUnit.COUNT, 3.0, True, "보호구역",
        ),
        FactorMeta(
            FactorCode.ACCIDENT_ZONE, "사고다발구간", "도로교통공단 사고다발지역 통과",
            FactorKind.ZONE, MeasureUnit.COUNT, 5.0, True, "사고다발구간",
        ),
    ]
}

ZONE_CODES: tuple[FactorCode, ...] = tuple(c for c, m in FACTORS.items() if m.kind is FactorKind.ZONE)
SCORED_CODES: tuple[FactorCode, ...] = tuple(c for c, m in FACTORS.items() if m.scored)
