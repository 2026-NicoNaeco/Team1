import {
  factorSummary,
  formatDateTime,
  formatDistance,
  formatExtra,
  formatMinutes,
  formatNavDistance,
  formatWon,
  josa,
  minutesFromSeconds,
  placeLabel,
} from '../format';
import { known, partial, unknown } from './fixtures';

describe('josa (한국어 조사)', () => {
  it.each([
    ['유턴', '이/가', '유턴이'],
    ['합류·분기', '이/가', '합류·분기가'],
    ['차로 변경', '이/가', '차로 변경이'],
    ['비보호 좌회전', '이/가', '비보호 좌회전이'],
    ['새싹마트', '으로/로', '새싹마트로'],
    ['한빛대학교 정문', '으로/로', '한빛대학교 정문으로'],
    ['서울', '으로/로', '서울로'],
    ['중앙대로', '과/와', '중앙대로와'],
    ['유턴', '과/와', '유턴과'],
  ] as const)('%s + %s → %s', (word, pair, expected) => {
    expect(josa(word, pair)).toBe(expected);
  });
});

describe('표시 포맷', () => {
  it('초는 1분 이상으로 올림 없이 반올림한다', () => {
    expect(minutesFromSeconds(10)).toBe(1);
    expect(minutesFromSeconds(89)).toBe(1);
    expect(minutesFromSeconds(91)).toBe(2);
    expect(minutesFromSeconds(1680)).toBe(28);
  });

  it('시간·거리·통행료', () => {
    expect(formatMinutes(28)).toBe('28분');
    expect(formatMinutes(65)).toBe('1시간 5분');
    expect(formatMinutes(120)).toBe('2시간');
    expect(formatDistance(9200)).toBe('9.2km');
    expect(formatDistance(850)).toBe('850m');
    expect(formatNavDistance(321)).toBe('320m');
    expect(formatNavDistance(2300)).toBe('2.3km');
    expect(formatWon(1900)).toBe('1,900원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });

  it('추가 시간: 0 이면 "가장 빠름", 아니면 "+N분"', () => {
    expect(formatExtra(0)).toBe('가장 빠름');
    expect(formatExtra(6)).toBe('빠른 경로보다 +6분');
  });

  it('날짜는 기기의 현지 시간으로 표시한다', () => {
    expect(formatDateTime('2026-10-08T09:05:00.000Z')).toMatch(/^2026\.10\.0[78] \d{2}:05$/);
    expect(formatDateTime('not a date')).toBe('');
  });
});

describe('운전 요소 표시: 0 / 정보 없음 / 일부 확인 구분', () => {
  it('확인했고 0 이면 "없음"(none)', () => {
    const s = factorSummary('UNPROTECTED_LEFT', known('UNPROTECTED_LEFT', 0));
    expect(s.state).toBe('none');
    expect(s.text).toBe('비보호 좌회전 없음');
  });

  it('값이 있으면 횟수·단위와 함께(present)', () => {
    expect(factorSummary('LANE_CHANGE', known('LANE_CHANGE', 2))).toEqual({ text: '차로 변경 2회', state: 'present' });
    expect(factorSummary('NARROW_ROAD', known('NARROW_ROAD', 1.2))).toEqual({ text: '좁은 도로 1.2km', state: 'present' });
  });

  it('정보가 없으면 0 이 아니라 "정보 없음"(unknown)', () => {
    const s = factorSummary('ACCIDENT_ZONE', unknown('ACCIDENT_ZONE'));
    expect(s.state).toBe('unknown');
    expect(s.text).toContain('정보 없음');
    expect(s.text).not.toContain('0');
  });

  it('일부만 확인됐으면 "없음"으로 단정하지 않고 일부 정보 없음을 밝힌다(partial)', () => {
    const none = factorSummary('ACCIDENT_ZONE', partial('ACCIDENT_ZONE', 0));
    expect(none.state).toBe('partial');
    expect(none.text).toContain('일부 정보 없음');
    expect(none.text).not.toBe(factorSummary('ACCIDENT_ZONE', known('ACCIDENT_ZONE', 0)).text);

    const some = factorSummary('ACCIDENT_ZONE', partial('ACCIDENT_ZONE', 1));
    expect(some.text).toContain('1곳 이상');
  });

  it('도로 유형: 고속도로 km 또는 일반도로만', () => {
    expect(factorSummary('ROAD_TYPE', known('ROAD_TYPE', 10.56)).text).toBe('고속도로 10.6km');
    expect(factorSummary('ROAD_TYPE', known('ROAD_TYPE', 0))).toEqual({ text: '일반도로만 지나요', state: 'none' });
  });
});

describe('장소 이름 표시 (placeLabel)', () => {
  it('시연용 출발지의 꼬리표만 떼고 보여준다', () => {
    expect(placeLabel('새싹역 앞 (데모 위치)')).toBe('새싹역 앞');
    expect(placeLabel('한빛대학교 정문')).toBe('한빛대학교 정문');
    expect(placeLabel('물빛천 둔치 주차장 (진입로 공사)')).toBe('물빛천 둔치 주차장 (진입로 공사)');
  });
});
