"""엣지 경로 → 요소별 측정값.

FE 는 "0회" 와 "정보 없음" 을 다르게 보여 준다. 그래서 값과 함께 그 값이 경로의 얼마만큼을
확인한 결과인지(coverage)를 낸다.

- 구간 요소: 자료가 있는 구간 길이 / 전체 길이
- 비보호 좌회전: 자료가 있는 좌회전 수 / 전체 좌회전 수 (좌회전이 없으면 확인된 0)
- 방향 전환·유턴: 도로 형상으로 계산하므로 항상 확인됨
"""

from collections import Counter
from collections.abc import Sequence

from app.domain.factors import FACTORS, FactorCode, MeasureUnit
from app.domain.models import Availability, DataSource, Measurement, Verification
from app.routing.cost import edge_amounts, heading_factors, transition
from app.routing.graph import Edge

ALWAYS_KNOWN = frozenset({FactorCode.TURN_COUNT, FactorCode.U_TURN})
# 부동소수 오차로 coverage 가 0.9999 가 되어 partial 로 보이지 않게 한다
FULL_COVERAGE = 0.999


def round_amount(code: FactorCode, amount: float) -> float:
    if FACTORS[code].unit is MeasureUnit.KM:
        return round(amount, 2)
    return int(round(amount))


def measure_route(
    path: Sequence[Edge],
    start_heading_deg: float | None,
    source: DataSource,
    verification: Verification,
) -> dict[FactorCode, Measurement]:
    total_m = sum(e.length_m for e in path)
    amounts: Counter[FactorCode] = Counter()
    known_m: Counter[FactorCode] = Counter()
    lanes_m: Counter[int] = Counter()
    left_turns = left_known = 0

    for i, edge in enumerate(path):
        prev = path[i - 1] if i > 0 else None
        t = transition(prev, edge)
        amounts.update(t.factors)
        if t.left_turn:
            left_turns += 1
            if prev is not None and prev.unprotected_left is not None:
                left_known += 1
        if i == 0 and start_heading_deg is not None:
            amounts.update(heading_factors(start_heading_deg, edge))
        amounts.update(edge_amounts(edge))
        for code in edge.known:
            known_m[code] += edge.length_m
        if edge.lanes is not None:
            lanes_m[edge.lanes] += edge.length_m

    def make(code: FactorCode, coverage: float, value: float | None) -> Measurement:
        unit = FACTORS[code].unit
        if coverage <= 0 or value is None:
            return Measurement(Availability.UNKNOWN, unit, source, verification)
        if coverage >= FULL_COVERAGE:
            return Measurement(Availability.KNOWN, unit, source, verification, value=value)
        return Measurement(
            Availability.PARTIAL, unit, source, verification, value=value, coverage=round(coverage, 2)
        )

    result: dict[FactorCode, Measurement] = {}
    for code in FactorCode:
        if code in ALWAYS_KNOWN:
            coverage = 1.0
        elif code is FactorCode.UNPROTECTED_LEFT:
            coverage = left_known / left_turns if left_turns else 1.0
        else:
            coverage = known_m[code] / total_m if total_m > 0 else 1.0

        if code is FactorCode.LANE_COUNT:
            # 가장 긴 거리를 지나는 차로 수. 같으면 적은 쪽 (보수적으로)
            value = max(lanes_m, key=lambda n: (lanes_m[n], -n)) if lanes_m else None
        else:
            value = round_amount(code, amounts[code])
        result[code] = make(code, coverage, value)
    return result
