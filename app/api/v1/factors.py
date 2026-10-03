from fastapi import APIRouter

from app.api.schemas import FactorListResponse, FactorOut
from app.domain.factors import FACTORS

router = APIRouter(tags=["factors"])


@router.get("/factors", response_model=FactorListResponse, summary="난이도 요소 목록")
def list_factors() -> FactorListResponse:
    return FactorListResponse(
        factors=[
            FactorOut(code=m.code, name=m.name, description=m.description, kind=m.kind)
            for m in FACTORS.values()
        ]
    )
