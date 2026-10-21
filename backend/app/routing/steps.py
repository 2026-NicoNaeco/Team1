"""엣지 경로 → 턴바이턴 안내 단계.

회전이 없고 도로명이 같은 연속 구간은 한 단계로 합친다. 격자형 도로망에서
엣지마다 단계를 만들면 "직진 80m" 가 수십 개 생기기 때문이다.

회전 임계값은 cost.py 와 공유해서 안내와 난이도 계산이 어긋나지 않게 한다.
"""

from collections import Counter
from collections.abc import Sequence

from app.domain.factors import FactorCode
from app.domain.models import Maneuver, Step
from app.routing.cost import SHARP_TURN_MIN_ANGLE, TURN_MIN_ANGLE, U_TURN_MIN_ANGLE
from app.routing.geo import signed_turn_deg
from app.routing.graph import Edge


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
            # 회전교차로 내부 진행은 단계를 쪼개지 않는다 (cost.transition_factors 와 동일)
            continue

        angle = signed_turn_deg(prev.end_bearing, cur.start_bearing)
        if cur.has(FactorCode.ROUNDABOUT):
            starts.append((i, Maneuver.ROUNDABOUT, angle))
            continue

        reverse = cur.target == prev.source and cur.source == prev.target
        maneuver = classify_maneuver(angle, reverse=reverse)
        if maneuver is Maneuver.STRAIGHT and cur.name == prev.name:
            continue  # 같은 도로 직진 — 이전 단계에 합친다
        starts.append((i, maneuver, 0.0 if maneuver is Maneuver.STRAIGHT else angle))

    return starts


def build_steps(path: Sequence[Edge], start_heading_deg: float | None = None) -> tuple[Step, ...]:
    if not path:
        return ()

    starts = _step_starts(path, start_heading_deg)
    steps: list[Step] = []
    for n, (begin, maneuver, angle) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(path)
        segment = path[begin:end]
        counts: Counter[FactorCode] = Counter()
        for edge in segment:
            counts.update(edge.factor_counts)
        steps.append(
            Step(
                index=n,
                maneuver=maneuver,
                point=segment[0].geometry[0],
                # 합쳐진 구간은 도로명이 같으므로 첫 엣지 이름이 구간 전체의 이름이다
                road_name=segment[0].name,
                distance_m=sum(e.length_m for e in segment),
                duration_s=sum(e.travel_time_s for e in segment),
                turn_angle_deg=round(angle, 1),
                factor_counts=dict(counts),
            )
        )

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
            factor_counts={},
        )
    )
    return tuple(steps)
