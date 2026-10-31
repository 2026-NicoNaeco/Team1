"""랜드마크 하한 (ALT).

도로망 가장자리의 노드 몇 곳(랜드마크)에서 모든 노드까지, 또 모든 노드에서 랜드마크까지의 최소 주행 시간을
미리 구해 둔다. 삼각 부등식으로 두 노드 사이 주행 시간의 하한을 얻는다.

    d(v, x) ≥ d(v, L) - d(x, L)      d(v, x) ≥ d(L, x) - d(L, v)

직선거리를 최고 속도로 가는 하한은 서울처럼 넓은 도로망에서 너무 낮아 탐색이 도로망 대부분을 훑는다.
이 하한은 실제 도로를 따라 잰 시간이라 훨씬 촘촘하다. 회전 금지·회전 비용은 무시하므로 실제보다
크지 않고, 랜드마크마다 일관된(consistent) 하한의 최댓값이라 A* 가 다익스트라와 같은 경로를 찾는다.
"""

import heapq
import math
from array import array
from collections.abc import Collection

from app.routing.graph import RoadGraph

LANDMARK_COUNT = 8
# 탐색 한 번에 쓰는 랜드마크 수. 출발지 → 도착지 하한이 가장 큰 것만 쓴다
ACTIVE_LANDMARKS = 4


class Landmarks:
    def __init__(self, graph: RoadGraph, count: int = LANDMARK_COUNT):
        self.index = {node_id: i for i, node_id in enumerate(graph.nodes)}
        forward: list[list[tuple[int, float]]] = [[] for _ in self.index]
        backward: list[list[tuple[int, float]]] = [[] for _ in self.index]
        for edge in graph.edges.values():
            u, v = self.index[edge.source], self.index[edge.target]
            forward[u].append((v, edge.travel_time_s))
            backward[v].append((u, edge.travel_time_s))
        self.nodes = _pick(graph, self.index, count)
        # from_[k][v] = 랜드마크 k → v, to[k][v] = v → 랜드마크 k (초)
        self.from_ = [_dijkstra(forward, k) for k in self.nodes]
        self.to = [_dijkstra(backward, k) for k in self.nodes]

    def bound(self, targets: Collection[str], start: str | None = None) -> "LandmarkBound":
        """targets 중 가장 가까운 곳까지 주행 시간의 하한을 주는 함수. start 가 있으면 그 구간에 유리한 랜드마크만 쓴다."""
        ids = [self.index[t] for t in targets if t in self.index]
        ks = range(len(self.nodes))
        if start in self.index and ids:
            s = self.index[start]
            ks = sorted(ks, key=lambda k: -max(self._pair(k, s, x) for x in ids))[:ACTIVE_LANDMARKS]
        return LandmarkBound(self, list(ks), ids)

    def _pair(self, k: int, v: int, x: int) -> float:
        lb = max(self.to[k][v] - self.to[k][x], self.from_[k][x] - self.from_[k][v])
        return lb if lb == lb else 0.0  # 양쪽 다 닿지 않으면(nan) 하한 없음


class LandmarkBound:
    def __init__(self, landmarks: Landmarks, ks: list[int], targets: list[int]):
        self._index = landmarks.index
        # 목표 노드마다 (랜드마크까지, 랜드마크에서) 시간을 미리 꺼내 둔다
        self._rows = [(landmarks.to[k], landmarks.from_[k]) for k in ks]
        self._targets = [[(to[x], fr[x]) for to, fr in self._rows] for x in targets]

    def __call__(self, node_id: str) -> float:
        v = self._index.get(node_id)
        if v is None or not self._targets:
            return 0.0
        best = math.inf
        for target in self._targets:
            lb = 0.0
            for (to, fr), (to_x, fr_x) in zip(self._rows, target):
                d = to[v] - to_x
                if d > lb:
                    lb = d
                d = fr_x - fr[v]
                if d > lb:
                    lb = d
            if lb < best:
                best = lb
        return best


def _pick(graph: RoadGraph, index: dict[str, int], count: int) -> list[int]:
    """도로망 중심에서 방향을 count 개로 나눠, 방향마다 가장 먼 노드. 가장자리에 고루 있어야 하한이 촘촘하다."""
    if not index:
        return []
    lats = [n.point.lat for n in graph.nodes.values()]
    lngs = [n.point.lng for n in graph.nodes.values()]
    lat0, lng0 = (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2
    scale = math.cos(math.radians(lat0))
    best: dict[int, tuple[float, int]] = {}
    for node_id, node in graph.nodes.items():
        dy, dx = node.point.lat - lat0, (node.point.lng - lng0) * scale
        sector = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * count) % count
        far = dx * dx + dy * dy
        if far > best.get(sector, (-1.0, 0))[0]:
            best[sector] = (far, index[node_id])
    return [i for _, i in sorted(best.values(), reverse=True)]


def _dijkstra(adjacency: list[list[tuple[int, float]]], source: int) -> array:
    dist = array("d", [math.inf]) * len(adjacency)
    dist[source] = 0.0
    heap = [(0.0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in adjacency[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist
