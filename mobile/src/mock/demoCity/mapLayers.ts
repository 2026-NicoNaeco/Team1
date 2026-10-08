import type { LocalPoint } from '../../domain/geo';
import type { RoadClass } from '../../domain/types';
import { CITY } from './cityData';

/**
 * 데모 지도의 배경 데이터 (가상의 지역).
 * 도로는 경로 계산에 쓰는 도로망(cityData)과 같은 데이터에서 그린다.
 * 그래서 지도에 그려진 길과 경로·안내가 서로 어긋나지 않는다. 물·공원 등은 장식용 배경이다.
 */

export const WORLD_BOUNDS = { minX: -700, maxX: 10900, minY: -900, maxY: 7500 };

const p = (x: number, y: number): LocalPoint => ({ x, y });

/** 물빛천 중심선과 폭(m). 다리가 놓인 곳(y=1000, 3000, 4600)과 중심이 맞는다. */
export const RIVER = {
  width: 280,
  line: [p(4350, 7600), p(4300, 6200), p(4180, 5400), p(4150, 4600), p(4130, 3800), p(4100, 3000), p(4130, 2100), p(4100, 1000), p(3980, -100), p(3900, -900)],
};

export const PARKS: LocalPoint[][] = [
  // 푸른공원
  [p(5050, 4830), p(6500, 4830), p(6650, 5450), p(6100, 5900), p(5200, 5800)],
  // 물빛천 둔치 녹지
  [p(4290, 5300), p(4650, 5300), p(4700, 6900), p(4400, 6900)],
  [p(3550, 3200), p(3880, 3300), p(3860, 4300), p(3560, 4400)],
];

export const PONDS: LocalPoint[][] = [[p(5900, 5200), p(6250, 5150), p(6350, 5450), p(6000, 5550), p(5800, 5400)]];

/** 시설 부지 (대학·병원·학교·시장 등) */
export const COMPOUNDS: Array<{ id: string; kind: 'campus' | 'block'; points: LocalPoint[] }> = [
  { id: 'campus', kind: 'campus', points: [p(8420, 5120), p(9420, 5120), p(9480, 6120), p(8420, 6100)] },
  { id: 'market', kind: 'block', points: [p(5880, 2620), p(6620, 2620), p(6620, 3300), p(5880, 3300)] },
  { id: 'hospital', kind: 'block', points: [p(7880, 1480), p(8320, 1480), p(8320, 1920), p(7880, 1920)] },
  { id: 'school', kind: 'block', points: [p(1480, 3220), p(1900, 3220), p(1900, 3700), p(1480, 3700)] },
  { id: 'station', kind: 'block', points: [p(560, 1080), p(880, 1080), p(880, 1480), p(560, 1480)] },
];

export type LabelKind = 'district' | 'place' | 'road' | 'water' | 'note';

export interface MapLabel {
  text: string;
  at: LocalPoint;
  kind: LabelKind;
  /** 작을수록 우선해서 그린다 */
  priority: number;
  /** 이 확대율(px/m) 이상일 때만 보인다 */
  minScale: number;
}

export const LABELS: MapLabel[] = [
  { text: '새싹동', at: p(2050, 2250), kind: 'district', priority: 5, minScale: 0 },
  { text: '중앙동', at: p(5550, 2150), kind: 'district', priority: 5, minScale: 0 },
  { text: '푸른동', at: p(2800, 5450), kind: 'district', priority: 5, minScale: 0 },
  { text: '한빛동', at: p(7600, 5950), kind: 'district', priority: 5, minScale: 0 },
  { text: '하늘동', at: p(7100, 2350), kind: 'district', priority: 6, minScale: 0 },
  { text: '새싹역', at: p(1000, 960), kind: 'place', priority: 1, minScale: 0 },
  { text: '한빛대학교', at: p(8950, 5760), kind: 'place', priority: 1, minScale: 0 },
  { text: '푸른공원', at: p(5750, 5620), kind: 'place', priority: 2, minScale: 0 },
  { text: '중앙시장', at: p(6250, 3450), kind: 'place', priority: 2, minScale: 0 },
  { text: '하늘병원', at: p(8100, 1330), kind: 'place', priority: 3, minScale: 0.045 },
  { text: '별빛초', at: p(1700, 3830), kind: 'place', priority: 3, minScale: 0.045 },
  { text: '새싹마트', at: p(1700, 1130), kind: 'place', priority: 4, minScale: 0.1 },
  { text: '물빛천', at: p(4100, 3750), kind: 'water', priority: 3, minScale: 0 },
  { text: '중앙대로', at: p(2850, 1620), kind: 'road', priority: 4, minScale: 0.075 },
  { text: '한빛대로', at: p(7620, 4210), kind: 'road', priority: 4, minScale: 0.075 },
  { text: '푸른길', at: p(2750, 4730), kind: 'road', priority: 4, minScale: 0.075 },
  { text: '행복로', at: p(1260, 2800), kind: 'road', priority: 4, minScale: 0.075 },
  { text: '동부고속도로(가상)', at: p(6300, 1000), kind: 'road', priority: 3, minScale: 0.05 },
  { text: '공사 중 · 통행 제한', at: p(4100, 1230), kind: 'note', priority: 3, minScale: 0.08 },
];

export interface RoadStroke {
  cls: RoadClass;
  points: LocalPoint[];
  restricted: boolean;
}

/** 지도에 그릴 도로 선 (양방향 도로는 한 번만) */
export const ROAD_STROKES: RoadStroke[] = (() => {
  const nodes = new Map(CITY.nodes.map((n) => [n.id, n]));
  const strokes: RoadStroke[] = [];
  for (const road of CITY.roads) {
    for (let i = 0; i < road.nodes.length - 1; i++) {
      const a = nodes.get(road.nodes[i]!)!;
      const b = nodes.get(road.nodes[i + 1]!)!;
      const hop = road.hops?.[`${a.id}-${b.id}`] ?? road.hops?.[`${b.id}-${a.id}`];
      const via = (hop?.via ?? []).map(([x, y]) => p(x, y));
      strokes.push({ cls: road.cls, points: [p(a.x, a.y), ...via, p(b.x, b.y)], restricted: hop?.restricted ?? false });
    }
  }
  return strokes;
})();

/** 도로 폭(m)과 화면에서 허용하는 최소·최대 폭(px) */
export const ROAD_WIDTH: Record<RoadClass, { meters: number; minPx: number; maxPx: number }> = {
  highway: { meters: 30, minPx: 5, maxPx: 16 },
  ramp: { meters: 16, minPx: 3, maxPx: 9 },
  arterial: { meters: 26, minPx: 4.6, maxPx: 15 },
  collector: { meters: 18, minPx: 3.4, maxPx: 11 },
  local: { meters: 11, minPx: 2.4, maxPx: 7 },
};

/** 그리는 순서 (아래에서 위로) */
export const ROAD_DRAW_ORDER: RoadClass[] = ['local', 'collector', 'arterial', 'ramp', 'highway'];
