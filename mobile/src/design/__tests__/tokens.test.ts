import { contrastRatio } from '../contrast';
import { contrastPairs } from '../tokens';

describe('디자인 토큰 명암 대비', () => {
  it.each(contrastPairs)('$name 은 $min:1 이상이다', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('흑백의 대비는 21:1 이다 (계산식 확인)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});
