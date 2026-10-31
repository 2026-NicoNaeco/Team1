import type { GeoPoint } from './types';

/**
 * Google encoded polyline 해독 (정밀도 5). 백엔드 `routing/polyline.py` 와 같은 형식이다.
 * 잘못된 문자열이면 Error 를 던진다 (중간에서 끊긴 좌표를 경로로 쓰지 않는다).
 */
export function decodePolyline(encoded: string, precision = 5): GeoPoint[] {
  const factor = 10 ** precision;
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('잘못된 polyline 문자열이에요.');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('잘못된 polyline 문자열이에요.');
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}
