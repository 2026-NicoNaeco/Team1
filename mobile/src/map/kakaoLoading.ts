/**
 * 카카오 지도 로딩 막대의 단계별 목표. 오래 걸리는 단계에 긴 구간을 준다.
 * 지도가 실제로 보이면 막대째 사라지므로 100% 는 쓰지 않는다. 100% 인데 지도가 안 보이는 순간을 만들지 않기 위해서다.
 */
export type KakaoLoadStage = 'page' | 'sdk' | 'tiles';

export const KAKAO_LOAD_STAGES: Record<KakaoLoadStage, { progress: number; durationMs: number }> = {
  page: { progress: 0.3, durationMs: 1000 },
  sdk: { progress: 0.45, durationMs: 600 },
  tiles: { progress: 0.99, durationMs: 3000 },
};
