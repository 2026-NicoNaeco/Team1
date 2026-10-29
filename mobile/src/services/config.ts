/**
 * 데이터 출처 설정. Expo 가 번들할 때 `EXPO_PUBLIC_*` 환경 변수를 코드에 넣는다 (mobile/.env.local 에 두면 커밋되지 않는다).
 *
 *   EXPO_PUBLIC_DATA_SOURCE=backend            백엔드(/v1)로 장소·경로를 받는다. 없거나 다른 값이면 데모(모의 데이터)
 *   EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
 *   EXPO_PUBLIC_KAKAO_JS_KEY=...               카카오맵 JavaScript 키. 백엔드 모드에서 실제 지도(map/KakaoMapView)를 띄운다
 *
 * Android 에뮬레이터에서 PC 의 백엔드에 붙을 때는 `adb reverse tcp:8000 tcp:8000` 후 localhost 를 쓰거나 10.0.2.2 를 쓴다.
 * 비밀 값(REST·Admin 키 같은 API 키)은 넣지 않는다. 번들에 들어간 값은 누구나 꺼내 볼 수 있다.
 * 카카오 JavaScript 키는 예외로, 카카오디벨로퍼스에 등록한 도메인에서만 동작하는 공개용 키다.
 */
export type DataSource = 'demo' | 'backend';

export const DATA_SOURCE: DataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'backend' ? 'backend' : 'demo';

export const API_BASE_URL: string = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

/** 없으면 실제 지도 대신 경로 모양만 그리는 임시 지도를 쓴다 */
export const KAKAO_JS_KEY: string = (process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '').trim();
