import { exclusiveValue } from '../../domain/burden';
import { FACTORS } from '../../domain/factors';
import { emptyLearned, applyLearning } from '../../domain/learning';
import { createDefaultProfile, resolvePreferences } from '../../domain/preferences';
import { recommend } from '../../domain/recommend';
import type { DriverProfile, RecommendationResult, RouteCandidate } from '../../domain/types';
import { computeRoutes, DEMO_GRAPH } from '../mockRouteProvider';
import { PLACE_NODE } from '../places';
import { PRESETS } from '../presets';

const NOW = '2026-10-08T09:00:00.000Z';
const { candidates, excluded } = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['univ-gate']!);

const profileOf = (patch: Partial<DriverProfile> = {}): DriverProfile => ({
  ...createDefaultProfile(NOW),
  consent: { saveRecords: true, usePersonalization: true },
  ...patch,
});
const run = (profile: DriverProfile, learned = emptyLearned()): RecommendationResult =>
  recommend(candidates, resolvePreferences(profile, learned), excluded);
const recommendedLabel = (r: RecommendationResult) =>
  candidates.find((c) => c.id === r.recommendedRouteId)?.label;

describe('설정에 따라 추천 순위가 달라지는 재현 시나리오', () => {
  it.each(PRESETS)('$title → $expectedRecommended 경로가 추천된다', (preset) => {
    const result = run(profileOf(preset.profile));
    expect(recommendedLabel(result)).toBe(preset.expectedRecommended);
  });

  it('설정만 바꿔도 서로 다른 세 경로가 각각 추천될 수 있다', () => {
    const labels = new Set(PRESETS.map((p) => recommendedLabel(run(profileOf(p.profile)))));
    expect(labels).toEqual(new Set(['A', 'B', 'C']));
  });

  it('같은 경로라도 설정에 따라 부담 수준과 설명이 달라진다 (도로 특성은 그대로)', () => {
    const base = run(profileOf());
    const avoider = run(profileOf({ priorities: { LANE_CHANGE: 'avoid', UNPROTECTED_LEFT: 'avoid', U_TURN: 'avoid' } }));
    const highwayId = candidates.find((c) => c.label === 'B')!.id;
    const levelOf = (r: RecommendationResult) => r.items.find((i) => i.routeId === highwayId)!.burdenLevel;
    expect(levelOf(base)).toBe('medium');
    expect(levelOf(avoider)).toBe('high');
    // 설명(감수할 점)도 달라진다: 차로 변경을 피하는 사용자에게는 B 의 차로 변경이 감수할 점으로 올라온다
    const tradeoffs = (r: RecommendationResult) => r.items.find((i) => i.routeId === highwayId)!.tradeoffs.map((t) => t.kind);
    expect(tradeoffs(base)).not.toContain('more');
    expect(tradeoffs(avoider)).toContain('more');
  });
});

describe('허용 추가 시간', () => {
  it('허용 시간을 넘는 경로는 추천하지 않지만 목록에는 남기고 이유를 알린다', () => {
    const result = run(profileOf({ maxExtraMinutes: 5 }));
    const over = result.items.filter((i) => !i.withinTimeLimit);
    expect(over.map((i) => i.extraMinutes).every((m) => m > 5)).toBe(true);
    expect(over.length).toBeGreaterThan(0);
    // 허용 시간 안의 경로가 먼저 오고, 초과 경로는 뒤에 온다
    const firstOver = result.items.findIndex((i) => !i.withinTimeLimit);
    expect(result.items.slice(firstOver).every((i) => !i.withinTimeLimit)).toBe(true);
    expect(result.items[0]!.isRecommended).toBe(true);
    const notice = result.notices.find((n) => n.kind === 'over_limit');
    expect(notice).toBeDefined();
    expect(notice!.text).toContain('+5분');
    // 초과 경로의 감수할 점 첫 항목은 허용 시간 초과다
    expect(over[0]!.tradeoffs[0]!.kind).toBe('over_limit');
  });

  it('조건을 몰래 완화하지 않는다: 허용 시간 0분이면 가장 빠른 경로만 추천 후보다', () => {
    const result = run(profileOf({ maxExtraMinutes: 0 }));
    expect(result.items.filter((i) => i.withinTimeLimit)).toHaveLength(1);
    expect(recommendedLabel(result)).toBe('A');
    expect(result.items.filter((i) => i.isRecommended)).toHaveLength(1);
  });

  it('가장 빠른 후보는 항상 허용 시간 안에 있어 추천이 비는 일이 없다', () => {
    for (const max of [0, 5, 10, 20, 30]) {
      expect(run(profileOf({ maxExtraMinutes: max })).recommendedRouteId).not.toBeNull();
    }
  });

  it('추가 시간은 표시하는 분(반올림)끼리의 차이다', () => {
    const result = run(profileOf());
    for (const item of result.items) {
      const fastest = result.items.reduce((m, i) => Math.min(m, i.durationMinutes), Infinity);
      expect(item.extraMinutes).toBe(item.durationMinutes - fastest);
    }
  });
});

