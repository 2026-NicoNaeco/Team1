from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.models import Point, Profile, Route
from app.routing.errors import NoRouteFound
from app.routing.interface import RouteFinder


@dataclass(frozen=True)
class RankedRoute:
    rank: int
    route: Route
    # 최단 시간 경로 대비 추가 소요 시간
    extra_duration_s: float


class RouteService:
    def __init__(self, finder: RouteFinder):
        self._finder = finder

    def search(
        self,
        origin: Point,
        destination: Point,
        profile: Profile,
        max_routes: int,
        start_heading_deg: float | None = None,
        avoid_path: Sequence[Point] | None = None,
    ) -> list[RankedRoute]:
        routes = self._finder.find_route(
            origin,
            destination,
            profile,
            max_routes=max_routes,
            start_heading_deg=start_heading_deg,
            avoid_path=avoid_path,
        )
        # 기준선에는 회피를 적용하지 않는다. extra_duration_s 는 "최단 시간 대비"
        # 추가 시간이므로 이탈 경로 회피 때문에 기준이 흔들리면 의미가 달라진다.
        baseline = self._fastest_duration(origin, destination, start_heading_deg)
        baseline = min([baseline, *(r.duration_s for r in routes)])
        routes = sorted(routes, key=lambda r: r.cost)
        return [
            RankedRoute(rank=i, route=r, extra_duration_s=r.duration_s - baseline)
            for i, r in enumerate(routes, start=1)
        ]

    def _fastest_duration(self, origin: Point, destination: Point, heading: float | None) -> float:
        try:
            fastest = self._finder.find_route(
                origin, destination, Profile.fastest(), max_routes=1, start_heading_deg=heading
            )
        except NoRouteFound:
            return float("inf")
        return fastest[0].duration_s
