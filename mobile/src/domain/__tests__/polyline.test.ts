import { decodePolyline } from '../polyline';

describe('decodePolyline (Google encoded polyline, 정밀도 5)', () => {
  it('공식 문서의 예시를 해독한다', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('중간에서 끊긴 문자열은 오류로 알린다', () => {
    expect(() => decodePolyline('_p~iF~ps|U_ulL')).toThrow();
  });
});
