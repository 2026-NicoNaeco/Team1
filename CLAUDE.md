# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

쉬운 길 지도: a beginner-driver navigation service. The repo has two parts:
- `backend/` (easy-route-api): a **stateless** FastAPI server that finds routes that are easy for beginner drivers. No users are stored. The app sends the preference profile with every request. `backend/README.md` is the API contract for the frontend, covering endpoints, factor codes, measurement and step fields, reroute semantics, and error codes. Keep it in sync when behaviour changes.
- `mobile/`: the app front end (see "Mobile app" at the end).

The root `README.md` only describes the project, the folder layout and the branching strategy.

`Yolo_detection.py`, `Sample.zip` and `파일구조예시` are left over from an earlier project topic (crowd density) and are not part of this app.

The Commands and Architecture sections below describe the Python backend only. All backend paths are relative to `backend/`.

## Commands

```bash
cd backend                                 # every backend command runs here; `.env` lives here too
pip install -r requirements-dev.txt        # Python 3.11+ (CI and Docker use 3.13)
uvicorn app.main:app --reload              # http://localhost:8000/docs
pytest                                     # CI runs `pytest -q` in backend/ on PRs/pushes to develop and main
pytest tests/test_routing.py::test_hard_factor_avoids_narrow_road   # single test
docker compose up --build                  # full stack with PostGIS + Redis
```

Dependencies are pinned exactly in `requirements*.txt`. There is no linter or formatter configured.

Branching: work on a personal branch cut from `develop`, and open PRs into `develop`. `main` only receives `develop` at release.

## Architecture

Layers: `api/` (FastAPI routers and pydantic schemas) → `services/` → `routing/` (algorithm), with `domain/` as the shared vocabulary. Code comments and user-facing messages are in Korean.

**Composition root.** `app/main.py::build_container` builds a `Container` (`app/api/deps.py`) and stores it on `app.state.container`. Routers fetch services through the `get_*` dependencies in `deps.py`. If a container is already set on `app.state`, the lifespan uses it and won't close it. Tests replace pieces directly, e.g. `client.app.state.container.route_service = RouteService(...)`.

**Every external dependency is optional, with a fallback.** Settings come from env / `.env` (`app/config.py`).
- `GRAPH_PATH` unset → `routing/sample_graph.py`, a synthetic grid around Gwangju. The JSON graph format (including `narrow` and `turn_restrictions`) is documented at the top of `routing/graph.py`. `.env.example` points it at `data/gangnam.json`, a real OSM road network (강남역·역삼역 일대, downloaded from Overpass; the query is in `backend/README.md`) built with `python -m app.routing.osm`. In OSM-derived data a missing tag means "no data", so the converter writes keys only when the tag exists.
- `REDIS_URL` unset → `MemoryCache`. Redis errors are logged and skipped, never raised.
- `DATABASE_URL` unset → `GraphHotspotRepository`, which derives hotspots from graph edges instead of the PostGIS table in `db/init.sql`.
- `KAKAO_REST_API_KEY` unset → place search returns 503 `PLACE_SEARCH_UNAVAILABLE`.

The tests use the `settings` fixture in `tests/conftest.py`, which disables all of these, so tests never touch the network or a database.

**Algorithm boundary.** The backend depends only on the `RouteFinder` Protocol (`routing/interface.py`). `DijkstraRouteFinder` is a placeholder until the algorithm team delivers their implementation. To swap it in, replace the one line in `build_container`. Contract details that are easy to break:
- `avoid_path` is a **coordinate sequence, not edge ids**, and it is a cost penalty (5×), not a ban. If the avoided road is the only connection, it must still be returned.
- `extra_duration_s` is computed in `RouteService` by calling the finder again with `Profile.fastest()` (all weights 0), **without** `avoid_path`.
- `Route.steps` may be empty. Use `routing.steps.build_steps(path, start_heading_deg)` to generate turn-by-turn steps.
- `Route.measurements` may be empty, but then every factor is reported as `known`, so "no data" is lost. Use `routing.measure.measure_route(...)` on the same edge path.
- Raise `OutOfServiceArea` / `SameLocation` / `NoRouteFound` (`routing/errors.py`). `api/errors.py` maps them to HTTP codes.
- Coordinates snap to the nearest point **on a road** (`routing/snap.py`), not the nearest node; within 5 m of a junction they snap to the junction. Mid-edge snaps become piece edges with ids `"<edge id>@..."`. Anything keyed by edge id (turn restrictions, avoid penalties) must go through `base_edge_id()`.

