import math

from app.domain.models import Point

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(a: Point, b: Point) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def bearing_deg(a: Point, b: Point) -> float:
    """a 에서 b 로 향하는 방위각 (북=0, 시계방향, 0~360)."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlng = math.radians(b.lng - a.lng)
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def angle_between(bearing_a: float, bearing_b: float) -> float:
    """두 방위각의 차이 (0~180). 0 이면 직진, 180 이면 정반대."""
    diff = abs(bearing_a - bearing_b) % 360.0
    return 360.0 - diff if diff > 180.0 else diff


def signed_turn_deg(bearing_from: float, bearing_to: float) -> float:
    """회전 방향까지 포함한 각도 (-180~180). 양수는 우회전, 음수는 좌회전.

    방위각은 시계방향이므로 각도가 커지는 쪽이 우회전이다.
    크기는 angle_between 과 같고 부호만 더 있다.
    """
    return (bearing_to - bearing_from + 540.0) % 360.0 - 180.0


def midpoint(points: tuple[Point, ...]) -> Point:
    """폴리라인의 길이 기준 중간 지점."""
    if len(points) == 1:
        return points[0]
    seg_lengths = [haversine_m(points[i], points[i + 1]) for i in range(len(points) - 1)]
    half = sum(seg_lengths) / 2
    for i, seg in enumerate(seg_lengths):
        if half <= seg and seg > 0:
            t = half / seg
            a, b = points[i], points[i + 1]
            return Point(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t)
        half -= seg
    return points[-1]
