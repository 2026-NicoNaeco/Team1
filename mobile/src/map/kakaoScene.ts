import { fromLocal, toLocal } from '../domain/geo';
import type { GeoPoint } from '../domain/types';
import { chooseChipAnchors, splitPolyline } from './chipAnchor';
import { NO_INSETS, type Insets, type MapAdapterProps, type MapMarkerKind, type MapRoute } from './MapAdapter';

/**
 * 카카오 지도 페이지(WebView)에 보내는 장면 데이터.
 * 지나온 구간 나누기·칩 위치 고르기는 여기서(RN 쪽) 끝내고, 페이지는 받은 그대로 그리기만 한다.
 * 좌표는 페이지로 보내기 쉽게 [위도, 경도] 배열로 바꾼다.
 */
export type LatLng = [number, number];

export interface SceneRoute {
  id: string;
  selected: boolean;
  chipText?: string;
  /** 지나온 구간(흐리게). 없으면 빈 배열 */
  traveled: LatLng[];
  rest: LatLng[];
  chip?: LatLng;
}

export interface SceneMarker {
  id: string;
  kind: MapMarkerKind;
  point: LatLng;
  headingDeg: number;
}

export type SceneCamera =
  | { type: 'follow'; point: LatLng; level: number }
  /** sig 가 바뀔 때만 다시 맞춘다. points 가 하나면 그 점을 가운데에 둔다 */
  | { type: 'bounds'; sig: string; points: LatLng[] };

export interface KakaoScene {
  routes: SceneRoute[];
  markers: SceneMarker[];
  camera: SceneCamera;
  insets: Insets;
  interactive: boolean;
}

const toLatLng = (p: GeoPoint): LatLng => [p.lat, p.lng];

// 카카오 지도 레벨 1 의 해상도(m/px). 레벨이 하나 오를 때마다 두 배가 된다
const LEVEL1_M_PER_PX = 0.25;
const MAX_LEVEL = 14;
const FOLLOW_DEFAULT_SCALE = 0.2;

/** 화면 축척(px/m)에 가장 가까운 카카오 지도 레벨 */
export function kakaoLevelForScale(scalePxPerM: number): number {
  if (!(scalePxPerM > 0)) return MAX_LEVEL;
  const level = Math.round(1 + Math.log2(1 / scalePxPerM / LEVEL1_M_PER_PX));
  return Math.min(MAX_LEVEL, Math.max(1, level));
}

/** 경로 칩 위치. 경로 모양이 같으면 같은 결과라서, 주행 중 매 틱이 아니라 경로가 바뀔 때만 계산하면 된다 */
export function chipAnchorsGeo(routes: readonly MapRoute[]): Record<string, GeoPoint> {
  const anchor = routes[0]?.path[0];
  if (!anchor) return {};
  const local = chooseChipAnchors(routes.map((r) => ({ id: r.id, points: r.path.map((p) => toLocal(p, anchor)) })));
  const out: Record<string, GeoPoint> = {};
  for (const [id, p] of Object.entries(local)) out[id] = fromLocal(p, anchor);
  return out;
}

function splitTraveled(path: readonly GeoPoint[], traveledM: number | undefined): [GeoPoint[], GeoPoint[]] {
  const anchor = path[0];
  if (!anchor || !traveledM) return [[], [...path]];
  const [traveled, rest] = splitPolyline(path.map((p) => toLocal(p, anchor)), traveledM);
  return [traveled.map((p) => fromLocal(p, anchor)), rest.map((p) => fromLocal(p, anchor))];
}

const pointsSig = (points: readonly GeoPoint[]) => {
  const first = points[0];
  const last = points[points.length - 1];
  const f = (p: GeoPoint | undefined) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-');
  return `${points.length}:${f(first)}:${f(last)}`;
};

export function buildKakaoScene(
  { routes, markers, camera, insets = NO_INSETS, interactive = true }: Pick<MapAdapterProps, 'routes' | 'markers' | 'camera' | 'insets' | 'interactive'>,
  chipAnchors: Record<string, GeoPoint>,
): KakaoScene {
  let sceneCamera: SceneCamera;
  if (camera.type === 'follow') {
    sceneCamera = { type: 'follow', point: toLatLng(camera.point), level: kakaoLevelForScale(camera.scale ?? FOLLOW_DEFAULT_SCALE) };
  } else {
    const points = camera.type === 'fit' ? camera.points : [...routes.flatMap((r) => r.path), ...markers.map((m) => m.point)];
    // 시트 높이가 바뀌거나(insets) 보여 줄 점이 바뀌어도 다시 맞춘다 (임시 지도와 같은 동작)
    const sig = [camera.key, insets.top, insets.right, insets.bottom, insets.left, pointsSig(points)].join('|');
    sceneCamera = { type: 'bounds', sig, points: points.map(toLatLng) };
  }

  return {
    routes: routes.map((r) => {
      const [traveled, rest] = splitTraveled(r.path, r.traveledM);
      const chip = r.chipText ? chipAnchors[r.id] : undefined;
      return {
        id: r.id,
        selected: r.selected,
        chipText: r.chipText,
        traveled: traveled.map(toLatLng),
        rest: rest.map(toLatLng),
        chip: chip ? toLatLng(chip) : undefined,
      };
    }),
    markers: markers.map((m) => ({ id: m.id, kind: m.kind, point: toLatLng(m.point), headingDeg: m.headingDeg ?? 0 })),
    camera: sceneCamera,
    insets,
    interactive,
  };
}
