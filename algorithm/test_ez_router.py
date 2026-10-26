"""
test_ez_router.py
-----------------
EZRouter 동작 검증용 단위 테스트.
간단한 그래프 예시로 쉬운 길 / 빠른 길 분기를 확인.

실행:
    python test_ez_router.py
"""

from difficulty_weights import EdgeFeatures, UserContext
from ez_router import EZRouter


def make_test_graph():
    """
    테스트용 그래프 (A -> E, 3가지 경로)

    경로 1 (A->B->E): 거리 짧지만 신호등/유턴 많음 -> 어려운 경로
    경로 2 (A->C->E): 거리 중간, 요소 적음 -> 가장 쉬운 경로
    경로 3 (A->D->E): 거리 최단 -> 가장 빠른 경로

           [B] (신호등5, 유턴2)
          / \
    [A]       [E]
          \ /
           [C] (요소 없음)
          \ /
           [D] (거리 최단)
    """
    graph = {
        "A": [
            ("B", EdgeFeatures(base_distance_km=2.0, traffic_light_count=5, u_turn_count=2)),
            ("C", EdgeFeatures(base_distance_km=3.0)),  # 요소 없음 = 쉬움
            ("D", EdgeFeatures(base_distance_km=1.0, sharp_turn_count=3, is_accident_zone=True)),
        ],
        "B": [
            ("E", EdgeFeatures(base_distance_km=2.0)),
        ],
        "C": [
            ("E", EdgeFeatures(base_distance_km=3.0)),
        ],
        "D": [
            ("E", EdgeFeatures(base_distance_km=1.0)),
        ],
        "E": [],
    }
    return graph


def test_basic():
    context = UserContext(
        highway_preference=0.5,
        hard_factors=[],
        easy_factors=[],
    )

    graph = make_test_graph()
    router = EZRouter(graph, context)
    result = router.find_routes("A", "E")

    assert result.easy_route is not None, "쉬운 길 탐색 실패"
    assert result.fast_route is not None, "빠른 길 탐색 실패"

    print("=== 기본 테스트 ===")
    print(f"쉬운 길: {result.easy_route.path}  (난이도={result.easy_route.total_cost:.2f}, 거리={result.easy_route.total_distance_km:.1f}km)")
    print(f"빠른 길: {result.fast_route.path}  (거리={result.fast_route.total_distance_km:.1f}km)")

    # 빠른 길은 최단 거리(D 경유) 여야 함
    assert "D" in result.fast_route.path, f"빠른 길이 D를 경유해야 함. 실제: {result.fast_route.path}"
    # 쉬운 길은 요소 없는 C 경유여야 함
    assert "C" in result.easy_route.path, f"쉬운 길이 C를 경유해야 함. 실제: {result.easy_route.path}"
    print("-> PASS\n")


def test_personalized_hard_factor():
    """유턴을 어렵다고 설정하면 B 경유 경로가 더욱 회피되어야 한다."""
    context = UserContext(
        highway_preference=0.5,
        hard_factors=["u_turn"],   # 유턴을 특히 싫어함
        easy_factors=[],
        personal_hard_multiplier=3.0,
    )

    graph = make_test_graph()
    router = EZRouter(graph, context)
    result = router.find_routes("A", "E")

    print("=== 개인화 테스트 (유턴 어려움 설정) ===")
    print(f"쉬운 길: {result.easy_route.path}  (난이도={result.easy_route.total_cost:.2f})")
    assert "B" not in result.easy_route.path, "유턴 많은 B 경유 경로가 선택됨 - 개인화 미작동"
    print("-> PASS\n")


def test_highway_preference():
    """고속도로 선호도 테스트."""
    graph = {
        "A": [
            ("B", EdgeFeatures(base_distance_km=5.0, is_highway=True)),   # 고속도로
            ("C", EdgeFeatures(base_distance_km=5.0, is_highway=False)),  # 일반도로
        ],
        "B": [("Z", EdgeFeatures(base_distance_km=1.0))],
        "C": [("Z", EdgeFeatures(base_distance_km=1.0))],
        "Z": [],
    }

    # 일반도로 선호 (highway_preference=1.0)
    ctx_normal = UserContext(highway_preference=1.0)
    router = EZRouter(graph, ctx_normal)
    result = router.find_routes("A", "Z")
    print("=== 고속도로 선호도 테스트 (일반도로 선호) ===")
    print(f"쉬운 길: {result.easy_route.path}")
    assert "C" in result.easy_route.path, "일반도로 선호인데 고속도로(B) 선택됨"
    print("-> PASS\n")

    # 고속도로 선호 (highway_preference=0.0)
    ctx_highway = UserContext(highway_preference=0.0)
    router2 = EZRouter(graph, ctx_highway)
    result2 = router2.find_routes("A", "Z")
    print("=== 고속도로 선호도 테스트 (고속도로 선호) ===")
    print(f"쉬운 길: {result2.easy_route.path}")
    assert "B" in result2.easy_route.path, "고속도로 선호인데 일반도로(C) 선택됨"
    print("-> PASS\n")


if __name__ == "__main__":
    test_basic()
    test_personalized_hard_factor()
    test_highway_preference()
    print("모든 테스트 통과!")
