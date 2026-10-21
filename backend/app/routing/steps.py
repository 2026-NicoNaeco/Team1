"""엣지 경로 → 턴바이턴 안내 단계.

회전이 없고 도로명이 같은 연속 구간은 한 단계로 합친다. 격자형 도로망에서
엣지마다 단계를 만들면 "직진 80m" 가 수십 개 생기기 때문이다.

회전 임계값과 요소 판정은 cost.py 와 공유해서 안내와 난이도 계산이 어긋나지 않게 한다.
단계의 요소에는 그 단계를 시작하는 회전도 들어간다 (우회전 단계 → TURN_COUNT 1).
"""

from collections import Counter
from collections.abc import Sequence

from app.domain.factors import SCORED_CODES, FactorCode
from app.domain.models import Maneuver, Step
from app.routing.cost import (
    SHARP_TURN_MIN_ANGLE,
    TURN_MIN_ANGLE,
    U_TURN_MIN_ANGLE,
    edge_amounts,
    heading_factors,
    is_reverse,
    road_transition,
    transition,
)
from app.routing.geo import signed_turn_deg
from app.routing.graph import Edge
from app.routing.measure import ALWAYS_KNOWN, round_amount

MANEUVER_LABEL: dict[Maneuver, str] = {
    Maneuver.DEPART: "출발",
    Maneuver.STRAIGHT: "직진",
    Maneuver.LEFT: "좌회전",
    Maneuver.RIGHT: "우회전",
    Maneuver.SHARP_LEFT: "급좌회전",
    Maneuver.SHARP_RIGHT: "급우회전",
    Maneuver.U_TURN: "유턴",
    Maneuver.ROUNDABOUT: "회전교차로 진입",
    Maneuver.MERGE: "합류",
    Maneuver.DIVERGE: "진출",
    Maneuver.ARRIVE: "목적지 도착",
}


def classify_maneuver(signed_angle: float, *, reverse: bool = False) -> Maneuver:
    """cost.classify_turn 과 같은 임계값을 쓰되 좌·우까지 구분한다."""
    magnitude = abs(signed_angle)
    if reverse or magnitude >= U_TURN_MIN_ANGLE:
        return Maneuver.U_TURN
    if magnitude >= SHARP_TURN_MIN_ANGLE:
        return Maneuver.SHARP_RIGHT if signed_angle > 0 else Maneuver.SHARP_LEFT
    if magnitude >= TURN_MIN_ANGLE:
        return Maneuver.RIGHT if signed_angle > 0 else Maneuver.LEFT
    return Maneuver.STRAIGHT


def instruction(maneuver: Maneuver, road_name: str | None) -> str:
    label = MANEUVER_LABEL[maneuver]
    if maneuver is Maneuver.ARRIVE or not road_name:
        return label
    return f"{label} · {road_name}"


def _step_starts(
    path: Sequence[Edge], start_heading_deg: float | None
) -> list[tuple[int, Maneuver, float]]:
    """각 안내 단계가 시작되는 (엣지 index, maneuver, 회전각)."""
    if start_heading_deg is None:
        starts = [(0, Maneuver.DEPART, 0.0)]
    else:
        angle = signed_turn_deg(start_heading_deg, path[0].start_bearing)
        opening = classify_maneuver(angle)
        # 출발 직후 회전이 필요하면 그대로 알려 준다 (재탐색 직후 유턴 등)
        starts = [(0, Maneuver.DEPART, 0.0) if opening is Maneuver.STRAIGHT else (0, opening, angle)]

    for i in range(1, len(path)):
        prev, cur = path[i - 1], path[i]
        inside_roundabout = prev.has(FactorCode.ROUNDABOUT) and cur.has(FactorCode.ROUNDABOUT)
        if inside_roundabout:
            # 회전교차로 내부 진행은 단계를 쪼개지 않는다 (cost.transition 과 동일)
            continue

        angle = signed_turn_deg(prev.end_bearing, cur.start_bearing)
        if cur.has(FactorCode.ROUNDABOUT):
            starts.append((i, Maneuver.ROUNDABOUT, angle))
            continue

        reverse = is_reverse(prev, cur)
        merge = None if reverse else road_transition(prev, cur)
        if merge is not None:
            starts.append((i, merge, round(angle, 1)))
            continue

        maneuver = classify_maneuver(angle, reverse=reverse)
        if maneuver is Maneuver.STRAIGHT and cur.name == prev.name:
            continue  # 같은 도로 직진 — 이전 단계에 합친다
        starts.append((i, maneuver, 0.0 if maneuver is Maneuver.STRAIGHT else angle))

    return starts


def _segment_factors(
    path: Sequence[Edge], begin: int, end: int, start_heading_deg: float | None
) -> tuple[dict[FactorCode, float], tuple[FactorCode, ...]]:
    """단계 구간 [begin, end) 의 점수 요소와, 자료가 전혀 없는 점수 요소."""
    amounts: Counter[FactorCode] = Counter()
    known: set[FactorCode] = set(ALWAYS_KNOWN)
    left_turns = left_known = 0
    for i in range(begin, end):
        edge = path[i]
        prev = path[i - 1] if i > 0 else None
        t = transition(prev, edge)
        amounts.update(t.factors)
        if t.left_turn:
            left_turns += 1
            left_known += prev is not None and prev.unprotected_left is not None
        if i == 0 and start_heading_deg is not None:
            amounts.update(heading_factors(start_heading_deg, edge))
        amounts.update(edge_amounts(edge))
        known |= edge.known
    if left_turns == 0 or left_known > 0:
        known.add(FactorCode.UNPROTECTED_LEFT)

    factors = {code: round_amount(code, amounts[code]) for code in SCORED_CODES if amounts[code] > 0}
    unknown = tuple(code for code in SCORED_CODES if code not in known)
    return factors, unknown


def build_steps(path: Sequence[Edge], start_heading_deg: float | None = None) -> tuple[Step, ...]:
    if not path:
        return ()

    starts = _step_starts(path, start_heading_deg)
    steps: list[Step] = []
    offset = 0.0
    for n, (begin, maneuver, angle) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(path)
        segment = path[begin:end]
        factors, unknown = _segment_factors(path, begin, end, start_heading_deg)
        distance = sum(e.length_m for e in segment)
        # 합쳐진 구간은 도로명이 같으므로 첫 엣지 이름이 구간 전체의 이름이다
        road_name = segment[0].name
        steps.append(
            Step(
                index=n,
                maneuver=maneuver,
                point=segment[0].geometry[0],
                road_name=road_name,
                distance_m=distance,
                duration_s=sum(e.travel_time_s for e in segment),
                turn_angle_deg=round(angle, 1),
                factor_amounts=factors,
                offset_m=offset,
                road_class=segment[0].road_class,
                instruction=instruction(maneuver, road_name),
                unknown_factors=unknown,
            )
        )
        offset += distance

    last = path[-1]
    steps.append(
        Step(
            index=len(steps),
            maneuver=Maneuver.ARRIVE,
            point=last.geometry[-1],
            road_name=last.name,
            distance_m=0.0,
            duration_s=0.0,
            turn_angle_deg=0.0,
            factor_amounts={},
            offset_m=offset,
            road_class=last.road_class,
            instruction=instruction(Maneuver.ARRIVE, last.name),
        )
    )
    return tuple(steps)
