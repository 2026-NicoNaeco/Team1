import type { Place } from '../../domain/types';

/**
 * 백엔드 실제 도로망(backend/data/seoul.json, OpenStreetMap 서울특별시 전체) 안의 시연용 지점.
 * 백엔드를 GRAPH_PATH=data/seoul.json 으로 띄워야 경로를 찾을 수 있다 (GET /v1/service-area 의 범위와 같다).
 * 장소 이름은 실제 역이지만 좌표는 역 부근의 대략적인 지점이다. 백엔드가 가장 가까운 도로 위 지점에 붙인다.
 * 카카오 장소 검색(서버 REST 키)이 붙으면 검색 결과도 서울 안에서만 경로를 찾을 수 있다.
 * 출발지는 시연용으로 강남역에 고정한다.
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
  { id: 'seoul:jamsil-station', name: '잠실역', address: '서울 송파구 · 시연용 좌표', category: 'station', location: { lat: 37.5133, lng: 127.1001 } },
  { id: 'seoul:yeouido-station', name: '여의도역', address: '서울 영등포구 · 시연용 좌표', category: 'station', location: { lat: 37.5215, lng: 126.9243 } },
  { id: 'seoul:seoul-station', name: '서울역', address: '서울 중구 · 시연용 좌표', category: 'station', location: { lat: 37.5547, lng: 126.9707 } },
  { id: 'seoul:hongik-univ-station', name: '홍대입구역', address: '서울 마포구 · 시연용 좌표', category: 'station', location: { lat: 37.5572, lng: 126.9245 } },
];

/**
 * 도로망이 덮는 범위(GET /v1/service-area 의 bbox, 2026-10-30 서울 데이터). 이 밖의 장소는 경로를 찾을 수 없어 고르지 못하게 한다.
 * 도로망을 바꾸면 service-area 응답에 맞춰 같이 고친다.
 */
export const SERVICE_BBOX = { minLat: 37.4305, maxLat: 37.6957, minLng: 126.7764, maxLng: 127.184 };

/**
 * 도로망은 서울시 경계 안의 도로만 담는다. 사각 범위 안에도 고양·부천·과천·성남 같은 경기도 땅이 섞여 있어
 * 주소로 한 번 더 거른다 (카카오 주소는 "서울 강남구 …" 처럼 시·도로 시작한다).
 */
export const SERVICE_REGION_PREFIX = '서울';

/** 경로·지도 화면에 함께 보여 줄 도로 자료 출처 (OSM 라이선스상 표시 필요) */
export const ROAD_DATA_ATTRIBUTION = '도로 자료 © OpenStreetMap';
