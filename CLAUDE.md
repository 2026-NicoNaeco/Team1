# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

쉬운 길 지도 (easy-route-api): a **stateless** FastAPI server that finds routes that are easy for beginner drivers. No users are stored. The app sends the preference profile with every request. `README.md` is the API contract for the frontend, covering endpoints, step fields, reroute semantics, and error codes. Keep it in sync when behaviour changes.

`Yolo_detection.py`, `Sample.zip` and `파일구조예시` are left over from an earlier project topic (crowd density) and are not part of this app.

The repo also holds the app front end in `mobile/` (React Native + Expo, a self-contained demo that does not call this backend). See "Mobile app" at the end. Everything above and the Commands/Architecture sections below describe the Python backend only.

## Commands

```bash
pip install -r requirements-dev.txt        # Python 3.11+ (CI and Docker use 3.13)
uvicorn app.main:app --reload              # http://localhost:8000/docs
pytest                                     # CI runs `pytest -q` on PRs/pushes to develop and main
pytest tests/test_routing.py::test_hard_factor_avoids_narrow_road   # single test
docker compose up --build                  # full stack with PostGIS + Redis
```

Dependencies are pinned exactly in `requirements*.txt`. There is no linter or formatter configured.

Branching: work on a personal branch cut from `develop`, and open PRs into `develop`. `main` only receives `develop` at release.

## Architecture

Layers: `api/` (FastAPI routers and pydantic schemas) → `services/` → `routing/` (algorithm), with `domain/` as the shared vocabulary. Code comments and user-facing messages are in Korean.

**Composition root.** `app/main.py::build_container` builds a `Container` (`app/api/deps.py`) and stores it on `app.state.container`. Routers fetch services through the `get_*` dependencies in `deps.py`. If a container is already set on `app.state`, the lifespan uses it and won't close it. Tests replace pieces directly, e.g. `client.app.state.container.route_service = RouteService(...)`.

**Every external dependency is optional, with a fallback.** Settings come from env / `.env` (`app/config.py`).
- `GRAPH_PATH` unset → `routing/sample_graph.py`, a synthetic grid around Gwangju. The JSON graph format is documented at the top of `routing/graph.py`.
- `REDIS_URL` unset → `MemoryCache`. Redis errors are logged and skipped, never raised.
- `DATABASE_URL` unset → `GraphHotspotRepository`, which derives hotspots from graph edges instead of the PostGIS table in `db/init.sql`.
- `KAKAO_REST_API_KEY` unset → place search returns 503 `PLACE_SEARCH_UNAVAILABLE`.

The tests use the `settings` fixture in `tests/conftest.py`, which disables all of these, so tests never touch the network or a database.

**Algorithm boundary.** The backend depends only on the `RouteFinder` Protocol (`routing/interface.py`). `DijkstraRouteFinder` is a placeholder until the algorithm team delivers their implementation. To swap it in, replace the one line in `build_container`. Contract details that are easy to break:
- `avoid_path` is a **coordinate sequence, not edge ids**, and it is a cost penalty (5×), not a ban. If the avoided road is the only connection, it must still be returned.
- `extra_duration_s` is computed in `RouteService` by calling the finder again with `Profile.fastest()` (all weights 0), **without** `avoid_path`.
- `Route.steps` may be empty. Use `routing.steps.build_steps(path, start_heading_deg)` to generate turn-by-turn steps.
- Raise `OutOfServiceArea` / `SameLocation` / `NoRouteFound` (`routing/errors.py`). `api/errors.py` maps them to HTTP codes.

**Cost model** (`routing/cost.py`): cost = travel time × road-preference factor + difficulty points × `POINT_SECONDS` (15 s). Points = Σ count × `FactorMeta.base_penalty` × `Profile.weight(code)`. Each difficulty factor in `domain/factors.py` is either `EDGE` (a property of the road segment) or `TURN` (charged on the transition between edges). The turn-angle thresholds (30°/100°/165°) are shared between cost and step generation. A reversal onto the same edge always counts as a U-turn. Moving within a roundabout is not counted as a turn.

**Profile weights** (`domain/models.py`): explicit `weights` take priority, then `hard_factors` (1.5), then `easy_factors` (0.5), otherwise 1.0. `/v1/profile/analyze` (`services/profile_analyzer.py`) returns updated weights and stores nothing.

