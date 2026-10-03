# 쉬운 길 지도 — 백엔드

사용자를 저장하지 않는 무상태 경로 계산 서버. 선호 프로필은 앱이 요청마다 함께 보낸다.

> `Yolo_detection.py`, `Sample.zip`, `파일구조예시` 는 이전 주제(군중 밀집 위험도 예측)의 파일이다.

## 브랜치 전략

```
main      최종 배포용. 마지막에만 develop 을 머지한다
develop   통합 브랜치. 모든 기능은 여기로 PR
<이름>    개인 작업 브랜치. develop 에서 분기
```

```bash
git switch develop && git pull           # 최신 develop 받기
git switch -c <이름>                     # 처음 한 번만 (이후엔 git switch <이름>)
git merge develop                        # 작업 전 develop 변경 반영
git push -u origin <이름>                # 푸시 후 GitHub 에서 develop 으로 PR
```

## 실행

```bash
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
| GET | `/v1/places/search?q=&lat=&lng=&size=` | 장소 검색 (카카오 로컬 프록시, 캐시) |
| POST | `/v1/routes/search` | 쉬운 경로 탐색 |
| POST | `/v1/routes/reroute` | 경로 이탈 시 재탐색 (`current`, `heading_deg`, `previous_polyline`) |
| POST | `/v1/profile/analyze` | 운전 기록 요약 → 가중치 갱신 (저장 없음) |
| GET | `/v1/hotspots?bbox=minLng,minLat,maxLng,maxLat&codes=` | 화면 영역 내 어려운 지점 |

### 턴바이턴 안내

`/v1/routes/search` · `/v1/routes/reroute` 응답의 각 경로는 `steps` 로 안내 단계를 함께 준다.
회전이 없고 도로명이 같은 연속 구간은 한 단계로 합쳐지므로 `steps` 길이는 구간 수보다 훨씬 짧다.

| 필드 | 설명 |
|---|---|
| `maneuver` | `DEPART` / `STRAIGHT` / `LEFT` / `RIGHT` / `SHARP_LEFT` / `SHARP_RIGHT` / `U_TURN` / `ROUNDABOUT` / `ARRIVE` |
| `lat`, `lng` | 이 동작을 하는 지점 |
| `road_name` | 진입하는 도로명. 이름 없는 이면도로는 `null` |
| `distance_m`, `duration_s` | 다음 동작까지의 거리·시간. `ARRIVE` 는 0 |
| `turn_angle_deg` | 회전 각도 (-180~180). **양수는 우회전**, 직진·출발·도착은 0 |
| `factors` | 이 단계에서 마주치는 난이도 요소만 (0 인 요소는 생략) |

`distance_m` 의 합은 경로의 `distance_m` 과 같다. 회전 임계값(30°/100°/165°)은 난이도 계산과 공유한다.
`reroute` 에 `heading_deg` 를 주면 첫 단계가 `DEPART` 대신 실제 회전 안내(예: `U_TURN`)로 나온다.

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
    cost.py         비용 모델 (주행 시간 + 난이도 점수 × 15초)
    steps.py        엣지 경로 → 턴바이턴 안내 단계 (직진 구간 병합)
    graph.py        도로망 그래프 + JSON 로더 (형식은 파일 상단 주석)
                    좌표 → 최근접 노드는 격자 공간 인덱스 (노드 20만에서 선형 스캔 대비 수천 배)
    sample_graph.py 개발용 샘플 도로망 (광주 일대 격자)
  services/   경로 조합, 장소 검색·캐시, 핫스팟 저장소, 프로필 분석
  api/        FastAPI 라우터·스키마·에러 처리
db/init.sql   PostGIS hotspots 테이블
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
