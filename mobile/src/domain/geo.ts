import type { GeoPoint } from './types';

const DEG = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_008.8;

export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 진북 기준 시계 방향 방위각 (0~360) */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const dLng = (b.lng - a.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(b.lat * DEG);
  const x =
    Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) -
    Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** 진행 방향이 from → to 로 바뀔 때의 회전 각도. 양수는 우회전, 음수는 좌회전 (-180~180) */
export function signedTurnDeg(fromBearing: number, toBearing: number): number {
  let d = (toBearing - fromBearing) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function pathLengthM(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1]!, points[i]!);
  return total;
}

/** 각 꼭짓점까지의 누적 거리. 첫 값은 0 */
export function cumulativeDistances(points: readonly GeoPoint[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + haversineM(points[i - 1]!, points[i]!));
  return out;
}

export interface PathSample {
  point: GeoPoint;
  /** 이 지점에서의 진행 방위각 */
  bearing: number;
  segmentIndex: number;
}

/** 경로 시작점에서 distance(m) 만큼 떨어진 지점. 범위를 벗어나면 양 끝으로 고정한다. */
export function pointAlong(points: readonly GeoPoint[], cumulative: readonly number[], distance: number): PathSample {
  const last = points.length - 1;
  if (last <= 0) return { point: points[0]!, bearing: 0, segmentIndex: 0 };
  const d = Math.min(Math.max(distance, 0), cumulative[last]!);
  let i = 1;
  while (i < last && cumulative[i]! < d) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = cumulative[i]! - cumulative[i - 1]!;
  const t = span <= 0 ? 0 : (d - cumulative[i - 1]!) / span;
  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    bearing: bearingDeg(a, b),
    segmentIndex: i - 1,
  };
}

// ─────────── 국소 평면 좌표 (m). 데모 지도 렌더링과 모의 도로망 정의에 쓴다 ───────────

export interface LocalPoint {
  x: number;
  y: number;
}

/** haversineM 과 같은 구면 모델이라 변환한 좌표 사이의 거리가 평면 거리와 일치한다 */
const METERS_PER_DEG = EARTH_RADIUS_M * DEG;

export function toLocal(p: GeoPoint, anchor: GeoPoint): LocalPoint {
  return {
    x: (p.lng - anchor.lng) * METERS_PER_DEG * Math.cos(anchor.lat * DEG),
    y: (p.lat - anchor.lat) * METERS_PER_DEG,
  };
}

export function fromLocal(p: LocalPoint, anchor: GeoPoint): GeoPoint {
  return {
    lat: anchor.lat + p.y / METERS_PER_DEG,
    lng: anchor.lng + p.x / (METERS_PER_DEG * Math.cos(anchor.lat * DEG)),
  };
}
