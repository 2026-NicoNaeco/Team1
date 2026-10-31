import type { LocalPoint } from '../../domain/geo';
import type { RoadClass } from '../../domain/types';
import type { CityData, CityNode, HopAttrs, TrafficLevel, TransitionMeta } from './cityTypes';

export interface EdgeAttrs {
  traffic: TrafficLevel;
  trafficUnknown: boolean;
  narrow: boolean;
  unpaved: boolean;
  protectedZone?: HopAttrs['protectedZone'];
  accident: 'yes' | 'no' | 'unknown';
  sharpCurves: number;
  toll: number;
  extraSignals: number;
  restricted: boolean;
  restrictedNote?: string;
}

export interface GraphEdge {
  id: string;
  roadId: string;
  roadName: string;
  cls: RoadClass;
  lanes: number;
  speedKph: number;
  from: string;
  to: string;
  /** from → to 방향의 형상 (양 끝점 포함) */
  shape: LocalPoint[];
  lengthM: number;
  startBearing: number;
  endBearing: number;
  attrs: EdgeAttrs;
}

export interface CityGraph {
  nodes: Map<string, CityNode>;
  edges: Map<string, GraphEdge>;
  out: Map<string, GraphEdge[]>;
  /** 연결된 이웃 노드 수 (3 이상이면 교차로) */
  degree: Map<string, number>;
  transitions: Record<string, TransitionMeta>;
}

/** 진북 기준 시계 방향 방위각 (국소 평면 좌표) */
export function localBearing(a: LocalPoint, b: LocalPoint): number {
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}

function polylineLength(points: readonly LocalPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

function normalizeAttrs(hop: HopAttrs | undefined): EdgeAttrs {
  return {
    traffic: hop?.traffic ?? 0,
    trafficUnknown: hop?.trafficUnknown ?? false,
    narrow: hop?.narrow ?? false,
    unpaved: hop?.unpaved ?? false,
    protectedZone: hop?.protectedZone,
    accident: hop?.accident ?? 'no',
    sharpCurves: hop?.sharpCurves ?? 0,
    toll: hop?.toll ?? 0,
    extraSignals: hop?.extraSignals ?? 0,
    restricted: hop?.restricted ?? false,
    restrictedNote: hop?.restrictedNote,
  };
}

export function buildGraph(data: CityData): CityGraph {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map<string, GraphEdge>();
  const out = new Map<string, GraphEdge[]>();
  const neighbors = new Map<string, Set<string>>();

  const addEdge = (edge: GraphEdge) => {
    edges.set(edge.id, edge);
    if (!out.has(edge.from)) out.set(edge.from, []);
    out.get(edge.from)!.push(edge);
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
    neighbors.get(edge.from)!.add(edge.to);
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
    neighbors.get(edge.to)!.add(edge.from);
  };

  for (const road of data.roads) {
    for (let i = 0; i < road.nodes.length - 1; i++) {
      const aId = road.nodes[i]!;
      const bId = road.nodes[i + 1]!;
      const a = nodes.get(aId);
      const b = nodes.get(bId);
      if (!a || !b) throw new Error(`도로 ${road.id}: 알 수 없는 노드 ${aId} 또는 ${bId}`);
      const hop = road.hops?.[`${aId}-${bId}`] ?? road.hops?.[`${bId}-${aId}`];
      const via = (hop?.via ?? []).map(([x, y]): LocalPoint => ({ x, y }));
      const forward: LocalPoint[] = [{ x: a.x, y: a.y }, ...via, { x: b.x, y: b.y }];
      const attrs = normalizeAttrs(hop);

      const make = (id: string, from: string, to: string, shape: LocalPoint[]): GraphEdge => ({
        id,
        roadId: road.id,
        roadName: road.name,
        cls: road.cls,
        lanes: road.lanes,
        speedKph: road.speedKph,
        from,
        to,
        shape,
        lengthM: polylineLength(shape),
        startBearing: localBearing(shape[0]!, shape[1]!),
        endBearing: localBearing(shape[shape.length - 2]!, shape[shape.length - 1]!),
        attrs,
      });

      addEdge(make(`${road.id}:${i}`, aId, bId, forward));
      if (!road.oneWay) addEdge(make(`${road.id}:${i}r`, bId, aId, [...forward].reverse()));
    }
  }

  const degree = new Map<string, number>();
  for (const [id, set] of neighbors) degree.set(id, set.size);

  return { nodes, edges, out, degree, transitions: data.transitions };
}

/** 데이터 정의가 서로 모순되지 않는지 확인한다 (테스트에서 사용) */
export function validateCity(data: CityData): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of data.nodes) {
    if (ids.has(n.id)) problems.push(`중복 노드 ${n.id}`);
    ids.add(n.id);
  }
  for (const road of data.roads) {
    for (const id of road.nodes) if (!ids.has(id)) problems.push(`도로 ${road.id}: 없는 노드 ${id}`);
    const pairs = new Set<string>();
    for (let i = 0; i < road.nodes.length - 1; i++) {
      pairs.add(`${road.nodes[i]}-${road.nodes[i + 1]}`);
      pairs.add(`${road.nodes[i + 1]}-${road.nodes[i]}`);
    }
    for (const key of Object.keys(road.hops ?? {})) {
      if (!pairs.has(key)) problems.push(`도로 ${road.id}: 연속하지 않은 구간 속성 ${key}`);
    }
  }
  for (const key of Object.keys(data.transitions)) {
    const parts = key.split('>');
    if (parts.length !== 3 || parts.some((p) => !ids.has(p))) problems.push(`잘못된 전환 키 ${key}`);
  }
  return problems;
}
