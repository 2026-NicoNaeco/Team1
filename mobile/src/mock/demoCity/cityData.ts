import type { CityData } from './cityTypes';

/**
 * 데모 도시 "새싹시"의 도로망 (가상의 지역, 실제 도로·지명과 무관).
 *
 * 설계 의도 (한빛대학교 정문까지)
 * - A: 중앙대로 (가장 빠르지만 방향 전환·차로 변경·비보호 좌회전·유턴·회전교차로가 많다)
 * - B: 행복로 → 푸른길 (조금 느리지만 회전과 차로 변경이 적다. 좁은 도로와 보호구역이 있고 일부 구간은 사고다발구간 자료가 없다)
 * - C: 동부고속도로(가상) (고속도로 선호에 따라 평가가 달라진다. 합류·분기와 통행료가 있다)
 *
 * 수치(속도·혼잡도)는 UX 검증용 모의값이다. 검증된 도로 데이터가 아니다.
 */
export const CITY: CityData = {
  nodes: [
    // ── 출발지 주변
    { id: 'stn', name: '새싹역 앞', x: 1000, y: 1300, signal: true },
    { id: 'a0', name: '새싹마트 앞', x: 1600, y: 1300, signal: true },
    { id: 'a1', name: '중앙사거리', x: 2200, y: 1300, signal: true, unprotectedLeft: true },
    { id: 'd1', name: '역남 삼거리', x: 1500, y: 1000, signal: true },
    { id: 'd2', name: '새싹IC 사거리', x: 2400, y: 800, signal: true },
    // ── 남쪽 길 (물빛남교는 공사 중)
    { id: 's1', x: 3300, y: 1150 },
    { id: 's2', x: 3900, y: 1000 },
    { id: 's2b', x: 4300, y: 1000 },
    { id: 's3', name: '남쪽 삼거리', x: 5000, y: 1050, signal: true },
    { id: 's4', name: '남시장 사거리', x: 5800, y: 1150, signal: true },
    { id: 'h1', name: '병원 입구', x: 6900, y: 1350, signal: true },
    { id: 'hosp', name: '하늘병원', x: 7800, y: 1700 },
    { id: 'rv', name: '물빛천 둔치 주차장', x: 5000, y: 400 },
    // ── 중앙대로 (A)
    { id: 'a2', name: '하늘사거리', x: 3200, y: 2200, signal: true },
    { id: 'a3', name: '물빛대교 입구', x: 3900, y: 2950, signal: true },
    { id: 'a3b', x: 4300, y: 3000 },
    { id: 'a4', name: '대교동단 사거리', x: 5000, y: 3000, signal: true },
    { id: 'q1', x: 5000, y: 2000 },
    { id: 'a5', name: '중앙시장 앞', x: 6200, y: 3000, signal: true, unprotectedLeft: true },
    { id: 'm1', x: 6500, y: 2200 },
    { id: 'a5n', name: '시장북 사거리', x: 6200, y: 3700, signal: true },
    { id: 'a6', name: '시청 사거리', x: 7000, y: 4200, signal: true },
    { id: 'x1', name: '캠퍼스 삼거리', x: 8050, y: 4600, signal: true },
    { id: 'a7', name: '한빛 로터리', x: 8300, y: 4800, roundabout: true },
    { id: 'lk', x: 7700, y: 5400 },
    { id: 'a8', name: '한빛대로 유턴 지점', x: 8950, y: 5550 },
    { id: 'a8w', x: 8910, y: 5510 },
    { id: 'ug', name: '한빛대학교 정문', x: 8800, y: 5400 },
    // ── 행복로 → 푸른길 (B)
    { id: 'b1', x: 1000, y: 2300 },
    { id: 'b2', name: '별빛초 앞', x: 1000, y: 3400 },
    { id: 'sch', name: '별빛초등학교 후문', x: 1400, y: 3400 },
    { id: 'b3', name: '행복로 북단', x: 1000, y: 4600, signal: true },
    { id: 'b4', name: '푸른길 사거리', x: 2200, y: 4600, signal: true },
    { id: 'b5', name: '물빛 사거리', x: 3300, y: 4600, signal: true },
    { id: 'b6', x: 3950, y: 4600 },
    { id: 'b6b', x: 4350, y: 4600 },
    { id: 'b7', name: '시청북 사거리', x: 5000, y: 4600, signal: true },
    { id: 'p1', x: 5000, y: 3800 },
    { id: 'b8', name: '푸른공원 앞', x: 5600, y: 4600, signal: true },
    { id: 'pk', name: '푸른공원 주차장', x: 5600, y: 5000 },
    { id: 'b9', x: 6900, y: 4600, signal: true },
    { id: 'b11', name: '캠퍼스로 입구', x: 8700, y: 4600, signal: true },
    { id: 'cp', x: 8750, y: 5000 },
    { id: 'cn', x: 8800, y: 5900 },
    { id: 'ann', name: '한빛대학교 국제교류관', x: 9250, y: 5950 },
    // ── 동부고속도로 (C)
    { id: 'hw1', x: 3700, y: 1150 },
    { id: 'hw2', x: 5500, y: 800 },
    { id: 'hw3', x: 8000, y: 1100 },
    { id: 'hw4', x: 9700, y: 2400 },
    { id: 'hw5', x: 9900, y: 4200 },
    { id: 'ie', name: '한빛IC 교차로', x: 9830, y: 4950, signal: true },
    { id: 'ic1', name: '한빛IC로 입구', x: 9200, y: 5150, signal: true },
  ],

  roads: [
    // 새싹대로 (arterial)
    {
      id: 'saessak', name: '새싹대로', cls: 'arterial', lanes: 3, speedKph: 50,
      nodes: ['stn', 'a0', 'a1'],
      hops: { 'stn-a0': { traffic: 1 }, 'a0-a1': { traffic: 1 } },
    },
    // 남로 (물빛남교 구간은 공사 중이라 통행 제한)
    {
      id: 'nam', name: '남로', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['a1', 's1', 's2', 's2b', 's3', 's4'],
      hops: {
        's2-s2b': { restricted: true, restrictedNote: '물빛남교 보수 공사로 진입이 제한돼요 (모의)' },
      },
    },
    // 중앙대로 (A). 물빛대교는 별도 도로로 둔다 (교량 진입 교차로에서 방향 전환이 생긴다)
    {
      id: 'jungang_w', name: '중앙대로', cls: 'arterial', lanes: 4, speedKph: 60,
      nodes: ['a1', 'a2', 'a3'],
      hops: {
        'a1-a2': { traffic: 1 },
        'a2-a3': { traffic: 2, accident: 'yes' },
      },
    },
    {
      id: 'daegyo', name: '물빛대교', cls: 'arterial', lanes: 3, speedKph: 50,
      nodes: ['a3', 'a3b'],
      hops: { 'a3-a3b': { traffic: 2 } },
    },
    {
      id: 'jungang_e', name: '중앙대로', cls: 'arterial', lanes: 4, speedKph: 60,
      nodes: ['a3b', 'a4', 'a5'],
      hops: {
        'a3b-a4': { traffic: 1 },
        'a4-a5': { traffic: 2, protectedZone: 'senior', accident: 'yes' },
      },
    },
    // 시장북로 → 한빛대로 (A)
    {
      id: 'sijang', name: '시장북로', cls: 'arterial', lanes: 2, speedKph: 50,
      nodes: ['a5', 'a5n'],
      hops: { 'a5-a5n': { traffic: 1 } },
    },
    {
      id: 'hanbit', name: '한빛대로', cls: 'arterial', lanes: 3, speedKph: 60,
      nodes: ['a5n', 'a6', 'x1', 'a7', 'a8'],
      hops: {
        'a5n-a6': { traffic: 1 },
        'a6-x1': { traffic: 2 },
        'x1-a7': { traffic: 1 },
        'a7-a8': { traffic: 1 },
      },
    },
    {
      id: 'hanbit_uturn', name: '한빛대로 유턴 구간', cls: 'arterial', lanes: 1, speedKph: 20,
      nodes: ['a8', 'a8w'], oneWay: true,
    },
    {
      id: 'hanbit_down', name: '한빛대로', cls: 'arterial', lanes: 2, speedKph: 40,
      nodes: ['a8w', 'ug'], oneWay: true,
    },
    { id: 'hoban', name: '호반길', cls: 'local', lanes: 1, speedKph: 30, nodes: ['a7', 'lk'] },

    // 행복로 (B)
    {
      id: 'haengbok', name: '행복로', cls: 'collector', lanes: 2, speedKph: 35,
      nodes: ['stn', 'b1', 'b2'],
      hops: {
        'stn-b1': { traffic: 0 },
        'b1-b2': { protectedZone: 'child', extraSignals: 1, traffic: 1 },
      },
    },
    {
      id: 'haengbok_n', name: '행복로', cls: 'collector', lanes: 1, speedKph: 30,
      nodes: ['b2', 'b3'],
      hops: { 'b2-b3': { narrow: true } },
    },
    {
      id: 'byeolbit', name: '별빛초 앞길', cls: 'local', lanes: 1, speedKph: 30,
      nodes: ['b2', 'sch'],
      hops: { 'b2-sch': { protectedZone: 'child', narrow: true } },
    },
    {
      id: 'purun', name: '푸른길', cls: 'collector', lanes: 2, speedKph: 35,
      nodes: ['b3', 'b4', 'b5', 'b6', 'b6b', 'b7', 'b8', 'b9', 'x1', 'b11'],
      hops: {
        'b3-b4': { traffic: 1 },
        'b4-b5': { accident: 'unknown', traffic: 1 },
        'b5-b6': { accident: 'unknown', traffic: 1 },
        'b7-b8': { traffic: 1 },
        'b8-b9': { traffic: 1 },
        'b9-x1': { traffic: 1 },
      },
    },
    { id: 'purun_park', name: '푸른공원로', cls: 'local', lanes: 1, speedKph: 30, nodes: ['b8', 'pk'] },
    {
      id: 'sicheong', name: '시청로', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['a4', 'p1', 'b7'],
      hops: { 'a4-p1': { traffic: 2 }, 'p1-b7': { traffic: 1 } },
    },
    {
      id: 'campus', name: '캠퍼스로', cls: 'collector', lanes: 2, speedKph: 30,
      nodes: ['b11', 'cp', 'ug', 'cn'],
      hops: { 'cp-ug': { traffic: 1 } },
    },
    {
      id: 'annex', name: '국제교류관길', cls: 'local', lanes: 1, speedKph: 20,
      nodes: ['cn', 'ann'],
      hops: { 'cn-ann': { narrow: true } },
    },

    // 시장·병원 방면
    {
      id: 'hwangto', name: '황토로', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['a4', 'q1', 's3'],
      hops: { 'a4-q1': { traffic: 1 } },
    },
    {
      id: 'jangteo', name: '장터길', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['a5', 'm1', 'h1'],
      hops: { 'a5-m1': { traffic: 2 } },
    },
    {
      id: 'byeongwon', name: '병원로', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['s4', 'h1', 'hosp'],
    },
    {
      id: 'dunchi', name: '둔치길', cls: 'local', lanes: 1, speedKph: 20,
      nodes: ['s3', 'rv'],
      hops: {
        's3-rv': { restricted: true, unpaved: true, restrictedNote: '둔치길 진입로 공사로 통행이 제한돼요 (모의)' },
      },
    },

    // 동부고속도로(가상) (C)
    {
      id: 'yeoknam', name: '역남로', cls: 'collector', lanes: 2, speedKph: 35,
      nodes: ['stn', 'd1', 'd2'],
      hops: { 'stn-d1': { traffic: 1 }, 'd1-d2': { traffic: 1 } },
    },
    {
      id: 'ramp_in', name: '새싹IC 진입로', cls: 'ramp', lanes: 1, speedKph: 25,
      nodes: ['d2', 'hw1'],
      hops: { 'd2-hw1': { via: [[2750, 1000], [3200, 1130]] } },
    },
    {
      id: 'dongbu', name: '동부고속도로(가상)', cls: 'highway', lanes: 3, speedKph: 70,
      nodes: ['hw1', 'hw2', 'hw3', 'hw4', 'hw5'],
      hops: {
        'hw1-hw2': { traffic: 1 },
        'hw2-hw3': { traffic: 1 },
        'hw3-hw4': { traffic: 1 },
        'hw4-hw5': { traffic: 2 },
      },
    },
    {
      id: 'ramp_out', name: '한빛IC 진출로', cls: 'ramp', lanes: 1, speedKph: 25,
      nodes: ['hw5', 'ie'],
      hops: { 'hw5-ie': { toll: 1900, sharpCurves: 1, via: [[10000, 4400], [10020, 4650], [9840, 4750]] } },
    },
    {
      id: 'hanbit_ic', name: '한빛IC로', cls: 'collector', lanes: 2, speedKph: 40,
      nodes: ['ie', 'ic1', 'ug'],
      hops: { 'ie-ic1': { traffic: 1 }, 'ic1-ug': { traffic: 1 } },
    },
  ],

  transitions: {
    // 중앙대로
    'a0>a1>a2': { laneChanges: 1 },
    'a2>a3>a3b': { laneChanges: 1 },
    'a4>a5>a5n': { laneChanges: 1 },
    'a7>a8>a8w': { laneChanges: 1 },
    // 고속도로
    'd1>d2>hw1': { laneChanges: 1 },
    'hw4>hw5>ie': { laneChanges: 1 },
  },
};
