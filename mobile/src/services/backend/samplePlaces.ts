import type { Place } from '../../domain/types';

/**
 * 백엔드 실제 도로망(backend/data/gangnam.json, OpenStreetMap 강남역·역삼역 일대) 안의 시연용 지점.
 * 백엔드를 GRAPH_PATH=data/gangnam.json 으로 띄워야 경로를 찾을 수 있다 (GET /v1/service-area 의 범위와 같다).
 * 장소 이름은 실제 역이지만 좌표는 역 부근의 대략적인 지점이다. 백엔드가 가장 가까운 도로 위 지점에 붙인다.
 * 카카오 장소 검색(서버 REST 키)이 붙으면 검색 결과도 이 범위 안에서만 경로를 찾을 수 있다.
 */
const ADDRESS = '서울 강남구 · 시연용 좌표';

export const SAMPLE_ORIGIN: Place = {
  id: 'gangnam:gangnam-station',
  name: '강남역',
  address: ADDRESS,
  category: 'station',
  location: { lat: 37.4979, lng: 127.0276 },
};

export const SAMPLE_PLACES: Place[] = [
  { id: 'gangnam:seolleung-station', name: '선릉역', address: ADDRESS, category: 'station', location: { lat: 37.5045, lng: 127.049 } },
  { id: 'gangnam:yeoksam-station', name: '역삼역', address: ADDRESS, category: 'station', location: { lat: 37.5006, lng: 127.0364 } },
  { id: 'gangnam:sinnonhyeon-station', name: '신논현역', address: ADDRESS, category: 'station', location: { lat: 37.5045, lng: 127.0251 } },
  { id: 'gangnam:eonju-station', name: '언주역', address: ADDRESS, category: 'station', location: { lat: 37.5072, lng: 127.0339 } },
];

/**
 * 도로망이 덮는 범위(GET /v1/service-area 의 bbox, 2026-10-26 데이터). 이 밖의 장소는 경로를 찾을 수 없어 고르지 못하게 한다.
 * 도로망을 바꾸면 service-area 응답에 맞춰 같이 고친다.
 */
export const SERVICE_BBOX = { minLat: 37.4856, maxLat: 37.5121, minLng: 127.0138, maxLng: 127.0509 };

/** 경로·지도 화면에 함께 보여 줄 도로 자료 출처 (OSM 라이선스상 표시 필요) */
export const ROAD_DATA_ATTRIBUTION = '도로 자료 © OpenStreetMap';