describe('추천 이유와 감수할 점은 실제 데이터와 일치한다', () => {
  const result = run(profileOf({ priorities: { LANE_CHANGE: 'avoid', UNPROTECTED_LEFT: 'avoid' } }));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const fastest = candidates.reduce((best, c) => (c.durationS < best.durationS ? c : best));

  it('모든 경로에 추천 이유 2개 이상과 감수할·확인할 점 1개 이상이 있다', () => {
    for (const item of result.items) {
      expect(item.reasons.length).toBeGreaterThanOrEqual(2);
      expect(item.reasons.length).toBeLessThanOrEqual(3);
      expect(item.tradeoffs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('"없어요" 이유는 해당 요소가 실제로 0 이고 비교 대상에는 있을 때만 나온다', () => {
    for (const item of result.items) {
      const route = byId.get(item.routeId)!;
      for (const reason of item.reasons.filter((r) => r.kind === 'none' && r.factor)) {
        expect(exclusiveValue(route.factors, reason.factor!)).toBe(0);
        const others = candidates.filter((c) => c.id !== route.id).map((c) => exclusiveValue(c.factors, reason.factor!));
        expect(others.some((v) => v !== null && v > 0)).toBe(true);
      }
    }
  });

  it('"N 적어요" 이유는 가장 빠른 경로와 비교한 실제 차이를 말한다', () => {
    for (const item of result.items) {
      if (item.routeId === fastest.id) continue;
      const route = byId.get(item.routeId)!;
      for (const reason of item.reasons.filter((r) => r.kind === 'fewer' && r.factor)) {
        const mine = exclusiveValue(route.factors, reason.factor!)!;
        const base = exclusiveValue(fastest.factors, reason.factor!)!;
        expect(base - mine).toBeGreaterThan(0);
        const counter = FACTORS[reason.factor!].counter;
        const diff = counter === 'km' ? (base - mine).toFixed(1) : String(Math.round(base - mine));
        expect(reason.text).toContain(diff);
      }
    }
  });

  it('서로 다른 경로에 같은 문구를 무조건 반복하지 않는다', () => {
    const lists = result.items.map((i) => i.reasons.map((r) => r.text).join('|'));
    expect(new Set(lists).size).toBe(lists.length);
  });

  it('정보가 없는 요소는 "확인할 점"으로 알린다 (없다고 말하지 않는다)', () => {
    const partialRoute = result.items.find((i) => byId.get(i.routeId)!.factors.ACCIDENT_ZONE.availability === 'partial')!;
    expect(partialRoute.hasMissingInfo).toBe(true);
    expect(partialRoute.tradeoffs.some((t) => t.kind === 'unknown_info')).toBe(true);
    const noneClaim = partialRoute.reasons.find((r) => r.factor === 'ACCIDENT_ZONE' && r.kind === 'none');
    expect(noneClaim).toBeUndefined();
  });

  it('특징 제목은 설정이 바뀌어도 그대로다 (경로의 객관적 특징)', () => {
    const a = run(profileOf());
    const b = run(profileOf({ priorities: { U_TURN: 'avoid' }, roadTypePreference: 'highway', maxExtraMinutes: 20 }));
    const titles = (r: RecommendationResult) => Object.fromEntries(r.items.map((i) => [i.routeId, i.headline]));
    expect(titles(a)).toEqual(titles(b));
    expect(new Set(Object.values(titles(a))).size).toBe(3);
  });

  it('선택·추천은 서로 다른 상태다: 추천 경로는 정확히 하나이고 목록 순서는 설정이 같으면 안정적이다', () => {
    const again = run(profileOf({ priorities: { LANE_CHANGE: 'avoid', UNPROTECTED_LEFT: 'avoid' } }));
    expect(again.items.map((i) => i.routeId)).toEqual(result.items.map((i) => i.routeId));
    expect(result.items.filter((i) => i.isRecommended)).toHaveLength(1);
  });
});

describe('개인화 데모: 어려웠다고 평가하고 반영하면 다음 추천이 달라진다', () => {
  it('유턴이 어려웠다고 평가하면 유턴이 있는 경로의 부담이 올라가고 설정과의 관계에 나타난다', () => {
    const profile = profileOf();
    const before = run(profile);
    const learned = applyLearning(profile, emptyLearned(), { rating: 'hard', factors: ['U_TURN'], appliedToRecommendations: true }, NOW).learned;
    const after = run(profile, learned);

    const fastId = candidates.find((c) => c.label === 'A')!.id; // 유턴이 있는 경로
    const relation = (r: RecommendationResult) => r.items.find((i) => i.routeId === fastId)!.settingsRelation.find((x) => x.factor === 'U_TURN');
    expect(relation(before)).toBeUndefined();
    expect(relation(after)).toMatchObject({ source: 'learned' });
    const calmId = candidates.find((c) => c.label === 'C')!.id;
    expect(after.items.find((i) => i.routeId === calmId)!.settingsRelation.find((x) => x.factor === 'U_TURN')).toMatchObject({ standing: 'lowest' });
  });

  it('직접 정한 설정이 있으면 같은 평가로도 추천이 바뀌지 않는다', () => {
    const profile = profileOf({ priorities: { U_TURN: 'relaxed' } });
    const learned = applyLearning(profile, emptyLearned(), { rating: 'hard', factors: ['U_TURN'], appliedToRecommendations: true }, NOW).learned;
    expect(resolvePreferences(profile, learned).signature).toBe(resolvePreferences(profile, emptyLearned()).signature);
  });
});

describe('후보 수가 적은 목적지', () => {
  it('후보가 1개면 비교할 수 없다고 알린다', () => {
    const single = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE.mart!);
    const result = recommend(single.candidates, resolvePreferences(profileOf(), emptyLearned()), single.excluded);
    expect(result.items).toHaveLength(1);
    expect(result.notices.some((n) => n.kind === 'single_candidate')).toBe(true);
    expect(result.items[0]!.isRecommended).toBe(true);
  });

  it('후보가 없으면 추천도 없고 제외 사유만 남는다', () => {
    const none = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['riverside-parking']!);
    const result = recommend(none.candidates, resolvePreferences(profileOf(), emptyLearned()), none.excluded);
    expect(result.items).toHaveLength(0);
    expect(result.recommendedRouteId).toBeNull();
    expect(result.notices.some((n) => n.kind === 'excluded_restricted')).toBe(true);
  });
});

describe('추천 입력을 바꾸지 않는다', () => {
  it('후보 객체를 변경하지 않는다 (추천 결과와 도로 특성은 별개)', () => {
    const snapshot = JSON.stringify(candidates);
    run(profileOf({ maxExtraMinutes: 0 }));
    run(profileOf({ priorities: { U_TURN: 'avoid' } }));
    expect(JSON.stringify(candidates)).toBe(snapshot);
  });
});

// 타입 확인용
export type _Unused = RouteCandidate;
