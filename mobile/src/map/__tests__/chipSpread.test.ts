import { spreadChips, type PlacedChip } from '../chipAnchor';

const chip = (id: string, x: number, y: number, selected = false, halfW = 40, halfH = 20): PlacedChip => ({ id, selected, x, y, halfW, halfH });
const box = (c: PlacedChip, dy: number) => ({ x0: c.x - c.halfW, x1: c.x + c.halfW, y0: c.y + dy - c.halfH, y1: c.y + dy + c.halfH });
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function expectNoOverlapInside(chips: PlacedChip[], offsets: Record<string, number>, bounds: { top: number; bottom: number }) {
  const boxes = chips.map((c) => box(c, offsets[c.id]!));
  for (const b of boxes) {
    expect(b.y0).toBeGreaterThanOrEqual(bounds.top);
    expect(b.y1).toBeLessThanOrEqual(bounds.bottom);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
  }
}

describe('경로 칩 겹침 풀기 (spreadChips)', () => {
  const bounds = { top: 0, bottom: 400 };

  it('겹치지 않으면 그대로 둔다', () => {
    const chips = [chip('A', 50, 100), chip('B', 250, 100), chip('C', 150, 300, true)];
    expect(spreadChips(chips, bounds)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('겹치면 세로로 비켜 쌓아 서로 겹치지 않게 한다', () => {
    const chips = [chip('A', 100, 200), chip('B', 120, 205), chip('C', 110, 195, true)];
    expectNoOverlapInside(chips, spreadChips(chips, bounds), bounds);
  });

  it('지도가 좁은 띠로만 보여도 칩이 들어갈 만하면 겹치지 않게 범위 안에 담는다 (작은 화면의 경로 비교)', () => {
    // 360×640dp 경로 비교: 출발·도착 카드와 시트 사이로 115px 만 보이고, 칩 3개(높이 34)가 거의 같은 자리에 있다
    const tight = { top: 145, bottom: 260 };
    const chips = [chip('C', 110, 182, true, 49, 17), chip('A', 147, 200, false, 40, 17), chip('B', 170, 226, false, 40, 17)];
    expectNoOverlapInside(chips, spreadChips(chips, tight), tight);
  });

  it('선택이 바뀌어도 (칩 크기가 같다면) 위치는 같다', () => {
    const a = [chip('A', 100, 200, true), chip('B', 120, 205)];
    const b = [chip('A', 100, 200), chip('B', 120, 205, true)];
    expect(spreadChips(a, bounds)).toEqual(spreadChips(b, bounds));
  });

  it('자리가 모자라면 겹칠 수는 있어도 보이는 범위 밖으로는 내보내지 않는다', () => {
    const tight = { top: 180, bottom: 222 }; // 칩 하나 높이(40)만 들어가는 띠
    const chips = [chip('A', 100, 200), chip('B', 110, 200, true)];
    const offsets = spreadChips(chips, tight);
    for (const c of chips) {
      const b = box(c, offsets[c.id]!);
      expect(b.y0).toBeGreaterThanOrEqual(tight.top);
      expect(b.y1).toBeLessThanOrEqual(tight.bottom);
    }
  });
});
