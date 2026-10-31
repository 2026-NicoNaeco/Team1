import type { GeoPoint } from '../domain/types';

/**
 * 지도 렌더링 계층의 계약.
 * 화면은 이 props 만 알고 어떤 지도 구현을 쓰는지 모른다. 실제 지도 SDK(예: 카카오맵·네이버맵·Google)로 바꿀 때는
 * 같은 props 를 받는 컴포넌트를 만들어 src/map/index.ts 의 MapView 만 교체하면 된다.
 * 좌표는 모두 위·경도(GeoPoint)다.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface MapRoute {
  id: string;
  /** 경로 식별 글자 (A, B, C) */
  label: string;
  path: GeoPoint[];
  selected: boolean;
  /** 지도 위 칩에 보이는 문구. 예: "A · 21분". 없으면 칩을 그리지 않는다. */
  chipText?: string;
  /** 주행 중 이미 지나온 거리(m). 있으면 그 부분을 흐리게 그린다 */
  traveledM?: number;
}

export type MapMarkerKind = 'origin' | 'destination' | 'vehicle';

export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  point: GeoPoint;
  /** vehicle 의 진행 방위(진북 기준 시계 방향) */
  headingDeg?: number;
  label?: string;
}

/**
 * 카메라 요청. key 가 바뀔 때만 새 요청으로 보고 부드럽게 이동한다 (follow 는 매번 즉시 따라간다).
 * - overview: 지도 전체 / fit: 주어진 점들이 보이는 영역 안에 들어오게 / follow: 한 점을 화면 중앙에
 * 시트나 검색창에 가려진 부분은 MapAdapterProps.insets 로 알려 주므로, 보이는 영역 기준으로 배치한다.
 */
export type CameraRequest =
  | { type: 'overview'; key: string }
  | { type: 'fit'; key: string; points: GeoPoint[] }
  | { type: 'follow'; key: string; point: GeoPoint; scale?: number };

export interface MapAdapterProps {
  routes: MapRoute[];
  markers: MapMarker[];
  camera: CameraRequest;
  /** 상단 검색창·하단 시트처럼 지도를 가리는 영역. 경로와 컨트롤은 이 안쪽에 배치된다. */
  insets?: Insets;
  onRoutePress?: (routeId: string) => void;
  /** false 면 끌기·확대 제스처와 확대/축소 버튼을 끈다 (주행 중) */
  interactive?: boolean;
  /** 접근성: 지도 대신 목록 등으로 읽을 수 있는 요약 */
  accessibilityLabel: string;
  testID?: string;
}
