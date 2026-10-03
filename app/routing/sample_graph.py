"""개발용 샘플 도로망.

실제 도로망(자료정리 파트) 준비 전까지 FE·BE 연동을 위한 가짜 데이터.
명세 예시 좌표(광주 상무지구 ~ 동구 일대)를 덮는 격자에 난이도 요소를 결정적으로 배치한다.
"""

import random
from typing import Any

from app.routing.graph import RoadGraph

ROWS, COLS = 9, 15
LAT0, LNG0 = 35.150, 126.845
LAT_STEP, LNG_STEP = 0.004, 0.005

HIGHWAY_ROW = 4
ARTERIAL_COL = 7
SCHOOL_ZONE = (range(1, 3), range(3, 6))  # 보호구역 (rows, cols)
ROUNDABOUT_NODE = (6, 10)


def _nid(r: int, c: int) -> str:
    return f"n{r}_{c}"


def build_sample_graph_data(seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    nodes = []
    for r in range(ROWS):
        for c in range(COLS):
            jitter_lat = rng.uniform(-0.0006, 0.0006) if r != HIGHWAY_ROW else 0.0
            jitter_lng = rng.uniform(-0.0008, 0.0008) if c != ARTERIAL_COL else 0.0
            nodes.append({
                "id": _nid(r, c),
                "lat": round(LAT0 + r * LAT_STEP + jitter_lat, 6),
                "lng": round(LNG0 + c * LNG_STEP + jitter_lng, 6),
            })

    edges = []

    def add(r1: int, c1: int, r2: int, c2: int) -> None:
        horizontal = r1 == r2
        in_school = all(r in SCHOOL_ZONE[0] and c in SCHOOL_ZONE[1] for r, c in ((r1, c1), (r2, c2)))
        near_roundabout = ROUNDABOUT_NODE in ((r1, c1), (r2, c2))

        if horizontal and r1 == HIGHWAY_ROW:
            attrs = {
                "road_class": "HIGHWAY", "speed_kph": 70, "lanes": 4, "name": "샘플대로",
                "traffic_lights": 0, "lane_change": 1 if c1 % 3 == 0 else 0,
            }
        elif not horizontal and c1 == ARTERIAL_COL:
            attrs = {
                "road_class": "ARTERIAL", "speed_kph": 50, "lanes": 3, "name": "샘플로",
                "traffic_lights": 1, "lane_change": 1 if r1 % 4 == 0 else 0,
                "accident_zone": r1 in (2, 5),
            }
        else:
            # 제거된 골목 → 격자 불규칙성
            if rng.random() < 0.06:
                return
            attrs = {
                "road_class": "LOCAL", "speed_kph": 30,
                "lanes": 1 if rng.random() < 0.18 else 2,
                "traffic_lights": 1 if rng.random() < 0.35 else 0,
                "surface": "unpaved" if rng.random() < 0.05 else "asphalt",
                "oneway": rng.random() < 0.05,
            }
        attrs["protected_zone"] = in_school
        attrs["roundabout"] = near_roundabout
        edges.append({"id": f"e_{r1}_{c1}_{r2}_{c2}", "from": _nid(r1, c1), "to": _nid(r2, c2), **attrs})

    for r in range(ROWS):
        for c in range(COLS):
            if c + 1 < COLS:
                add(r, c, r, c + 1)
            if r + 1 < ROWS:
                add(r, c, r + 1, c)

    return {"nodes": nodes, "edges": edges}


def build_sample_graph(seed: int = 42) -> RoadGraph:
    return RoadGraph.from_dict(build_sample_graph_data(seed))
