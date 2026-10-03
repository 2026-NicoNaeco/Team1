from fastapi import APIRouter

from app.api.schemas import ProfileAnalyzeRequest, ProfileAnalyzeResponse, WeightChangeOut
from app.services.profile_analyzer import FactorStat, analyze

router = APIRouter(prefix="/profile", tags=["profile"])


@router.post(
    "/analyze",
    response_model=ProfileAnalyzeResponse,
    summary="운전 기록 요약 → 가중치 갱신 (서버 저장 없음)",
)
def analyze_profile(body: ProfileAnalyzeRequest) -> ProfileAnalyzeResponse:
    stats = [
        FactorStat(s.code, s.encountered, s.deviations, s.hesitations) for s in body.summary.factor_stats
    ]
    result = analyze(body.profile.to_domain(), stats)
    return ProfileAnalyzeResponse(
        weights=result.weights,
        changes=[
            WeightChangeOut(code=c.code, before=c.before, after=c.after, difficulty_rate=c.difficulty_rate)
            for c in result.changes
        ],
    )
