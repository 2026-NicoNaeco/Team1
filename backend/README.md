# 쉬운 길 지도 — 백엔드

사용자를 저장하지 않는 무상태 경로 계산 서버. 선호 프로필은 앱이 요청마다 함께 보낸다.

## 실행

아래 명령은 모두 `backend/` 에서 실행한다. `.env` 도 이 폴더에 둔다.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

- API 문서: http://localhost:8000/docs
- 환경변수는 `.env.example` 참고. Redis·PostgreSQL·카카오 키가 없어도 동작한다
  (인메모리 캐시, 그래프 기반 핫스팟, 장소 검색만 503).
- PostGIS·Redis 포함 전체 실행: `docker compose up --build`

```bash
pytest
```

## API (v1)

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/v1/factors` | 난이도 요소 목록 |
| GET | `/v1/places/search?q=&lat=&lng=&size=` | 장소 검색 (카카오 로컬 프록시, 캐시). `lat`·`lng` 를 주면 정확도순이되 근처를 먼저 주고 `distance_m` 을 채운다 (거리순은 이름이 일부만 맞는 근처 장소가 앞에 와서 쓰지 않는다) |
| POST | `/v1/routes/search` | 쉬운 경로 탐색 |
| POST | `/v1/routes/reroute` | 경로 이탈 시 재탐색 (`current`, `heading_deg`, `previous_polyline`) |
| POST | `/v1/profile/analyze` | 운전 기록 요약 → 가중치 갱신 (저장 없음) |
| GET | `/v1/hotspots?bbox=minLng,minLat,maxLng,maxLat&codes=` | 화면 영역 내 어려운 지점 |
| GET | `/v1/service-area` | 경로를 찾을 수 있는 지역 (`bbox`, 도로 위 `center`, `max_snap_distance_m`) |

필드 이름은 snake_case 이고 의미·값은 FE(`mobile/src/domain/types.ts`)와 같다. FE 는 이름만 camelCase 로 바꾸면 된다.

### 난이도 요소

코드·단위·뜻은 FE `mobile/src/domain/factors.ts` 와 같다. `/v1/factors` 가 같은 목록을 `unit`, `scored` 와 함께 준다.

| 코드 | 단위 | 세는 방법 |
|---|---|---|
| `TURN_COUNT` | 회 | 교차로 좌·우회전 **전체** 횟수. 비보호 좌회전·유턴 포함 |
| `UNPROTECTED_LEFT` | 회 | 비보호 좌회전 (`TURN_COUNT` 의 일부) |
| `U_TURN` | 회 | 유턴 (`TURN_COUNT` 의 일부) |
| `SHARP_TURN` | 곳 | **도로 자체가 급하게 꺾이는 구간.** 교차로 회전과 별개 |
| `ROUNDABOUT` | 회 | 회전교차로에 들어간 횟수 |
| `LANE_CHANGE` | 회 | 다음 회전·진출을 위한 필수 차로 변경 (합류·분기 제외) |
| `MERGE_DIVERGE` | 곳 | 합류·분기. 고속도로 진입·진출 포함, `TURN_COUNT` 에는 넣지 않음 |
| `LANE_COUNT` | 차로 | 가장 긴 거리를 지나는 도로의 편도 차로 수. **점수에 안 씀** |
| `NARROW_ROAD` | km | 1차로 이하 또는 폭 5m 미만 도로의 길이 |
| `UNPAVED_ROAD` | km | 비포장 도로의 길이 |
| `ROAD_TYPE` | km | 고속도로를 지나는 길이. **점수에 안 씀** (선호는 `road_preference`) |
| `TRAFFIC_LIGHT` | 개 | 신호등 |
| `TRAFFIC_VOLUME` | km | 평소 차가 많은 구간의 길이 (실시간 아님) |
| `PROTECTED_ZONE` | 곳 | 보호구역. 연속한 구간은 한 곳으로 센다 |
| `ACCIDENT_ZONE` | 곳 | 사고다발구간. 연속한 구간은 한 곳으로 센다 |

### 경로 응답 (`/v1/routes/search`, `/v1/routes/reroute`)

```json
{
  "routes": [{
    "route_id": "r_b2d91cb1", "label": "A", "rank": 1, "via": "샘플대로",
    "distance_m": 7272, "duration_s": 527, "extra_duration_s": 0, "difficulty_score": 33.0,
    "toll": {"availability": "unknown"},
    "polyline": "...",
    "factors": {
      "TURN_COUNT":  {"availability": "known", "value": 0, "unit": "count",
                      "source": {"kind": "demo_sample", "name": "개발용 샘플 도로망"}, "verification": "unverified"},
      "NARROW_ROAD": {"availability": "partial", "value": 0.4, "unit": "km", "coverage": 0.5, "source": {...}, "verification": "unverified"},
      "LANE_CHANGE": {"availability": "unknown", "unit": "count", "source": {...}}
    },
    "hotspots": [...], "steps": [...]
  }],
  "excluded": []
}
```

- `factors` 에는 **모든 요소**가 고정 순서로 들어 있다.
  - `known`: 경로 전체를 확인했다. `value` 가 0 이면 "확인한 결과 없음".
  - `partial`: 일부 구간만 확인했다. `value` 는 확인된 구간 기준이고 `coverage` 는 확인된 길이 비율이다
    (비보호 좌회전은 확인된 좌회전 수 비율).
  - `unknown`: 정보가 없다. `value` 가 없다. **0 이나 "안전함" 으로 표시하면 안 된다.**
  - 도로망 자료에 키가 없는 구간은 "정보 없음" 이다 (`app/routing/graph.py` 상단 형식 참고).
  - 방향 전환·유턴은 도로 형상으로 계산하므로 항상 `known` 이다.
- 후보는 FE 데모처럼 **사용자 선호 → 가장 빠른 길 → 고속도로 위주** 관점으로 찾고, 짧은 쪽 길이의 80% 이상을
  함께 지나는 경로는 하나로 본다. 단 **가장 빠른 길은 겹쳐도 빼지 않는다**(완전히 같은 경로일 때만 뺀다).
  그래서 `max_routes` 가 2 이상이면 후보 중 `extra_duration_s` 가 0 인 경로가 항상 있다.
  재탐색에서는 가장 빠른 후보도 이탈 경로 회피를 적용해 찾으므로 0 보다 클 수 있다.
  `max_routes=1` 이면 사용자 선호 경로 하나다.
- 목록은 `rank`(사용자 선호 기준 비용) 순서다. `label` 은 FE 처럼 **소요 시간 순서**라 A 가 가장 빠르다.
- `via` 는 가장 길게 지나는 도로 이름 두 개(지나는 순서)다. 이름 있는 도로가 없으면 "이름 없는 도로".
- `duration_s` 는 **평소 한산할 때 기준**의 추정이다. 실시간 교통은 반영하지 않는다.
  - 주행: 제한속도(`speed_kph`)의 80% 로 달린다고 본다 (가감속 반영, OSRM 자동차 프로필과 같은 비율).
  - 신호: 확인된 신호등 1개당 평균 대기 20초. 신호 자료가 없는 구간은 대기 시간이 빠지므로 실제보다 짧을 수 있다.
  - 회전: 우회전 5초, 좌회전 10초, 유턴 20초. 탐색 비용·경로 합계·안내 단계가 같은 값을 쓴다
    (`app/routing/cost.py` 의 `turn_delay_s`, `app/routing/graph.py` 의 `RUNNING_SPEED_RATIO`·`SIGNAL_DELAY_S`).
- 출발지·도착지는 **가장 가까운 도로 위 지점**에 붙는다. 교차로에서 5m 안이면 교차로에 붙는다.
  `polyline` 의 첫 점·마지막 점이 그 도로 위 지점이다. 도로 위에서 두 지점이 10m 안이면 `SAME_LOCATION`,
  도로까지 `max_snap_distance_m`(기본 1km)보다 멀면 `OUT_OF_SERVICE_AREA` 다. 양방향 도로 위에서 출발하면
  어느 방향으로든 출발할 수 있다고 보고, 재탐색에 `heading_deg` 를 주면 반대 방향 출발은 유턴으로 계산한다.
- `toll` 은 통행료 자료가 아직 없어서 항상 `{"availability": "unknown"}` 이다.
- `excluded` 는 통행 제한 판정을 아직 하지 않아서 항상 빈 배열이다.

### 턴바이턴 안내

각 경로는 `steps` 로 안내 단계를 함께 준다.
회전이 없고 도로명이 같은 연속 구간은 한 단계로 합쳐지므로 `steps` 길이는 구간 수보다 훨씬 짧다.

| 필드 | 설명 |
|---|---|
| `maneuver` | `DEPART` / `STRAIGHT` / `LEFT` / `RIGHT` / `SHARP_LEFT` / `SHARP_RIGHT` / `U_TURN` / `ROUNDABOUT` / `MERGE` / `DIVERGE` / `ARRIVE` |
| `instruction` | 화면에 그대로 보여 주는 문구. 예: `우회전 · 상무대로`, `합류 · 샘플대로`, `목적지 도착`. 이름 없는 도로로 들어가면 `좌회전 · 테헤란로 방면`(다음 도로명) 또는 `좌회전 · 이면도로`(도로 종류: 이면도로·연결로·진출입로·고속도로) |
| `lat`, `lng` | 이 동작을 하는 지점 |
| `road_name` | 진입하는 도로명. 이름 없는 도로는 `null` |
| `road_class` | `HIGHWAY` / `RAMP` / `ARTERIAL` / `COLLECTOR` / `LOCAL` |
| `offset_m` | 경로 시작점부터 이 지점까지의 거리 |
| `distance_m`, `duration_s` | 다음 동작까지의 거리·시간. `ARRIVE` 는 0 |
| `turn_angle_deg` | 회전 각도 (-180~180). **양수는 우회전**, 직진·출발·도착은 0 |
| `factors` | 이 단계에서 마주치는 점수 요소 `{코드: 값}`. 횟수 요소는 횟수, km 요소는 km. 0 인 요소는 생략. 단계를 시작하는 회전도 포함 |
| `unknown_factors` | 이 단계 구간에 자료가 전혀 없는 점수 요소 |

`distance_m`·`duration_s` 의 합은 경로의 `distance_m`·`duration_s` 와 같다. 회전 임계값(30°/100°/165°)은 난이도 계산과 공유한다.
이름 없는 짧은 구간으로 이어지는 직진은 따로 단계를 만들지 않고 앞 단계에 합친다.
`MERGE`·`DIVERGE` 는 도로 등급이 고속도로로 바뀌거나(진입) 고속도로에서 다른 등급으로 바뀔 때(진출) 나온다.
`reroute` 에 `heading_deg` 를 주면 첫 단계가 `DEPART` 대신 실제 회전 안내(예: `U_TURN`)로 나온다.

### 장소 검색

`places[]` 의 `category` 는 FE `PlaceCategory` 값이다: `station` / `university` / `school` / `park` / `market` /
`hospital` / `mart` / `landmark` / `parking`. 카카오 분류를 이 값으로 바꾸고, 맞는 것이 없으면 `landmark` 다.
카카오 원문 분류는 `category_name` 에 있다.

### 이탈 경로 회피 (reroute)

서버는 무상태여서 `previous_route_id`(엣지 id 들의 해시)만으로는 이전 경로를 복원할 수 없다.
그래서 **FE 가 이탈한 경로의 `polyline` 을 `previous_polyline` 으로 함께 보낸다.**
서버는 그 좌표열이 지나는 구간을 찾아 비용을 5배로 올려 다른 길을 우선 제시한다.

- 좌표 하나 단위가 아니라 **연속한 두 점(구간)** 단위로 맞춘다. 경로를 가로지르는 도로까지
  잡히지 않게 하기 위해서다. 반대 차선 엣지도 같은 구간으로 보고 함께 피한다.
- **금지가 아니라 가중치다.** 그 길이 유일한 연결이면 같은 경로가 다시 나온다 — 재탐색이
  404 로 실패하는 것보다 낫기 때문이다.
- `previous_polyline` 을 생략하면 기존 동작(회피 없는 단순 재탐색)과 같다.
- `extra_duration_s` 의 기준선에는 회피를 적용하지 않는다. "최단 시간 대비 추가 시간" 의
  기준이 회피 때문에 흔들리면 의미가 달라진다.

에러는 모두 `{"error": {"code", "message", "details"?}}` 형식이다.
코드: `VALIDATION_ERROR`, `OUT_OF_SERVICE_AREA`, `SAME_LOCATION`, `ROUTE_NOT_FOUND`,
`INVALID_BBOX`, `BBOX_TOO_LARGE`, `PLACE_SEARCH_UNAVAILABLE`.

## 구조

```
app/
  domain/     난이도 요소 코드, Profile·Route 모델 (알고리즘 파트와 공유)
  routing/    알고리즘 모듈
    interface.py    RouteFinder — BE 가 의존하는 유일한 인터페이스
    dijkstra.py     임시 구현: 엣지 기반 가중치 다익스트라 + 대안 경로
    cost.py         비용 모델 (주행 시간 + 난이도 점수 × 15초), 구간 전환 요소 판정
    measure.py      엣지 경로 → 요소별 측정값 (known / partial / unknown)
    steps.py        엣지 경로 → 턴바이턴 안내 단계 (직진 구간 병합)
    graph.py        도로망 그래프 + JSON 로더 (형식은 파일 상단 주석, 회전 금지 포함)
    osm.py          OSM XML → 그래프 JSON 변환기
    snap.py         좌표 → 도로 위 지점, 출발·도착 조각 구간
                    좌표 → 최근접 노드는 격자 공간 인덱스 (노드 20만에서 선형 스캔 대비 수천 배)
    sample_graph.py 개발용 샘플 도로망 (광주 일대 격자)
  services/   경로 조합, 장소 검색·캐시, 핫스팟 저장소, 프로필 분석
  api/        FastAPI 라우터·스키마·에러 처리
