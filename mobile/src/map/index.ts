import { DATA_SOURCE } from '../services/config';
import { DemoMapView } from './DemoMapView';
import { RoutePreviewMap } from './RoutePreviewMap';

/**
 * 지도 구현 교체 지점.
 * 실제 지도 SDK 를 쓰려면 MapAdapterProps 를 받는 컴포넌트를 만들어 여기서 MapView 로 내보내면 된다.
 * 지금은 데모 데이터면 가상 도시 지도(DemoMapView), 백엔드 데이터면 경로 모양만 그리는 임시 지도(RoutePreviewMap)를 쓴다.
 */
export const MapView = DATA_SOURCE === 'backend' ? RoutePreviewMap : DemoMapView;
export * from './MapAdapter';
