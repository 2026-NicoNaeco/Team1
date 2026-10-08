import type { LocalPoint } from '../../domain/geo';
import { getDecorTiles, type DecorTile } from '../demoCity/decor';
import { COMPOUNDS, PARKS, PONDS, RIVER, ROAD_STROKES } from '../demoCity/mapLayers';

function distToSegment(q: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

const distToPolyline = (q: LocalPoint, line: readonly LocalPoint[]) => {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(q, line[i - 1]!, line[i]!));
  return best;
};

function inPolygon(q: LocalPoint, poly: readonly LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** "M x yL x y" 로 이어 붙인 골목 경로에서 선분 목록을 꺼낸다 */
function segmentsOf(tile: DecorTile): Array<[LocalPoint, LocalPoint]> {
  const out: Array<[LocalPoint, LocalPoint]> = [];
  const re = /M(-?\d+) (-?\d+)L(-?\d+) (-?\d+)/g;
  for (const m of tile.streets.matchAll(re)) {
    out.push([
      { x: Number(m[1]), y: Number(m[2]) },
      { x: Number(m[3]), y: Number(m[4]) },
    ]);
  }
  return out;
}

/** "M x yh w v h h -w z" 로 이어 붙인 건물 경로에서 사각형 중심을 꺼낸다 */
function buildingCenters(tile: DecorTile): LocalPoint[] {
  const out: LocalPoint[] = [];
  const re = /M(-?\d+) (-?\d+)h(-?\d+)v(-?\d+)h-?\d+z/g;
  for (const m of tile.buildings.matchAll(re)) {
    out.push({ x: Number(m[1]) + Number(m[3]) / 2, y: Number(m[2]) + Number(m[4]) / 2 });
  }
  return out;
}

describe('지도 장식 배경 (골목·건물)', () => {
  const tiles = getDecorTiles();
  const segments = tiles.flatMap(segmentsOf);
  const centers = tiles.flatMap(buildingCenters);

  it('골목과 건물이 충분히 만들어진다', () => {
    expect(tiles.length).toBeGreaterThan(10);
    expect(segments.length).toBeGreaterThan(300);
    expect(centers.length).toBeGreaterThan(600);
  });

  it('언제나 같은 모양이다 (정해진 난수)', () => {
    let again: DecorTile[] = [];
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      again = (require('../demoCity/decor') as typeof import('../demoCity/decor')).getDecorTiles();
    });
    expect(again.length).toBe(tiles.length);
    expect(again.map((t) => t.streets.length)).toEqual(tiles.map((t) => t.streets.length));
    expect(again.map((t) => t.buildings.length)).toEqual(tiles.map((t) => t.buildings.length));
  });

  it('골목은 강·공원·연못·시설 부지 안으로 들어가지 않는다', () => {
    const bad = segments.filter(([a, b]) => {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return (
        distToPolyline(mid, RIVER.line) < RIVER.width / 2 ||
        PARKS.some((p) => inPolygon(mid, p)) ||
        PONDS.some((p) => inPolygon(mid, p)) ||
        COMPOUNDS.some((c) => inPolygon(mid, c.points))
      );
    });
    expect(bad).toHaveLength(0);
  });

  it('건물은 주요 도로 위에 올라가지 않는다', () => {
    const roads = ROAD_STROKES.map((s) => s.points);
    const bad = centers.filter((c) => roads.some((line) => distToPolyline(c, line) < 25));
    expect(bad).toHaveLength(0);
  });

  it('건물은 강과 공원 위에 올라가지 않는다', () => {
    const bad = centers.filter(
      (c) => distToPolyline(c, RIVER.line) < RIVER.width / 2 || PARKS.some((p) => inPolygon(c, p)) || PONDS.some((p) => inPolygon(c, p)),
    );
    expect(bad).toHaveLength(0);
  });
});
