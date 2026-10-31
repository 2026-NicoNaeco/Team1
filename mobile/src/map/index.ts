import { Platform } from 'react-native';
import { DATA_SOURCE, KAKAO_JS_KEY } from '../services/config';
import { DemoMapView } from './DemoMapView';
import { KakaoMapView } from './KakaoMapView';
import { RoutePreviewMap } from './RoutePreviewMap';

/**
 * 지도 구현 교체 지점.
 * 실제 지도 SDK 를 쓰려면 MapAdapterProps 를 받는 컴포넌트를 만들어 여기서 MapView 로 내보내면 된다.
 * 데모 데이터면 가상 도시 지도(DemoMapView)를 쓴다. 백엔드 데이터면 카카오 지도(KakaoMapView)를 쓰고,
 * 카카오 키가 없거나 웹 미리보기(react-native-webview 미지원)면 경로 모양만 그리는 임시 지도(RoutePreviewMap)를 쓴다.
 */
const BackendMapView = KAKAO_JS_KEY && Platform.OS !== 'web' ? KakaoMapView : RoutePreviewMap;

export const MapView = DATA_SOURCE === 'backend' ? BackendMapView : DemoMapView;
export * from './MapAdapter';
