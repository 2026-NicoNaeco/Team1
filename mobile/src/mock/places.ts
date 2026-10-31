import type { Place, PlaceCategory } from '../domain/types';
import { CITY } from './demoCity/cityData';
import { localToGeo } from './demoCity/projection';

/**
 * 데모 샘플 장소. 모두 가상의 이름이며 실제 장소가 아니다.
 * 장소는 도로망 노드에 연결되며, 위치는 그 노드의 좌표에서 가져온다.
 */

interface PlaceSeed {
  id: string;
  name: string;
  address: string;
  category: PlaceCategory;
  nodeId: string;
}

const SEEDS: PlaceSeed[] = [
  {
    id: 'station',
    name: '새싹역 앞 (데모 위치)',
    address: '가상시 새싹구 새싹대로 1',
    category: 'station',
    nodeId: 'stn',
  },
  {
    id: 'univ-gate',
    name: '한빛대학교 정문',
    address: '가상시 한빛구 한빛대로 100',
    category: 'university',
    nodeId: 'ug',
  },
  {
    id: 'park-parking',
    name: '푸른공원 주차장',
    address: '가상시 푸른구 푸른길 220',
    category: 'park',
    nodeId: 'pk',
  },
  {
    id: 'market',
    name: '중앙시장 앞 공영주차장',
    address: '가상시 중앙구 중앙대로 1500',
    category: 'market',
    nodeId: 'a5',
  },
  {
    id: 'hospital',
    name: '하늘병원 본관',
    address: '가상시 하늘구 병원로 30',
    category: 'hospital',
    nodeId: 'hosp',
  },
  {
    id: 'school',
    name: '별빛초등학교 후문',
    address: '가상시 새싹구 행복로 3400',
    category: 'school',
    nodeId: 'sch',
  },
  {
    id: 'mart',
    name: '새싹마트',
    address: '가상시 새싹구 새싹대로 12',
    category: 'mart',
    nodeId: 'a0',
  },
  {
    id: 'riverside-parking',
    name: '물빛천 둔치 주차장 (진입로 공사)',
    address: '가상시 물빛구 둔치길 1',
    category: 'parking',
    nodeId: 'rv',
  },
  {
    id: 'univ-annex',
    name: '한빛대학교 글로벌캠퍼스 국제교류관 별관 지하주차장 제2출입구',
    address: '가상시 한빛구 한빛대로 1234번길 56, 한빛대학교 국제교류관 별관 지하 2층 주차장 안내데스크 옆',
    category: 'parking',
    nodeId: 'ann',
  },
];

const nodeById = new Map(CITY.nodes.map((n) => [n.id, n]));

export const PLACES: Place[] = SEEDS.map((seed) => {
  const node = nodeById.get(seed.nodeId);
  if (!node) throw new Error(`장소 ${seed.id}: 없는 노드 ${seed.nodeId}`);
  return {
    id: seed.id,
    name: seed.name,
    address: seed.address,
    category: seed.category,
    location: localToGeo({ x: node.x, y: node.y }),
  };
});

export const PLACE_NODE: Record<string, string> = Object.fromEntries(SEEDS.map((s) => [s.id, s.nodeId]));

/** 앱을 처음 열었을 때의 출발지. 실제 위치 권한을 요구하지 않는다. */
export const DEMO_ORIGIN: Place = PLACES.find((p) => p.id === 'station')!;

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  station: '역',
  university: '대학교',
  school: '학교',
  park: '공원',
  market: '시장',
  hospital: '병원',
  mart: '마트',
  landmark: '장소',
  parking: '주차장',
};
