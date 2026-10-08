import type { RoadClass } from '../../domain/types';

/**
 * 데모 도시의 도로망 정의용 타입.
 * 좌표는 국소 평면 좌표(m)이며 x 는 동쪽, y 는 북쪽이다. 실제 지명·도로와 무관한 가상의 지역이다.
 */

export interface CityNode {
  id: string;
  name?: string;
  x: number;
  y: number;
  /** 신호 교차로. 통과할 때마다 신호등 1개로 센다 (출발·도착 지점과 회전교차로는 제외) */
  signal?: boolean;
  /** 이 교차로의 좌회전은 비보호다 (transitions 로 진행 경로별 재정의 가능) */
  unprotectedLeft?: boolean;
  roundabout?: boolean;
}

/** 모의 혼잡도: 0 원활, 1 보통, 2 혼잡, 3 정체 */
export type TrafficLevel = 0 | 1 | 2 | 3;

/** 도로 한 구간(인접한 두 노드 사이)의 속성. 기본값은 "확인한 결과 해당 없음"이다. */
export interface HopAttrs {
  /** 두 노드 사이의 중간 형상점 (곡선·꺾임) */
  via?: Array<[number, number]>;
  /** 모의 혼잡도 (기본 0) */
  traffic?: TrafficLevel;
  /** 혼잡도 자료 없음 */
  trafficUnknown?: boolean;
  narrow?: boolean;
  unpaved?: boolean;
  /** 이 구간에 걸친 보호구역 종류. 여러 구간에 걸친 구역은 한 구간에만 표시한다. */
  protectedZone?: 'child' | 'senior' | 'disabled';
  /** yes: 사고다발구간 / no: 자료상 해당 없음(기본) / unknown: 자료 없음 */
  accident?: 'yes' | 'no' | 'unknown';
  /** 급하게 꺾이는 도로 구간 수 */
  sharpCurves?: number;
  /** 통행료(원). 이 구간을 지날 때 부과한다 */
  toll?: number;
  /** 교차로 신호와 별개인 구간 내 신호등 수 (횡단보도 신호 등) */
  extraSignals?: number;
  /** 통행 제한(공사 등). 경로 탐색에서 제외되는 하드 제약이다. */
  restricted?: boolean;
  restrictedNote?: string;
}

export interface RoadDef {
  id: string;
  name: string;
  cls: RoadClass;
  /** 편도 차로 수 */
  lanes: number;
  speedKph: number;
  /** 순서대로 지나는 노드 id */
  nodes: string[];
  oneWay?: boolean;
  /** 키는 "a-b" (노드 id 두 개, 방향 무관) */
  hops?: Record<string, HopAttrs>;
}

/** 키는 "이전노드>교차로노드>다음노드". 방향 전환 시 추가 정보를 준다. */
export interface TransitionMeta {
  /** 이 전환을 위해 미리 필요한 차로 변경(예상). 합류·분기 자체는 제외한다. */
  laneChanges?: number;
  /** 교차로 기본값을 이 진행 경로에 한해 재정의 */
  unprotectedLeft?: boolean;
}

export interface CityData {
  nodes: CityNode[];
  roads: RoadDef[];
  transitions: Record<string, TransitionMeta>;
}
