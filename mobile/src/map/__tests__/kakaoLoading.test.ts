import { KAKAO_LOAD_STAGES } from '../kakaoLoading';

describe('카카오 지도 로딩 막대', () => {
  const { page, sdk, tiles } = KAKAO_LOAD_STAGES;

  it('단계가 지날수록 막대가 앞으로만 간다', () => {
    expect(page.progress).toBeGreaterThan(0);
    expect(sdk.progress).toBeGreaterThan(page.progress);
    expect(tiles.progress).toBeGreaterThan(sdk.progress);
  });

  it('지도가 보이기 전에는 100% 를 채우지 않고 98~99% 에서 머문다', () => {
    expect(tiles.progress).toBeGreaterThanOrEqual(0.98);
    expect(tiles.progress).toBeLessThanOrEqual(0.99);
  });
});
