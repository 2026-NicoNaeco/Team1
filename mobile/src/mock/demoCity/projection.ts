import { fromLocal, toLocal, type LocalPoint } from '../../domain/geo';
import type { GeoPoint } from '../../domain/types';

/**
 * 데모 도시의 좌표계.
 * 위도·경도 (0, 0) 부근은 바다 한가운데라서 실제 지명이나 도로와 겹치지 않는다.
 * 도시를 이 점을 원점으로 한 평면(m)에 그린 뒤 위·경도로 바꿔 도메인에 내보낸다.
 */
export const DEMO_ANCHOR: GeoPoint = { lat: 0, lng: 0 };

export function localToGeo(p: LocalPoint): GeoPoint {
  return fromLocal(p, DEMO_ANCHOR);
}

export function geoToLocal(p: GeoPoint): LocalPoint {
  return toLocal(p, DEMO_ANCHOR);
}
