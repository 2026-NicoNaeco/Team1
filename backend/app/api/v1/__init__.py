from fastapi import APIRouter

from app.api.v1 import factors, hotspots, places, profile, routes, service_area

router = APIRouter(prefix="/v1")
router.include_router(factors.router)
router.include_router(places.router)
router.include_router(routes.router)
router.include_router(profile.router)
router.include_router(hotspots.router)
router.include_router(service_area.router)
