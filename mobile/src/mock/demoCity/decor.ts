import type { LocalPoint } from '../../domain/geo';
import { COMPOUNDS, PARKS, PONDS, RIVER, ROAD_STROKES } from './mapLayers';

/**
 * 지도를 실제 도시처럼 보이게 하는 장식 레이어 (경로 계산과 무관).
 * 주요 도로 사이를 채우는 골목과 건물 윗면을 정해진 난수로 만들어서, 같은 지도는 언제나 같은 모습이다.
 * 골목은 주요 도로와 나란히 겹치거나 강·공원·시설 부지 안으로 들어가지 않는다.
 */

export interface DecorTile {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 골목 선들을 한 번에 그리는 SVG 경로 (세계 좌표, m) */
  streets: string;
  /** 건물 윗면들을 한 번에 그리는 SVG 경로 (세계 좌표, m) */
  buildings: string;
}

const AREA = { minX: 0, maxX: 10600, minY: -400, maxY: 6900 };
const SPACING_X = 460;
const SPACING_Y = 430;
const TILE = 1500;

/** mulberry32: 작은 시드로 같은 난수열을 만든다 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p = (x: number, y: number): LocalPoint => ({ x, y });

function distToSegment(q: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

function distToPolyline(q: LocalPoint, line: readonly LocalPoint[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(q, line[i - 1]!, line[i]!));
  return best;
}

function inPolygon(q: LocalPoint, poly: readonly LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 다각형 안이거나 가장자리에서 margin(m) 안쪽이면 true */
function nearPolygon(q: LocalPoint, poly: readonly LocalPoint[], margin: number): boolean {
  if (inPolygon(q, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment(q, poly[i]!, poly[(i + 1) % poly.length]!) < margin) return true;
  }
  return false;
}

let cached: DecorTile[] | null = null;

export function getDecorTiles(): DecorTile[] {
  if (cached) return cached;
  const rng = seeded(20261008);
  const jitter = (amount: number) => (rng() - 0.5) * 2 * amount;

  /** 강·공원·연못·시설 부지처럼 골목과 건물이 들어가면 안 되는 곳 */
  const blocked = (q: LocalPoint): boolean =>
    distToPolyline(q, RIVER.line) < RIVER.width / 2 + 130 ||
    PARKS.some((poly) => nearPolygon(q, poly, 70)) ||
    PONDS.some((poly) => nearPolygon(q, poly, 70)) ||
    COMPOUNDS.some((c) => nearPolygon(q, c.points, 60));

  /** 주요 도로까지의 거리와 가장 가까운 도로 구간의 방향 */
  const nearestMain = (q: LocalPoint): { distance: number; angle: number } => {
    let best = Infinity;
    let angle = 0;
    for (const stroke of ROAD_STROKES) {
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1]!;
        const b = stroke.points[i]!;
        const d = distToSegment(q, a, b);
        if (d < best) {
          best = d;
          angle = Math.atan2(b.y - a.y, b.x - a.x);
        }
      }
    }
    return { distance: best, angle };
  };

  // 교차점: 격자에서 조금씩 어긋나게 해 자연스러운 골목 모양을 만든다
  const xs: number[] = [];
  for (let x = AREA.minX + 120; x <= AREA.maxX; x += SPACING_X) xs.push(x + jitter(55));
  const ys: number[] = [];
  for (let y = AREA.minY + 100; y <= AREA.maxY; y += SPACING_Y) ys.push(y + jitter(50));
  const grid: LocalPoint[][] = xs.map((x) => ys.map((y) => p(Math.round(x + jitter(9)), Math.round(y + jitter(9)))));

  const tileOf = (q: LocalPoint) => `${Math.floor((q.x - AREA.minX) / TILE)}:${Math.floor((q.y - AREA.minY) / TILE)}`;
  const tiles = new Map<string, { streets: string[]; buildings: string[]; ix: number; iy: number }>();
  const tileFor = (q: LocalPoint) => {
    const key = tileOf(q);
    let t = tiles.get(key);
    if (!t) {
      t = { streets: [], buildings: [], ix: Math.floor((q.x - AREA.minX) / TILE), iy: Math.floor((q.y - AREA.minY) / TILE) };
      tiles.set(key, t);
    }
    return t;
  };

  const keepStreet = (a: LocalPoint, b: LocalPoint): boolean => {
    const mid = p((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (blocked(a) || blocked(b) || blocked(mid)) return false;
    const main = nearestMain(mid);
    if (main.distance < 45) return false;
    if (main.distance < 150) {
      // 주요 도로와 거의 나란한 골목은 이중선처럼 보이므로 뺀다
      const own = Math.atan2(b.y - a.y, b.x - a.x);
      let diff = Math.abs(own - main.angle) % Math.PI;
      if (diff > Math.PI / 2) diff = Math.PI - diff;
      if (diff < (28 * Math.PI) / 180) return false;
    }
    return rng() > 0.16;
  };

  const addStreet = (a: LocalPoint, b: LocalPoint) => {
    if (!keepStreet(a, b)) return;
    tileFor(p((a.x + b.x) / 2, (a.y + b.y) / 2)).streets.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
  };

  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) {
      const here = grid[i]![j]!;
      const right = grid[i + 1]?.[j];
      const up = grid[i]?.[j + 1];
      if (right) addStreet(here, right);
      if (up) addStreet(here, up);
    }
  }

  // 건물: 골목으로 둘러싸인 구획마다 2~3×2~3 동. 주요 도로 위에 올라가는 건물은 뺀다
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const a = grid[i]![j]!;
      const b = grid[i + 1]![j]!;
      const c = grid[i + 1]![j + 1]!;
      const d = grid[i]![j + 1]!;
      const center = p((a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4);
      if (blocked(center)) continue;
      const width = Math.min(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - d.x, c.y - d.y)) - 84;
      const height = Math.min(Math.hypot(d.x - a.x, d.y - a.y), Math.hypot(c.x - b.x, c.y - b.y)) - 84;
      if (width < 100 || height < 100) continue;
      const nx = width > 280 ? 3 : 2;
      const ny = height > 260 ? 3 : 2;
      const cellW = width / nx;
      const cellH = height / ny;
      const left = center.x - width / 2;
      const bottom = center.y - height / 2;
      for (let ix = 0; ix < nx; ix++) {
        for (let iy = 0; iy < ny; iy++) {
          if (rng() < 0.14) continue;
          const bw = Math.round(cellW - 14 - rng() * 22);
          const bh = Math.round(cellH - 14 - rng() * 22);
          const bx = Math.round(left + ix * cellW + (cellW - bw) / 2 + jitter(4));
          const by = Math.round(bottom + iy * cellH + (cellH - bh) / 2 + jitter(4));
          const corners = [p(bx, by), p(bx + bw, by), p(bx + bw, by + bh), p(bx, by + bh), p(bx + bw / 2, by + bh / 2)];
          if (corners.some((q) => blocked(q) || nearestMain(q).distance < 34)) continue;
          tileFor(center).buildings.push(`M${bx} ${by}h${bw}v${bh}h${-bw}z`);
        }
      }
    }
  }

  cached = [...tiles.values()].map((t) => ({
    minX: AREA.minX + t.ix * TILE,
    minY: AREA.minY + t.iy * TILE,
    maxX: AREA.minX + (t.ix + 1) * TILE,
    maxY: AREA.minY + (t.iy + 1) * TILE,
    streets: t.streets.join(''),
    buildings: t.buildings.join(''),
  }));
  return cached;
}
