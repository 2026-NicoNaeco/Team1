import { haversineM } from '../../domain/geo';
import type { GeoPoint } from '../../domain/types';
import { buildKakaoMapHtml } from '../kakaoMapHtml';
import { buildKakaoScene, chipAnchorsGeo, kakaoLevelForScale } from '../kakaoScene';
import type { MapRoute } from '../MapAdapter';

const P = (lat: number, lng: number): GeoPoint => ({ lat, lng });
// 광주 부근, 동쪽으로 약 900m 뻗은 경로
const straight = [P(35.16, 126.85), P(35.16, 126.855), P(35.16, 126.86)];
const route = (over: Partial<MapRoute> = {}): MapRoute => ({ id: 'a', label: 'A', path: straight, selected: true, ...over });

describe('kakaoLevelForScale', () => {
  it('축척(px/m)을 가까운 카카오 지도 레벨로 바꾼다', () => {
    expect(kakaoLevelForScale(4)).toBe(1); // 0.25 m/px
    expect(kakaoLevelForScale(1)).toBe(3); // 1 m/px
    expect(kakaoLevelForScale(0.2)).toBe(5); // 5 m/px ≈ 레벨 5(4 m/px)
  });

  it('범위를 벗어나면 1~14 로 자른다', () => {
    expect(kakaoLevelForScale(1000)).toBe(1);
    expect(kakaoLevelForScale(0.000001)).toBe(14);
    expect(kakaoLevelForScale(0)).toBe(14);
  });
});

describe('buildKakaoScene', () => {
  it('지나온 거리만큼 경로를 둘로 나누고, 나눈 지점이 양쪽에 같이 들어간다', () => {
    const scene = buildKakaoScene({ routes: [route({ traveledM: 300 })], markers: [], camera: { type: 'overview', key: 'o' } }, {});
    const r = scene.routes[0]!;
    const split = r.traveled[r.traveled.length - 1]!;
    expect(r.rest[0]).toEqual(split);
    expect(haversineM(straight[0]!, P(split[0], split[1]))).toBeCloseTo(300, 0);
    expect(r.rest[r.rest.length - 1]).toEqual([35.16, 126.86]);
  });

  it('지나온 거리가 없으면 전체가 남은 구간이다', () => {
    const scene = buildKakaoScene({ routes: [route()], markers: [], camera: { type: 'overview', key: 'o' } }, {});
    expect(scene.routes[0]!.traveled).toEqual([]);
    expect(scene.routes[0]!.rest).toHaveLength(3);
  });

  it('칩 문구가 있는 경로에만 칩 위치를 넣는다', () => {
    const anchors = { a: P(35.16, 126.855), b: P(35.17, 126.855) };
    const scene = buildKakaoScene(
      { routes: [route({ chipText: 'A · 21분' }), route({ id: 'b', selected: false })], markers: [], camera: { type: 'overview', key: 'o' } },
      anchors,
    );
    expect(scene.routes[0]!.chip).toEqual([35.16, 126.855]);
    expect(scene.routes[1]!.chip).toBeUndefined();
  });

  it('따라가기 카메라는 레벨과 점을, 나머지는 영역 맞추기로 보낸다', () => {
    const follow = buildKakaoScene({ routes: [], markers: [], camera: { type: 'follow', key: 'f', point: P(35.16, 126.85), scale: 0.2 } }, {});
    expect(follow.camera).toEqual({ type: 'follow', point: [35.16, 126.85], level: 5 });

    const overview = buildKakaoScene(
      { routes: [route()], markers: [{ id: 'o', kind: 'origin', point: P(35.15, 126.84) }], camera: { type: 'overview', key: 'o' } },
      {},
    );
    expect(overview.camera.type).toBe('bounds');
    if (overview.camera.type === 'bounds') expect(overview.camera.points).toHaveLength(4);
  });

  it('카메라 key·가림 영역·점이 바뀌면 다시 맞추도록 sig 가 달라진다', () => {
    const sig = (over: Parameters<typeof buildKakaoScene>[0]) => {
      const c = buildKakaoScene(over, {}).camera;
      return c.type === 'bounds' ? c.sig : '';
    };
    const base = { routes: [], markers: [], camera: { type: 'fit' as const, key: 'k', points: straight } };
    expect(sig(base)).toBe(sig({ ...base }));
    expect(sig(base)).not.toBe(sig({ ...base, camera: { ...base.camera, key: 'k2' } }));
    expect(sig(base)).not.toBe(sig({ ...base, insets: { top: 10, right: 0, bottom: 200, left: 0 } }));
    expect(sig(base)).not.toBe(sig({ ...base, camera: { ...base.camera, points: straight.slice(0, 2) } }));
  });

  it('마커 방향이 없으면 0 으로 보낸다', () => {
    const scene = buildKakaoScene({ routes: [], markers: [{ id: 'v', kind: 'vehicle', point: P(35.16, 126.85) }], camera: { type: 'overview', key: 'o' } }, {});
    expect(scene.markers[0]).toEqual({ id: 'v', kind: 'vehicle', point: [35.16, 126.85], headingDeg: 0 });
    expect(scene.interactive).toBe(true);
  });
});

describe('chipAnchorsGeo', () => {
  it('칩 위치는 그 경로 위에 놓인다', () => {
    const anchors = chipAnchorsGeo([route()]);
    expect(anchors.a!.lat).toBeCloseTo(35.16, 6);
    expect(anchors.a!.lng).toBeGreaterThan(126.85);
    expect(anchors.a!.lng).toBeLessThan(126.86);
  });

  it('경로가 없으면 빈 결과', () => {
    expect(chipAnchorsGeo([])).toEqual({});
  });
});

describe('buildKakaoMapHtml', () => {
  it('키를 URL 인코딩해 SDK 주소에 넣고 autoload 를 끈다', () => {
    const html = buildKakaoMapHtml('ab&c');
    expect(html).toContain('https://dapi.kakao.com/v2/maps/sdk.js?appkey=ab%26c&autoload=false');
  });

  it('페이지 스크립트가 문법 오류 없이 파싱된다', () => {
    const html = buildKakaoMapHtml('k');
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(() => new Function(inline)).not.toThrow();
  });
});
