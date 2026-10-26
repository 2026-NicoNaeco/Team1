# EZ_load: 초보 운전자 맞춤형 "쉬운 길" 라우팅 알고리즘 엔진

초보 운전자 및 운전 취약자를 위해, 단순 최단 거리/최단 시간 경로뿐만 아니라 주행 스트레스와 도로 난이도 요소를 최소화한 **"가장 쉬운 길(Easy Route)"**과 **"가장 빠른 길(Fast Route)"**을 함께 계산하여 제공하는 라우팅 엔진입니다.

---

## 📁 구성 파일

```
algorithm/
├── difficulty_weights.py   # 도로 난이도 가중치 정의, 개인화 컨텍스트 및 간선 비용 산출
├── ez_router.py            # Dijkstra 기반 다중 기준(난이도/거리) 경로 탐색 라우터 엔진
├── osm_adapter.py          # 실제 도로망(OpenStreetMap) 데이터 파싱 및 실데이터 라우팅 데모
├── test_ez_router.py       # 핵심 알고리즘 및 개인화 동작 검증 단위 테스트
├── data/
│   └── gangnam_roads.osm   # [샘플 데이터] 서울 강남 테헤란로 일대 실제 도로망 데이터 (457개 노드, 838개 간선)
└── README.md               # 알고리즘 명세 및 사용 가이드
```

---

## ⚙️ 1. 도로 난이도 비용 함수 (Cost Model)

간선 $e$의 주행 난이도 점수 $Score(e)$는 다음과 같이 계산됩니다:

$$Score(e) = \text{base\_distance\_km} + \sum_{i} \left( W_i \times C_i \right) + \text{HighwayPenalty}$$

* **기본 요소별 가중치 ($W_i$)**:
  * 비포장도로(`unpaved_road`): 2.5
  * 신호등(`traffic_light`): 2.0
  * 유턴(`u_turn`): 2.0
  * 사고다발구역(`accident_zone`): 2.0
  * 급회전 구간(`sharp_turn`): 1.8
  * 회전교차로(`roundabout`): 1.5
  * 어린이/노인 보호구역(`protection_zone`): 1.5
  * 골목길/2차로 미만 좁은 도로(`narrow_road`): 1.3
  * 차선 변경(`lane_change`): 1.2
  * 방향 전환(좌/우회전, `direction_change`): 1.0

* **개인화 가중치 승수**:
  * 사용자가 어렵다고 설정한 요소(`hard_factors`): 기본 가중치 $\times 2.0$ (상향)
  * 사용자가 쉽다고 설정한 요소(`easy_factors`): 기본 가중치 $\times 0.5$ (하향)

* **고속도로 선호도 반영**:
  * $\text{HighwayPenalty} = (\text{highway\_preference} - 0.5) \times 4.0 \times \text{base\_distance\_km}$
  * `highway_preference = 0.0` (고속도로 선호) $\rightarrow$ 고속도로 비용 감소 (-2.0/km)
  * `highway_preference = 1.0` (일반도로 선호) $\rightarrow$ 고속도로 비용 증가 (+2.0/km)

---

## 📊 2. 입출력 데이터 구조

### 입력 (Input)
* **`Graph`**: `Dict[NodeId, List[Tuple[NodeId, EdgeFeatures]]]`
  * `EdgeFeatures`: `base_distance_km`, `traffic_light_count`, `is_protection_zone`, `is_narrow_road`, `is_unpaved`, `direction_change_count`, `roundabout_count`, `u_turn_count`, `lane_change_count`, `is_accident_zone`, `sharp_turn_count`, `is_highway`
* **`UserContext`**: `highway_preference`, `hard_factors`, `easy_factors`, `personal_hard_multiplier`, `personal_easy_multiplier`
* **`source`, `target`**: 출발 및 도착 `NodeId` (str)

### 출력 (Output)
`DualRouteResult` 객체:
* `easy_route`: `RouteResult` (가장 쉬운 길: `path`, `total_cost`(난이도 점수), `total_distance_km`)
* `fast_route`: `RouteResult` (가장 빠른 길: `path`, `total_cost`(거리), `total_distance_km`)

---

## 🚦 3. 실제 도로망 샘플 데이터 및 데모

`data/gangnam_roads.osm`은 서울 강남역~역삼역(테헤란로/서초대로) 일대의 실제 도로망 데이터입니다.

### 실행 방법
```bash
# 1. 가중치 및 라우터 단위 테스트
python test_ez_router.py

# 2. 실제 서울 강남 도로망 기반 쉬운 길 vs 빠른 길 탐색 데모
python osm_adapter.py
```

### 실제 탐색 결과 예시 (강남역 -> 역삼역)
* **가장 빠른 길**: 1.50 km (거리는 짧으나 `테헤란로4길`, `강남대로84길` 등 좁은 골목길을 직통 통과)
* **가장 쉬운 길**: 1.65 km (약 150m 더 길지만, 골목길을 우회하고 주행이 편한 `테헤란로` 대로 위주로 안내)

---

## 🔗 4. 백엔드(`backend/app/routing/interface.py`) 연동 가이드

백엔드의 `RouteFinder` Protocol에 연결할 때는 아래와 같이 `EZRouter`를 래핑하여 주입할 수 있습니다:

```python
from app.domain.models import Point, Profile, Route
from app.routing.interface import RouteFinder
from algorithm.ez_router import EZRouter
from algorithm.difficulty_weights import UserContext

class EZRouteFinderAdapter:
    def __init__(self, graph):
        self.graph = graph

    def find_route(self, origin: Point, destination: Point, profile: Profile, **kwargs) -> list[Route]:
        # 1. Profile -> UserContext 변환
        context = UserContext(
            highway_preference=profile.road_preference,
            hard_factors=[f.code.value.lower() for f in profile.hard_factors],
            easy_factors=[f.code.value.lower() for f in profile.easy_factors]
        )
        # 2. 라우터 실행 및 Route 변환
        router = EZRouter(self.graph, context)
        result = router.find_routes(origin.id, destination.id)
        ...
```