**Errors.** Every error response has the shape `{"error": {"code", "message", "details"?}}`. Raise `ApiError(status, code, message)` from routers. Validation errors are rewritten to `VALIDATION_ERROR`.

**Polylines.** These use the Google encoded polyline format with precision 5 (`routing/polyline.py`). The reroute endpoint receives the abandoned route's polyline as `previous_polyline`, decodes it, and matches it per segment (pairs of consecutive points, both directions).

## Mobile app (`mobile/`)

뉴비맵: a beginner-driver navigation front end, React Native 0.86 + Expo SDK 57 + TypeScript (strict), React Navigation 7, zustand, react-native-svg. It is a **demo with mock data**; it does not talk to the FastAPI backend. `mobile/README.md` (Korean) has the mock-vs-real table, the replacement points, the mapping to the backend API and the verification record, so keep it in sync when behaviour changes. UI copy and comments are Korean.

```bash
cd mobile
npm install
npm run web              # web preview on :8081 (fastest way to look at UI changes)
npm start                # Expo dev server (Expo Go / simulators)
npm run typecheck        # tsc --noEmit
npm test                 # jest-expo, pure-logic suites under src/**/__tests__
npx jest src/mock/__tests__/recommendation-scenarios.test.ts   # single file
npx expo install <pkg>   # add dependencies at the SDK-compatible version
```

Run `npm run typecheck` and `npm test` after changes. Expo SDK 57 / RN 0.86 / React 19 APIs may differ from older docs, so check the installed package or the SDK 57 docs before using an API from memory.

**Layers** (`mobile/src`): `domain/` (pure logic and types: burden, recommendation policy, preferences, learning) → `services/types.ts` (interfaces the screens depend on) → `mock/` (demo implementations) → `state/` (zustand stores) → `screens/`, `ui/`. `services/index.ts::createDemoServices` is the single composition point for swapping in real implementations; `map/index.ts` is the single point for swapping the map renderer (props contract in `map/MapAdapter.ts`).

Invariants that are easy to break:
- **Road characteristics and recommendations are separate.** `RouteProvider` returns only candidates and per-factor measurements; ranking, reasons and trade-offs come from `RecommendationService`. A recommendation carries the preference `signature` it was computed with, and `tripStore` discards stale responses (new search, changed settings). Never show routes or reasons from before a search or settings change.
- **Every measurement is `known` / `partial` / `unknown`** (with source and verification). "0회" and "정보 없음" are different, and missing accident-zone data must never read as safe. Mock values are labelled as such.
- **Turn factors are counted exclusively.** `TURN_COUNT` is the total; `UNPROTECTED_LEFT` and `U_TURN` are subsets; burden scoring uses plain turns = total − subsets. `SHARP_TURN` means a road-curve section, `MERGE_DIVERGE` and `LANE_CHANGE` are separate. This differs from the backend's `SHARP_TURN`/`LANE_CHANGE_TRAFFIC` (see the mapping table in `mobile/README.md`).
- **Preference priority:** user-set value > mock-learned adjustment (only with consent, only for factors the user did not set) > default. Never silently relax a hard condition; explain it and let the user change it.
- **Copy rules:** never claim safety ("안전", "사고 없는 길"); show 낮음/보통/높음 plus concrete reasons, never a safety score; the driving screen always shows 시뮬레이션 · 실제 주행에 사용하지 마세요.
- The demo city is deterministic: `mock/demoCity` builds routes from a directed road graph in one pass, so steps, factors, time and distance agree by construction (`route-consistency.test.ts` guards this). Change `cityData.ts` and re-run the scenario tests; the expected winners are in `mock/presets.ts`.
- Storage keys all start with `newbiemap:v1:` (`services/repository`); "delete all" must clear every one of them. Nothing leaves the device and no sensitive values are logged.

**React Native Web pitfalls** (the web preview is the main way UI is checked here): RN-web ignores `accessibilityState`, so mirror state with `aria-checked` / `aria-disabled`; put `pointerEvents` in `style`, not as a prop; Korean text wraps per syllable unless `wordBreak: keep-all`; SVG `onPress` is unsupported, so hit-test with a `Pressable` overlay. UI state can be driven by `testID` (rendered as `data-testid`).

The web preview is not device verification. Native bundling was checked with `npx expo export`, but nothing has been run on iOS/Android devices or emulators.
