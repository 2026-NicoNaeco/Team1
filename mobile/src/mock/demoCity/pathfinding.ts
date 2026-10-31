import type { CityGraph, GraphEdge } from './graph';
import { classifyTransition, edgeTravelS, transitionDelayS, type Transition } from './transition';

/**
 * 모의 후보 생성 규칙 (실제 경로 엔진이 아니다).
 * 성격이 다른 세 가지 비용으로 같은 도로망을 탐색해 서로 다른 후보를 얻는다.
 * - fastest : 소요 시간만 본다
 * - simplest: 회전·차로 변경·합류 등 조작이 적은 길을 우선한다
 * - highway : 고속도로 계통 도로의 시간을 절반으로 쳐서 고속도로를 우선한다
 */
export type Persona = 'fastest' | 'simplest' | 'highway';

export const PERSONAS: Persona[] = ['fastest', 'simplest', 'highway'];

function edgeCost(persona: Persona, edge: GraphEdge): number {
  const time = edgeTravelS(edge);
  return persona === 'highway' && (edge.cls === 'highway' || edge.cls === 'ramp') ? time * 0.5 : time;
}

function transitionCost(persona: Persona, prev: GraphEdge, tr: Transition): number {
  const delay = transitionDelayS(prev, tr);
  if (persona !== 'simplest') return delay;
  let penalty = 0;
  if (tr.uTurn) penalty += 240;
  else if (tr.unprotectedLeft) penalty += 150;
  else if (tr.isTurn) penalty += 90;
  if (tr.roundabout) penalty += 90;
  if (tr.mergeDiverge) penalty += 150;
  penalty += tr.laneChanges * 80;
  if (tr.signal) penalty += 15;
  return delay + penalty;
}

class MinHeap<T> {
  private items: Array<{ key: number; value: T }> = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, value: T): void {
    const items = this.items;
    items.push({ key, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.key <= items[i]!.key) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): { key: number; value: T } | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l]!.key < items[m]!.key) m = l;
        if (r < items.length && items[r]!.key < items[m]!.key) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i]!, items[m]!];
        i = m;
      }
    }
    return top;
  }
}

export interface FindPathOptions {
  persona: Persona;
  /** false 면 통행 제한 구간도 지나는 경로를 찾는다 (제외된 경로를 안내하기 위한 비교용) */
  honorRestrictions: boolean;
}

/** 구간(엣지) 단위로 탐색해 회전 비용을 정확히 반영한다. 경로가 없으면 null */
export function findPath(
  graph: CityGraph,
  originNode: string,
  destNode: string,
  { persona, honorRestrictions }: FindPathOptions,
): GraphEdge[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const heap = new MinHeap<string>();
  const usable = (e: GraphEdge) => !(honorRestrictions && e.attrs.restricted);

  for (const e of graph.out.get(originNode) ?? []) {
    if (!usable(e)) continue;
    const cost = edgeCost(persona, e);
    if (cost < (dist.get(e.id) ?? Infinity)) {
      dist.set(e.id, cost);
      prev.set(e.id, null);
      heap.push(cost, e.id);
    }
  }

  while (heap.size > 0) {
    const { key, value: edgeId } = heap.pop()!;
    if (key > (dist.get(edgeId) ?? Infinity)) continue;
    const edge = graph.edges.get(edgeId)!;

    if (edge.to === destNode) {
      const path: GraphEdge[] = [];
      let cursor: string | null = edgeId;
      while (cursor) {
        path.push(graph.edges.get(cursor)!);
        cursor = prev.get(cursor) ?? null;
      }
      return path.reverse();
    }

    for (const next of graph.out.get(edge.to) ?? []) {
      if (!usable(next)) continue;
      // 같은 도로로 곧바로 되돌아가는 것은 허용하지 않는다 (유턴은 별도의 유턴 구간으로만 가능)
      if (next.to === edge.from && next.roadId === edge.roadId) continue;
      const tr = classifyTransition(graph, edge, next);
      const cost = key + transitionCost(persona, edge, tr) + edgeCost(persona, next);
      if (cost < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, cost);
        prev.set(next.id, edgeId);
        heap.push(cost, next.id);
      }
    }
  }
  return null;
}

/** 방향과 무관하게 같은 도로 구간인지 비교하기 위한 키 */
function undirectedKey(edge: GraphEdge): string {
  return edge.id.endsWith('r') ? edge.id.slice(0, -1) : edge.id;
}

/** 두 경로가 지나는 구간의 겹침 정도 (0~1) */
export function pathSimilarity(a: readonly GraphEdge[], b: readonly GraphEdge[]): number {
  const setA = new Set(a.map(undirectedKey));
  const setB = new Set(b.map(undirectedKey));
  let shared = 0;
  for (const k of setA) if (setB.has(k)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 1 : shared / union;
}

export function restrictedEdges(path: readonly GraphEdge[]): GraphEdge[] {
  return path.filter((e) => e.attrs.restricted);
}
