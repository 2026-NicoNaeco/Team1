"""모든 에러는 {"error": {"code", "message", "details"?}} 형식으로 응답한다."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routing.errors import NoRouteFound, OutOfServiceArea, RoutingError, SameLocation
from app.services.places import PlaceSearchUnavailable


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message


ROUTING_ERRORS: dict[type[RoutingError], tuple[int, str]] = {
    OutOfServiceArea: (422, "OUT_OF_SERVICE_AREA"),
    SameLocation: (422, "SAME_LOCATION"),
    NoRouteFound: (404, "ROUTE_NOT_FOUND"),
}


def _error(status_code: int, code: str, message: str, details: list[dict] | None = None) -> JSONResponse:
    body: dict = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": body})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RoutingError)
    async def _routing_error(_: Request, exc: RoutingError) -> JSONResponse:
        status_code, code = ROUTING_ERRORS.get(type(exc), (500, "ROUTING_ERROR"))
        return _error(status_code, code, str(exc))

    @app.exception_handler(PlaceSearchUnavailable)
    async def _places_error(_: Request, exc: PlaceSearchUnavailable) -> JSONResponse:
        return _error(503, "PLACE_SEARCH_UNAVAILABLE", str(exc))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        return _error(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", details)
