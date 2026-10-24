import type { Place } from '../../domain/types';

/**
 * 백엔드 개발용 샘플 도로망(backend/app/routing/sample_graph.py, 광주 일대의 가상 격자) 안의 지점.
 * 실제 장소가 아니므로 이름에 "샘플"을 넣어 실제 장소로 오해하지 않게 한다.
 * 실제 도로망이 들어오면 이 목록 대신 장소 검색 결과와 현재 위치를 쓴다.
 */
const ADDRESS = '개발용 샘플 도로망 (광주 일대 가상 격자)';

export const SAMPLE_ORIGIN: Place = {
  id: 'sample:origin',
  name: '샘플 출발지 · 서쪽',
  address: ADDRESS,
  category: 'landmark',
  location: { lat: 35.1595, lng: 126.8526 },
};

export const SAMPLE_PLACES: Place[] = [
  { id: 'sample:east', name: '샘플 도착지 · 동쪽', address: ADDRESS, category: 'landmark', location: { lat: 35.1768, lng: 126.9058 } },
  { id: 'sample:roundabout', name: '샘플 지점 · 회전교차로 부근', address: ADDRESS, category: 'landmark', location: { lat: 35.174, lng: 126.895 } },
  { id: 'sample:school-zone', name: '샘플 지점 · 보호구역 부근', address: ADDRESS, category: 'school', location: { lat: 35.156, lng: 126.865 } },
  { id: 'sample:south-east', name: '샘플 지점 · 고속도로 남쪽', address: ADDRESS, category: 'landmark', location: { lat: 35.158, lng: 126.905 } },
  { id: 'sample:north', name: '샘플 지점 · 북쪽 끝', address: ADDRESS, category: 'landmark', location: { lat: 35.182, lng: 126.865 } },
];