**Factors match the front end.** The 15 codes in `domain/factors.py` have the same names, units and meanings as `mobile/src/domain/factors.ts`; change both together. Each factor has a kind:
- `EDGE`: a road-segment property summed per edge, as a count or as km (`NARROW_ROAD`, `UNPAVED_ROAD`, `TRAFFIC_VOLUME`, `ROAD_TYPE` are km).
- `ZONE`: `PROTECTED_ZONE`, `ACCIDENT_ZONE`, `ROUNDABOUT`. Consecutive flagged edges are one place, counted once on entry.
- `TURN`: charged on the transition between edges. `TURN_COUNT` is the total; `UNPROTECTED_LEFT` and `U_TURN` are subsets counted alongside it.
- `INFO`: `LANE_COUNT`. Like `ROAD_TYPE`, it has `base_penalty` 0 and is never scored.

`SHARP_TURN` is a road-curve section (edge attribute `sharp_curves`), not a ≥100° turn. Entering or leaving a `HIGHWAY` edge is `MERGE_DIVERGE` (step maneuver `MERGE`/`DIVERGE`) and is not a `TURN_COUNT`.

**Cost model** (`routing/cost.py`): cost = travel time × road-preference factor + turn time + difficulty points × `POINT_SECONDS` (15 s). Travel time is 80% of the speed limit plus 20 s per known traffic light (`graph.py`); turn time (right 5 s, left 10 s, U-turn 20 s) comes from `turn_delay_s`, and route and step durations include it. Points = Σ amount × `FactorMeta.base_penalty` × `Profile.weight(code)`, where amount is a count or km. `cost.transition(prev, nxt)` is the single place that decides transition factors (zone entry, turns, unprotected left, merge/diverge). Search cost, route totals, steps and measurements all call it, so they cannot disagree. The turn-angle thresholds (30°/100°/165°) are shared between cost and step generation. A reversal onto the same edge always counts as a U-turn. Moving within a roundabout is not counted as a turn.

**Search speed** (`routing/dijkstra.py`, `routing/landmarks.py`): the search is A* with a landmark (ALT) lower bound, i.e. the minimum travel time to the goal (precomputed from 8 border landmarks at startup) × the profile's smallest road-preference factor. It returns exactly what plain Dijkstra would only while every edge cost is ≥ travel time × that factor, every turn cost is ≥ 0, and every penalty multiplier is ≥ 1. Negative weights, discount factors, or penalties below 1 break this — lower the bound to match (`tests/test_routing.py::test_search_with_landmarks_matches_plain_dijkstra` checks equivalence). Piece edges keep the original edge's `target`, so arrival pieces must get a bound of 0, not their node's bound.

**Measurements** (`routing/measure.py`): every route factor is reported as `known` / `partial` / `unknown`, with `coverage`, the graph's `source` and `verification`. Edge data is "known" only if its JSON key is present (`graph._KNOWN_KEYS`), so **a missing key means no data, not 0**. Turn counts are always known. `UNPROTECTED_LEFT` coverage is the share of left turns whose approach edge has `unprotected_left`.

**Profile weights** (`domain/models.py`): explicit `weights` take priority, then `hard_factors` (1.5), then `easy_factors` (0.5), otherwise 1.0. `/v1/profile/analyze` (`services/profile_analyzer.py`) returns updated weights and stores nothing.

**Errors.** Every error response has the shape `{"error": {"code", "message", "details"?}}`. Raise `ApiError(status, code, message)` from routers. Validation errors are rewritten to `VALIDATION_ERROR`.

**Polylines.** These use the Google encoded polyline format with precision 5 (`routing/polyline.py`). The reroute endpoint receives the abandoned route's polyline as `previous_polyline`, decodes it, and matches it per segment (pairs of consecutive points, both directions).

## Mobile app (`mobile/`)

뉴비맵: a beginner-driver navigation front end, React Native 0.86 + Expo SDK 57 + TypeScript (strict), React Navigation 7, zustand, react-native-svg. It runs on **mock data** (a fictional city), is phone-only (portrait; no desktop/PC layouts), and does not talk to the FastAPI backend. `mobile/README.md` (Korean) has the mock-vs-real table, the replacement points, the mapping to the backend API and the verification record, so keep it in sync when behaviour changes. UI copy and comments are Korean.

