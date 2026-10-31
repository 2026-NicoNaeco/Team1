import type { LocalPoint } from '../domain/geo';
import type { Insets } from './MapAdapter';

/** 카메라: 화면 중앙에 오는 세계 좌표(m)와 확대율(px/m). 지도는 항상 북쪽이 위다 (회전하지 않는다). */
export interface Camera {
  cx: number;
  cy: number;
  scale: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface ScaleLimits {
  min: number;
  max: number;
}

export function project(p: LocalPoint, cam: Camera, size: Size): LocalPoint {
  return { x: (p.x - cam.cx) * cam.scale + size.w / 2, y: size.h / 2 - (p.y - cam.cy) * cam.scale };
}

export function unproject(sx: number, sy: number, cam: Camera, size: Size): LocalPoint {
  return { x: cam.cx + (sx - size.w / 2) / cam.scale, y: cam.cy - (sy - size.h / 2) / cam.scale };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 점들이 insets 를 뺀 "보이는 영역" 안에 들어오는 카메라. 지나치게 확대되지 않도록 max 로 막는다. */
export function fitCamera(
  points: readonly LocalPoint[],
  size: Size,
  insets: Insets,
  limits: ScaleLimits,
  margin = 28,
): Camera {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const availW = Math.max(40, size.w - insets.left - insets.right - margin * 2);
  const availH = Math.max(40, size.h - insets.top - insets.bottom - margin * 2);
  const spanW = Math.max(maxX - minX, 1);
  const spanH = Math.max(maxY - minY, 1);
  const scale = clamp(Math.min(availW / spanW, availH / spanH), limits.min, limits.max);

  // 보이는 영역의 중심이 점들의 중심과 일치하도록 카메라 중심을 옮긴다
  const visibleCenterX = insets.left + (size.w - insets.left - insets.right) / 2;
  const visibleCenterY = insets.top + (size.h - insets.top - insets.bottom) / 2;
  const bx = (minX + maxX) / 2;
  const by = (minY + maxY) / 2;
  return {
    cx: bx - (visibleCenterX - size.w / 2) / scale,
    cy: by + (visibleCenterY - size.h / 2) / scale,
    scale,
  };
}

/** 한 점을 보이는 영역의 중앙에 두는 카메라 */
export function centerCamera(point: LocalPoint, scale: number, size: Size, insets: Insets): Camera {
  const visibleCenterX = insets.left + (size.w - insets.left - insets.right) / 2;
  const visibleCenterY = insets.top + (size.h - insets.top - insets.bottom) / 2;
  return {
    cx: point.x - (visibleCenterX - size.w / 2) / scale,
    cy: point.y + (visibleCenterY - size.h / 2) / scale,
    scale,
  };
}

/** 화면이 세계의 경계를 너무 벗어나지 않게 한다 */
export function clampCamera(cam: Camera, limits: ScaleLimits, bounds: { minX: number; maxX: number; minY: number; maxY: number }): Camera {
  return {
    scale: clamp(cam.scale, limits.min, limits.max),
    cx: clamp(cam.cx, bounds.minX, bounds.maxX),
    cy: clamp(cam.cy, bounds.minY, bounds.maxY),
  };
}

/** 확대율은 로그 비율로 보간해 확대·축소 속도가 일정하게 느껴지게 한다 */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    scale: Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t),
  };
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function sameCamera(a: Camera, b: Camera): boolean {
  return Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.scale / b.scale - 1) < 0.002;
}
