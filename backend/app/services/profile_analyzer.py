"""운전 기록 요약 → 요소별 가중치 갱신. 서버는 아무것도 저장하지 않는다.

요소별 어려움 비율 = (이탈 + 0.5 × 머뭇거림) / 마주친 횟수
목표 가중치 = MIN_WEIGHT + 비율 × (MAX_TARGET_WEIGHT - MIN_WEIGHT)
새 가중치 = 기존 + LEARNING_RATE × (목표 - 기존)   ← 한 번의 기록으로 급변하지 않도록
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.factors import FactorCode
from app.domain.models import Profile

MIN_SAMPLES = 3
LEARNING_RATE = 0.3
HESITATION_RATIO = 0.5
MIN_WEIGHT = 0.5
MAX_TARGET_WEIGHT = 3.0


@dataclass(frozen=True)
class FactorStat:
    code: FactorCode
    encountered: int
    deviations: int = 0
    hesitations: int = 0


@dataclass(frozen=True)
class WeightChange:
    code: FactorCode
    before: float
    after: float
    difficulty_rate: float


@dataclass(frozen=True)
class AnalysisResult:
    weights: dict[FactorCode, float]
    changes: list[WeightChange]


def analyze(profile: Profile, stats: Iterable[FactorStat]) -> AnalysisResult:
    weights = {code: profile.weight(code) for code in FactorCode}
    changes = []
    for stat in stats:
        if stat.encountered < MIN_SAMPLES:
            continue
        rate = min(1.0, (stat.deviations + HESITATION_RATIO * stat.hesitations) / stat.encountered)
        target = MIN_WEIGHT + rate * (MAX_TARGET_WEIGHT - MIN_WEIGHT)
        before = weights[stat.code]
        after = round(before + LEARNING_RATE * (target - before), 2)
        if after != before:
            weights[stat.code] = after
            changes.append(WeightChange(stat.code, before, after, round(rate, 3)))
    return AnalysisResult(weights=weights, changes=changes)