db/init.sql   PostGIS hotspots 테이블
data/gangnam.json  강남역·역삼역 일대 실제 도로망 (OSM 변환 결과)
```

## 알고리즘 구현체 교체

`RouteFinder.find_route(origin, destination, profile, *, max_routes, start_heading_deg, avoid_path)
-> list[Route]` 를 구현한 클래스를 만들고 `app/main.py` 의 `build_container` 에서
`DijkstraRouteFinder` 대신 넣으면 된다. 키워드 인자는 모두 기본값이 있어 일부만 지원해도 동작한다.

`avoid_path` 는 엣지 id 가 아니라 **좌표열**로 준다. 구현체마다 내부 엣지 식별자가 다르기 때문이다.
`extra_duration_s` 는 BE 가 `Profile.fastest()`(모든 가중치 0)로 한 번 더 호출해 계산한다.

`Route.steps` 는 기본값이 빈 튜플이라 안내를 만들지 않아도 구현체가 깨지지 않는다.
다만 그 경우 API 의 `steps` 가 빈 배열로 나가 FE 안내가 사라지므로,
엣지 경로를 들고 있다면 `app.routing.steps.build_steps(path, start_heading_deg)` 를 그대로 쓰면 된다.

`Route.measurements` 도 비워 둘 수 있다. 그러면 `factor_amounts` 를 출처 미상의 확인값(`known`)으로 내보내서
"정보 없음" 을 구분하지 못하므로, 같은 엣지 경로로 `app.routing.measure.measure_route(...)` 를 쓰는 것이 좋다.
요소 판정(회전·지역 진입·고속도로 진입/진출)은 `app.routing.cost.transition` 한 곳에 있다.

### 서비스 지역

`GET /v1/service-area` 는 도로망이 덮는 영역을 준다. FE 는 기본 출발지와 지도 첫 화면을 이 안에서 잡아야 한다.
`center` 는 영역 중앙에서 가장 가까운 도로 위 지점이라 그대로 출발지로 쓸 수 있다.
`GRAPH_PATH=data/gangnam.json`(`.env.example` 기본값)이면 강남역·역삼역 일대, 비우면 광주 상무지구 ~ 동구 일대의 가상 격자다.

## 실제 도로망 (OpenStreetMap)

`data/gangnam.json` 은 OSM 강남역·역삼역 일대(위도 37.490~37.508, 경도 127.018~127.045, 약 2.4km × 2km,
노드 1,403개, 방향 구간 3,848개, 회전 금지 59개)를 `app/routing/osm.py` 로 바꾼 것이다.
원본은 Overpass API 에서 도로·도로의 노드·회전 금지만 받았다 (2026-10-26 기준).

```bash
# 1) 원본 받기 (Overpass 는 User-Agent 가 없으면 406 을 준다)
cat > gangnam.overpassql <<'EOF'
[out:xml][timeout:120];
way["highway"](37.490,127.018,37.508,127.045)->.roads;
(.roads; node(w.roads); relation(bw.roads)["type"="restriction"];);
out body;
EOF
curl -A "easy-route-api (Team1)" --data-urlencode "data@gangnam.overpassql" \
  https://overpass-api.de/api/interpreter -o gangnam.osm