```bash
cd mobile
npm install
npm run web              # web preview on :8081, use a phone-sized window (fastest way to look at UI changes)
npm start                # Expo dev server (Expo Go / simulators)
npm run typecheck        # tsc --noEmit
npm test                 # jest-expo, pure-logic suites under src/**/__tests__
npx jest src/mock/__tests__/recommendation-scenarios.test.ts   # single file
npx expo install <pkg>   # add dependencies at the SDK-compatible version
```

Run `npm run typecheck` and `npm test` after changes. Expo SDK 57 / RN 0.86 / React 19 APIs may differ from older docs, so check the installed package or the SDK 57 docs before using an API from memory.

**Layers** (`mobile/src`): `domain/` (pure logic and types: burden, recommendation policy, preferences, learning) → `services/types.ts` (interfaces the screens depend on) → `mock/` (demo implementations) → `state/` (zustand stores) → `screens/`, `ui/`. Visual style comes from `design/tokens.ts` (Toss-like: gray page, white cards, big bold headings, soft-colour badges, 56px buttons); build screens from the shared components in `ui/` and make every tappable thing a `PressableScale` (press feedback) instead of a bare `Pressable`. `services/index.ts::createDemoServices` is the single composition point for swapping in real implementations; `map/index.ts` is the single point for swapping the map renderer (props contract in `map/MapAdapter.ts`).

Invariants that are easy to break:
- **Road characteristics and recommendations are separate.** `RouteProvider` returns only candidates and per-factor measurements; ranking, reasons and trade-offs come from `RecommendationService`. A recommendation carries the preference `signature` it was computed with, and `tripStore` discards stale responses (new search, changed settings). Never show routes or reasons from before a search or settings change.
- **Every measurement is `known` / `partial` / `unknown`** (with source and verification). "0회" and "정보 없음" are different, and missing accident-zone data must never read as safe. Mock values are labelled as such.
- **Turn factors are counted exclusively.** `TURN_COUNT` is the total; `UNPROTECTED_LEFT` and `U_TURN` are subsets; burden scoring uses plain turns = total − subsets. `SHARP_TURN` means a road-curve section, `MERGE_DIVERGE` and `LANE_CHANGE` are separate. The backend uses the same codes and definitions (mapping table in `mobile/README.md` §5).
- **Preference priority:** user-set value > mock-learned adjustment (only with consent, only for factors the user did not set) > default. Never silently relax a hard condition; explain it and let the user change it.
- **Copy rules:** never claim safety ("안전", "사고 없는 길"); show 낮음/보통/높음 plus concrete reasons, never a safety score. Everyday screens use product wording (주행, 경로, 기록) and carry no "데모" badges, but the data is fake, so keep the **disclosure points** listed in `mobile/README.md` §9: the welcome footnote, the "시연용 안내예요" sheet the first time guidance starts in a session (the simulator waits until it is acknowledged), the always-visible "시연 중 · 실제 도로 안내가 아니에요" pill on the guidance screen, the tiny "시연용 지도" map label, the search footnote, and Settings → 앱 정보 → 시연 안내. Do not remove them.
- **Dev tools are hidden:** Settings → 앱 정보 → tap the version row 7 times (per session) to reveal 개발용 시나리오. The QA flows rely on this and on `testID`s, so keep both stable.
- The demo city is deterministic: `mock/demoCity` builds routes from a directed road graph in one pass, so steps, factors, time and distance agree by construction (`route-consistency.test.ts` guards this). Change `cityData.ts` and re-run the scenario tests; the expected winners are in `mock/presets.ts`.
- Storage keys all start with `newbiemap:v1:` (`services/repository`); "delete all" must clear every one of them. Nothing leaves the device and no sensitive values are logged.

**React Native Web pitfalls** (the web preview is the main way UI is checked here): RN-web ignores `accessibilityState`, so mirror state with `aria-checked` / `aria-disabled`; put `pointerEvents` in `style`, not as a prop; Korean text wraps per syllable unless `wordBreak: keep-all`; SVG `onPress` is unsupported, so hit-test with a `Pressable` overlay; a `TextInput` needs `minWidth: 0` inside a flex row or it overflows the screen at large font scales; `Switch` needs the web-only `activeThumbColor`. UI state can be driven by `testID` (rendered as `data-testid`). The map draws decor (alleys, buildings) inside one `<G transform="matrix(...)">` per visible tile so panning does not rebuild path strings; keep it that way.

Check layouts at 390×844 and 360×640, at font scales 1.6× and 2× (Settings dev tools), not only at the default size. The web preview is not device verification. Native bundling was checked with `npx expo export`, but nothing has been run on iOS/Android devices or emulators.
