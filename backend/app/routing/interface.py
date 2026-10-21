"""알고리즘 모듈 연동 인터페이스.

BE 는 이 Protocol 에만 의존한다. 알고리즘 파트 구현체가 완성되면
app.main 의 조립 코드에서 구현체만 교체하면 된다.
"""

from collections.abc import Sequence
from typing import Protocol

from app.domain.models import Point, Profile, Route


class RouteFinder(Protocol):
    def find_route(
        self,
        origin: Point,
        destination: Point,
        profile: Profile,
        *,
        max_routes: int = 1,
        start_heading_deg: float | None = None,
        avoid_path: Sequence[Point] | None = None,
    ) -> list[Route]:
        """프로필 기준으로 쉬운 경로 후보를 반환한다.

        - max_routes: 반환할 최대 후보 수 (중복 경로는 제외되므로 더 적을 수 있음)
        - start_heading_deg: 재탐색 시 현재 진행 방향. 반대 방향 출발은 유턴으로 취급
        - avoid_path: 이탈한 기존 경로의 좌표열. 이 구간을 지나는 비용을 올려 다른 길을
          우선 제시한다. 엣지 id 가 아니라 좌표로 주는 이유는 구현체마다 내부 식별자가
          다르기 때문이다. **금지가 아니라 가중치**이므로 유일한 연결이면 그대로 반환해야 한다.

        Raises:
            OutOfServiceArea: 좌표가 도로망에서 너무 멀 때
            SameLocation: 출발지와 도착지가 같은 지점으로 매칭될 때
            NoRouteFound: 연결된 경로가 없을 때
        """
        ...
