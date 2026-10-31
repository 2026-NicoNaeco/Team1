import type { LocalPoint } from '../domain/geo';

function distanceToSegment(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolyline(p: LocalPoint, line: readonly LocalPoint[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distanceToSegment(p, line[i - 1]!, line[i]!));
  return best;
}

/** 경로 위에서 길이 비율(0~1) 지점의 좌표 */
export function pointAtFraction(line: readonly LocalPoint[], fraction: number): LocalPoint {
  const lengths: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  }
  const target = (lengths[lengths.length - 1] ?? 0) * fraction;
  let i = 1;
  while (i < line.length - 1 && lengths[i]! < target) i++;
  const a = line[i - 1]!;
  const b = line[i]!;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span <= 0 ? 0 : (target - lengths[i - 1]!) / span;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const FRACTIONS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

/**
 * 경로 이름표(칩)를 둘 위치를 고른다.
 * 다른 경로와 겹치는 구간을 피해 가장 멀리 떨어진 지점을 택하고, 서로 다른 경로의 칩끼리도 멀리 떨어뜨린다.
 * 경로가 같은 입력이면 같은 위치가 나온다 (확대·이동해도 칩이 경로 위에서 움직이지 않는다).
 */
export function chooseChipAnchors(routes: ReadonlyArray<{ id: string; points: readonly LocalPoint[] }>): Record<string, LocalPoint> {
  const anchors: Record<string, LocalPoint> = {};
  for (const route of routes) {
    if (route.points.length < 2) continue;
    let best: LocalPoint | null = null;
    let bestScore = -Infinity;
    for (const f of FRACTIONS) {
      const candidate = pointAtFraction(route.points, f);
      let fromOthers = 2000;
      for (const other of routes) {
        if (other.id === route.id) continue;
        fromOthers = Math.min(fromOthers, distanceToPolyline(candidate, other.points));
      }
      let fromChips = 1500;
      for (const [id, anchor] of Object.entries(anchors)) {
        if (id !== route.id) fromChips = Math.min(fromChips, Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y));
      }
      const score = fromOthers + 0.6 * fromChips - 600 * Math.abs(f - 0.5);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) anchors[route.id] = best;
  }
  return anchors;
}

/** 경로를 distance(m) 지점에서 둘로 나눈다 (지나온 부분 / 남은 부분) */
export function splitPolyline(line: readonly LocalPoint[], distance: number): [LocalPoint[], LocalPoint[]] {
  if (distance <= 0) return [[], [...line]];
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + seg >= distance) {
      const t = seg === 0 ? 0 : (distance - travelled) / seg;
      const split = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return [[...line.slice(0, i), split], [split, ...line.slice(i)]];
    }
    travelled += seg;
  }
  return [[...line], []];
}

/** 점에서 maxDistance(m) 안에 있는 가장 가까운 경로 id. 없으면 null */
export function nearestRoute(
  routes: ReadonlyArray<{ id: string; points: readonly LocalPoint[] }>,
  point: LocalPoint,
  maxDistance: number,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance;
  for (const route of routes) {
    const d = distanceToPolyline(point, route.points);
    if (d <= bestDistance) {
      best = route.id;
      bestDistance = d;
    }
  }
  return best;
}

/** 화면에 놓인 경로 칩 하나 (중심 좌표와 반 너비·반 높이, px) */
export interface PlacedChip {
  id: string;
  selected: boolean;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

/**
 * 지도가 작게 보이면 경로 칩끼리 화면에서 겹친다. 가로로 겹치는 칩끼리는 세로로 비켜 쌓는다.
 * 1) 위에 있는 칩부터, 앞서 놓은 칩과 가로로 겹치면 그 아래로 내린다.
 * 2) 아래에 있는 칩부터, 보이는 범위(bounds) 아래로 넘친 만큼 위로 올린다 (아래 칩과 다시 겹치지 않게).
 * 칩 위치는 선택 여부와 상관없이 정해지므로 다른 경로를 골라도 칩이 자리를 바꾸지 않는다.
 * 범위가 칩을 다 담을 만큼 넓지 않으면 범위 안에 둔 채 겹칠 수 있다 (그때도 선택한 칩이 맨 위에 그려진다).
 * 칩별 세로 이동량(px)을 돌려준다.
 */
export function spreadChips(chips: readonly PlacedChip[], bounds: { top: number; bottom: number }, gap = 4): Record<string, number> {
  const order = [...chips].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const xOverlap = (a: PlacedChip, b: PlacedChip) => a.x - a.halfW < b.x + b.halfW && a.x + a.halfW > b.x - b.halfW;
  const ys: number[] = order.map((c) => c.y);

  for (let i = 0; i < order.length; i++) {
    const chip = order[i]!;
    for (let j = 0; j < i; j++) {
      const prev = order[j]!;
      if (xOverlap(prev, chip)) ys[i] = Math.max(ys[i]!, ys[j]! + prev.halfH + gap + chip.halfH);
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const chip = order[i]!;
    let y = Math.min(ys[i]!, bounds.bottom - chip.halfH);
    for (let j = i + 1; j < order.length; j++) {
      const next = order[j]!;
      if (xOverlap(next, chip)) y = Math.min(y, ys[j]! - next.halfH - gap - chip.halfH);
    }
    ys[i] = Math.max(y, bounds.top + chip.halfH);
  }

  const offsets: Record<string, number> = {};
  order.forEach((chip, i) => {
    offsets[chip.id] = ys[i]! - chip.y;
  });
  return offsets;
}
