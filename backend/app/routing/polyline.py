"""Google Encoded Polyline (precision 5) 인코딩/디코딩."""

from collections.abc import Iterable

from app.domain.models import Point


def _encode_value(value: int) -> str:
    value = ~(value << 1) if value < 0 else value << 1
    chunks = []
    while value >= 0x20:
        chunks.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    chunks.append(chr(value + 63))
    return "".join(chunks)


def encode(points: Iterable[Point], precision: int = 5) -> str:
    factor = 10**precision
    prev_lat = prev_lng = 0
    out = []
    for p in points:
        lat, lng = round(p.lat * factor), round(p.lng * factor)
        out.append(_encode_value(lat - prev_lat))
        out.append(_encode_value(lng - prev_lng))
        prev_lat, prev_lng = lat, lng
    return "".join(out)


def decode(encoded: str, precision: int = 5) -> list[Point]:
    factor = 10**precision
    points = []
    index = lat = lng = 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        points.append(Point(lat / factor, lng / factor))
    return points
