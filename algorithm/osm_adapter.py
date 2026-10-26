"""
osm_adapter.py
--------------
실제 OpenStreetMap(OSM) 공식 API에서 서울 강남 일대 실제 도로망을 실시간으로 가져와
EZ_load 그래프로 변환하고, '가장 쉬운 길' vs '가장 빠른 길'을 탐색 및 비교하는 모듈.
"""

import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from typing import Dict, List, Set, Tuple
import requests

# Windows 콘솔 utf-8 출력 보장
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from difficulty_weights import EdgeFeatures, UserContext
from ez_router import EZRouter, DualRouteResult


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 간의 실제 구면 거리(km) 계산."""
    R = 6371.0  # 지구 반지름 (km)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return max(R * c, 0.005)  # 최소 5m 보정


def fetch_osm_map_xml(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float, cache_file: str = "gangnam_roads.osm"
) -> str:
    """
    OpenStreetMap 공식 API (v0.6)를 통해 실제 도로망 XML 다운로드 (로컬 캐싱 지원).
    """
    # 1. cache_file 또는 data/ 폴더 내 파일 경로 탐색
    candidate_paths = [
        cache_file,
        os.path.join("data", cache_file),
        os.path.join(os.path.dirname(__file__), cache_file),
        os.path.join(os.path.dirname(__file__), "data", cache_file)
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            print(f"[OSM Adapter] 로컬 캐시된 실제 도로 데이터 사용: {p}")
            with open(p, "r", encoding="utf-8") as f:
                return f.read()

    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={min_lon},{min_lat},{max_lon},{max_lat}"
    print(f"[OSM Adapter] OSM 공식 서버에서 실제 도로망 다운로드 중: {url}")
    headers = {"User-Agent": "EZLoadRouter/1.0 (Python Road Network Analysis)"}
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()

    xml_text = resp.text
    with open(cache_file, "w", encoding="utf-8") as f:
        f.write(xml_text)
    print(f"[OSM Adapter] 다운로드 완료 및 캐시 저장 성공 (크기: {len(xml_text):,} bytes)")
    return xml_text


def parse_osm_xml_to_graph(
    xml_text: str,
) -> Tuple[Dict[str, List[Tuple[str, EdgeFeatures]]], Dict[str, Tuple[float, float]], Dict[Tuple[str, str], str]]:
    """
    OSM XML 데이터를 파싱하여 EZ_load Graph(인접 리스트), 노드 좌표, 도로명 맵으로 변환.
    """
    root = ET.fromstring(xml_text)

    nodes_coord: Dict[str, Tuple[float, float]] = {}
    signal_nodes: Set[str] = set()
    graph: Dict[str, List[Tuple[str, EdgeFeatures]]] = {}
    road_names: Dict[Tuple[str, str], str] = {}

    # 1. 노드 정보 및 신호등 수집
    for node in root.findall("node"):
        nid = node.attrib["id"]
        lat = float(node.attrib["lat"])
        lon = float(node.attrib["lon"])
        nodes_coord[nid] = (lat, lon)

        for tag in node.findall("tag"):
            if tag.attrib.get("k") == "highway" and tag.attrib.get("v") == "traffic_signals":
                signal_nodes.add(nid)

    # 2. 차량 통행 가능 도로(Way) 수집
    # 보행자/자전거 전용 도로는 제외
    DRIVABLE_HIGHWAYS = {
        "motorway", "motorway_link", "trunk", "trunk_link",
        "primary", "primary_link", "secondary", "secondary_link",
        "tertiary", "tertiary_link", "residential", "living_street", "unclassified"
    }

    for way in root.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        highway_type = tags.get("highway", "")

        if highway_type not in DRIVABLE_HIGHWAYS:
            continue

        way_nodes = [nd.attrib["ref"] for nd in way.findall("nd")]
        road_name = tags.get("name", highway_type)
        lanes = tags.get("lanes", "")
        oneway = tags.get("oneway", "") in ["yes", "1", "true"]
        is_roundabout = tags.get("junction") == "roundabout"

        # 좁은 길 판단 (주거지 골목길 또는 1차로)
        is_narrow = highway_type in ["residential", "living_street"] or lanes == "1"
        # 간선/대로 판단 (주요 간선도로)
        is_highway = highway_type in ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"]

        for i in range(len(way_nodes) - 1):
            u = way_nodes[i]
            v = way_nodes[i + 1]

            if u not in nodes_coord or v not in nodes_coord:
                continue

            dist_km = haversine(
                nodes_coord[u][0], nodes_coord[u][1],
                nodes_coord[v][0], nodes_coord[v][1]
            )

            # 정방향 (u -> v)
            has_signal_v = 1 if v in signal_nodes else 0
            feat_fwd = EdgeFeatures(
                base_distance_km=dist_km,
                traffic_light_count=has_signal_v,
                is_narrow_road=is_narrow,
                is_highway=is_highway,
                roundabout_count=1 if is_roundabout else 0,
            )
            graph.setdefault(u, []).append((v, feat_fwd))
            graph.setdefault(v, [])
            road_names[(u, v)] = road_name

            # 역방향 (v -> u, 일방통행이 아닐 때)
            if not oneway:
                has_signal_u = 1 if u in signal_nodes else 0
                feat_bwd = EdgeFeatures(
                    base_distance_km=dist_km,
                    traffic_light_count=has_signal_u,
                    is_narrow_road=is_narrow,
                    is_highway=is_highway,
                    roundabout_count=1 if is_roundabout else 0,
                )
                graph.setdefault(v, []).append((u, feat_bwd))
                road_names[(v, u)] = road_name

    return graph, nodes_coord, road_names


def run_gangnam_real_test():
    """
    실제 서울 강남구 테헤란로/역삼 일대의 실데이터를 이용한 라우팅 검증
    """
    # 강남역 사거리 ~ 국기원/역삼역 부근 bbox (약 1km x 800m 영역)
    # min_lon, min_lat, max_lon, max_lat
    min_lon, min_lat, max_lon, max_lat = 127.026, 37.496, 37.036, 37.504
    min_lon, min_lat, max_lon, max_lat = 127.026, 37.496, 127.036, 37.503

    xml_text = fetch_osm_map_xml(min_lon, min_lat, max_lon, max_lat)
    graph, coords, road_names = parse_osm_xml_to_graph(xml_text)

    total_nodes = len(graph)
    total_edges = sum(len(edges) for edges in graph.values())
    print(f"\n[실제 도로망 그래프 빌드 완료]")
    print(f"- 교차점(노드) 수: {total_nodes:,}개")
    print(f"- 도로 링크(간선) 수: {total_edges:,}개")

    # 강남역 서쪽 지점(출발지)과 역삼역 동쪽 지점(목적지) 자동 매칭
    valid_nodes = [nid for nid in graph if len(graph[nid]) > 0 and nid in coords]
    if not valid_nodes:
        print("유효한 도로 노드가 없습니다.")
        return

    # 경도 기준으로 가장 서쪽 교차로와 가장 동쪽 교차로 선정
    start_node = min(valid_nodes, key=lambda n: coords[n][1])
    # 출발지와 충분한 거리가 있고 경로가 도달 가능한 목적지 탐색
    sorted_east = sorted(valid_nodes, key=lambda n: coords[n][1], reverse=True)

    # 1. 일반 최단거리 라우터로 도달 가능한 동쪽 노드 찾기
    from ez_router import _dijkstra_distance
    target_node = None
    for candidate in sorted_east:
        if candidate == start_node:
            continue
        test_route = _dijkstra_distance(graph, start_node, candidate)
        if test_route and test_route.total_distance_km > 0.4:  # 최소 400m 이상 거리
            target_node = candidate
            break

    if not target_node:
        print("연결된 경로를 찾지 못했습니다.")
        return

    s_lat, s_lon = coords[start_node]
    t_lat, t_lon = coords[target_node]
    print(f"\n[경로 탐색 구간]")
    print(f"- 출발지: 노드 {start_node} (위도 {s_lat:.5f}, 경도 {s_lon:.5f})")
    print(f"- 도착지: 노드 {target_node} (위도 {t_lat:.5f}, 경도 {t_lon:.5f})")

    # 2. 사용자 성향 설정: 초보 운전자 (골목길/신호등 회피, 대로 선호)
    novice_context = UserContext(
        highway_preference=0.1,                          # 테헤란로 등 대로 매우 선호
        hard_factors=["narrow_road", "traffic_light"],   # 좁은 골목길/신호등 회피
        personal_hard_multiplier=3.5                     # 강한 회피 가중치
    )

    # 3. EZRouter 실행
    router = EZRouter(graph, novice_context)
    result = router.find_routes(start_node, target_node)

    print("\n" + "="*55)
    print(">> 실제 서울 강남 도로망 EZ_load 라우팅 결과 <<")
    print("="*55)

    if result.fast_route:
        fast_roads = [road_names.get((result.fast_route.path[i], result.fast_route.path[i+1]), "골목길") 
                      for i in range(len(result.fast_route.path)-1)]
        # 연속된 중복 도로명 압축
        compact_roads = [fast_roads[0]] if fast_roads else []
        for r in fast_roads[1:]:
            if r != compact_roads[-1]:
                compact_roads.append(r)

        print(f"\n[1] 가장 빠른 길 (Fast Route)")
        print(f"- 실제 주행 거리  : {result.fast_route.total_distance_km:.2f} km")
        print(f"- 거쳐가는 교차로 : {len(result.fast_route.path)}개")
        print(f"- 주요 경유 도로  : {' -> '.join(compact_roads[:6])}")

    if result.easy_route:
        easy_roads = [road_names.get((result.easy_route.path[i], result.easy_route.path[i+1]), "골목길") 
                      for i in range(len(result.easy_route.path)-1)]
        compact_easy = [easy_roads[0]] if easy_roads else []
        for r in easy_roads[1:]:
            if r != compact_easy[-1]:
                compact_easy.append(r)

        print(f"\n[2] 가장 쉬운 길 (Easy Route)")
        print(f"- 실제 주행 거리  : {result.easy_route.total_distance_km:.2f} km")
        print(f"- 누적 난이도 점수: {result.easy_route.total_cost:.2f}")
        print(f"- 거쳐가는 교차로 : {len(result.easy_route.path)}개")
        print(f"- 주요 경유 도로  : {' -> '.join(compact_easy[:6])}")

    print("\n" + "-"*55)
    if result.easy_route and result.fast_route:
        dist_diff = result.easy_route.total_distance_km - result.fast_route.total_distance_km
        if result.easy_route.path != result.fast_route.path:
            print(f"[경로 분석 결과]")
            print(f"  가장 쉬운 길은 초보자가 꺼리는 좁은 이면도로/골목길을 우회하여,")
            print(f"  약 {abs(dist_diff)*1000:.0f}m 더 주행하지만 훨씬 넓고 운전하기 편한 대로 위주로 안내합니다.")
        else:
            print(f"[경로 분석 결과] 이 구간에서는 최단 경로 자체가 이미 넓은 대로 위주로 형성되어 있습니다.")
    print("="*55)


if __name__ == "__main__":
    run_gangnam_real_test()