# 2) 변환
python -m app.routing.osm gangnam.osm data/gangnam.json --name "OpenStreetMap (강남역·역삼역 일대)"
```

- 차도만 남긴다(주차장 통로·진입로·보도 제외). 교차로마다 구간을 나누고, 경계에서 잘려 빠져나올 수 없는
  구간은 버린다(가장 큰 강연결 부분만 남김).
- 속도는 `maxspeed` 가 있으면 그 값, 없으면 등급 기본값(간선 50, 이면도로 30 km/h)이다.
- **OSM 에 태그가 없는 것은 "정보 없음" 이다.**
  - 신호등: OSM 에 빠진 곳이 많아 신호가 확인된 구간만 셈한다. 그래서 대부분 `partial` 이다.
  - 좁은 도로: FE 정의(마주 오는 차와 지나가기 빠듯한 길)대로 그래프의 `narrow` 로 직접 판정한다.
    폭 태그, 골목(`service=alley`), 양방향 1차로, 간선·보조간선 등급으로 판정하고 나머지 이면도로는 정보 없음.
  - 급커브: 태그가 아니라 도로 형상으로 판정해서 모든 구간에 값이 있다(`known`). 교차로가 아닌 곳에서
    40m 안에 60° 이상 꺾이면 한 곳으로 센다(곡선 반지름 약 38m 이하). 회전교차로 구간은 회전교차로로만 센다.
    지도 지점은 다른 구간 요소처럼 그 구간의 가운데에 찍혀서, 긴 구간이면 실제 굴곡 위치와 떨어질 수 있다.
  - 보호구역·사고다발·교통량·비보호 좌회전·차로 변경은 OSM 에 없어 항상 `unknown` 이다.
    공공데이터로 따로 붙여야 한다.
- OSM 의 회전 금지(좌회전·유턴 금지 등, 경유지가 노드인 것)는 그래프의 `turn_restrictions` 로 옮기고
  탐색이 그 회전을 하지 않는다. 도로 중간에서 출발·도착해도 원래 구간 기준으로 지킨다.
  경유지가 도로인 규칙과 범위 밖 도로를 가리키는 규칙은 아직 옮기지 않는다.
- **유턴 허용 지점 정보는 OSM 에 없다.** 금지 규칙이 없는 곳의 유턴은 가능하다고 보고(점수·시간으로만 억제),
  양방향 도로에서는 아무 교차로에서나 되돌아갈 수 있다. 실제로 유턴이 허용된 곳인지는 보장하지 않는다.
- 출처 표시: OSM 자료는 ODbL 이라 지도·경로를 보여 주는 화면에 "© OpenStreetMap contributors" 를 표시해야 한다.
