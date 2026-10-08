import {
  LEARNING_DELTA_MAX,
  LEARNING_DELTA_MIN,
  LEARNING_ESTABLISHED_FEEDBACK_COUNT,
  applyLearning,
  emptyLearned,
  learningStatus,
  previewLearning,
} from '../learning';
import { createDefaultProfile, describeFactorSetting, resolvePreferences } from '../preferences';
import type { DriverProfile, Feedback } from '../types';
import { NOW } from './fixtures';

const profile = (patch: Partial<DriverProfile> = {}): DriverProfile => ({
  ...createDefaultProfile(NOW),
  consent: { saveRecords: true, usePersonalization: true },
  ...patch,
});

const hard = (...factors: Feedback['factors']): Feedback => ({ rating: 'hard', factors, appliedToRecommendations: true });
const easy = (...factors: Feedback['factors']): Feedback => ({ rating: 'easy', factors, appliedToRecommendations: true });

describe('선호 해석 (resolvePreferences)', () => {
  it('기본값은 모든 요소가 보통(1.0)이고 직접 정한 값이 없다', () => {
    const p = resolvePreferences(profile(), emptyLearned());
    expect(p.weights.U_TURN).toBe(1);
    expect(p.weightSources.U_TURN).toBe('default');
  });

  it('직접 정한 값이 가장 우선한다', () => {
    const base = profile({ priorities: { U_TURN: 'avoid', ROUNDABOUT: 'relaxed' } });
    const learned = applyLearning(profile(), emptyLearned(), hard('ROUNDABOUT'), NOW).learned;
    const p = resolvePreferences(base, learned);
    expect(p.weights.U_TURN).toBeCloseTo(2.2);
    expect(p.weightSources.U_TURN).toBe('user');
    // 직접 "신경 안 써요"로 정한 요소는 학습된 값보다 우선한다
    expect(p.weights.ROUNDABOUT).toBeCloseTo(0.3);
    expect(p.weightSources.ROUNDABOUT).toBe('user');
  });

  it('모의 학습 결과는 개인화에 동의했을 때만 쓰인다', () => {
    const learned = applyLearning(profile(), emptyLearned(), hard('U_TURN'), NOW).learned;
    const on = resolvePreferences(profile(), learned);
    expect(on.weights.U_TURN).toBeCloseTo(1.4);
    expect(on.weightSources.U_TURN).toBe('learned');
    const off = resolvePreferences(profile({ consent: { saveRecords: true, usePersonalization: false } }), learned);
    expect(off.weights.U_TURN).toBe(1);
    expect(off.weightSources.U_TURN).toBe('default');
  });

  it('운전 빈도는 직접 정하지 않은 복잡한 조작 요소의 시작점만 올린다', () => {
    const rare = resolvePreferences(profile({ frequency: 'rare' }), emptyLearned());
    expect(rare.weights.LANE_CHANGE).toBeCloseTo(1.25);
    expect(rare.weights.TRAFFIC_LIGHT).toBe(1); // 복잡한 조작 요소가 아님
    const explicit = resolvePreferences(profile({ frequency: 'rare', priorities: { LANE_CHANGE: 'normal' } }), emptyLearned());
    expect(explicit.weights.LANE_CHANGE).toBe(1); // 직접 정한 값에는 영향 없음
  });

  it('선호가 바뀌면 signature 가 달라진다 (오래된 추천 감지용)', () => {
    const a = resolvePreferences(profile(), emptyLearned()).signature;
    const b = resolvePreferences(profile({ maxExtraMinutes: 5 }), emptyLearned()).signature;
    const c = resolvePreferences(profile({ priorities: { U_TURN: 'avoid' } }), emptyLearned()).signature;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(resolvePreferences(profile(), emptyLearned()).signature).toBe(a);
  });

  it('설정 화면용 문구가 출처를 구분한다', () => {
    const p = profile({ priorities: { U_TURN: 'avoid' } });
    const learned = applyLearning(p, emptyLearned(), hard('ROUNDABOUT'), NOW).learned;
    const prefs = resolvePreferences(p, learned);
    expect(describeFactorSetting('U_TURN', p, prefs).text).toBe('되도록 피하고 싶어요');
    expect(describeFactorSetting('ROUNDABOUT', p, prefs).text).toContain('평가 반영');
    expect(describeFactorSetting('TRAFFIC_LIGHT', p, prefs).text).toBe('자동 · 보통');
  });
});

describe('모의 개인화 규칙 (applyLearning)', () => {
  it('어려웠다고 고른 요소는 올리고, 쉬웠다고 고른 요소는 낮춘다', () => {
    const afterHard = applyLearning(profile(), emptyLearned(), hard('U_TURN'), NOW);
    expect(afterHard.learned.adjustments.U_TURN?.delta).toBeCloseTo(0.4);
    expect(afterHard.learned.adjustments.U_TURN?.hardCount).toBe(1);
    const afterEasy = applyLearning(profile(), emptyLearned(), easy('ROUNDABOUT'), NOW);
    expect(afterEasy.learned.adjustments.ROUNDABOUT?.delta).toBeCloseTo(-0.2);
    expect(afterEasy.learned.adjustments.ROUNDABOUT?.easyCount).toBe(1);
  });

  it('요소를 고르지 않은 평가나 "보통" 평가는 아무것도 바꾸지 않는다', () => {
    const none = applyLearning(profile(), emptyLearned(), hard(), NOW);
    expect(none.learned.feedbackCount).toBe(0);
    const normal = applyLearning(profile(), emptyLearned(), { rating: 'normal', factors: ['U_TURN'], appliedToRecommendations: true }, NOW);
    expect(normal.learned.adjustments).toEqual({});
  });

  it('반영하지 않기로 했거나 개인화가 꺼져 있으면 값을 바꾸지 않는다', () => {
    const base = emptyLearned();
    const declined = applyLearning(profile(), base, { ...hard('U_TURN'), appliedToRecommendations: false }, NOW);
    expect(declined.learned).toBe(base);
    const off = applyLearning(profile({ consent: { saveRecords: true, usePersonalization: false } }), base, hard('U_TURN'), NOW);
    expect(off.learned).toBe(base);
  });

  it('직접 정한 요소는 평가로 바뀌지 않고, 그 사실을 알려준다', () => {
    const p = profile({ priorities: { U_TURN: 'relaxed' } });
    const result = applyLearning(p, emptyLearned(), hard('U_TURN', 'ROUNDABOUT'), NOW);
    expect(result.learned.adjustments.U_TURN).toBeUndefined();
    expect(result.learned.adjustments.ROUNDABOUT).toBeDefined();
    expect(result.effects.find((e) => e.factor === 'U_TURN')).toMatchObject({ applied: false, skipReason: 'user_override' });
    expect(previewLearning(p, hard('U_TURN'))[0]).toMatchObject({ applied: false });
  });

  it('조정 폭에는 상한과 하한이 있다', () => {
    let learned = emptyLearned();
    for (let i = 0; i < 10; i++) learned = applyLearning(profile(), learned, hard('U_TURN'), NOW).learned;
    expect(learned.adjustments.U_TURN?.delta).toBeCloseTo(LEARNING_DELTA_MAX);
    for (let i = 0; i < 10; i++) learned = applyLearning(profile(), learned, easy('ROUNDABOUT'), NOW).learned;
    expect(learned.adjustments.ROUNDABOUT?.delta).toBeCloseTo(LEARNING_DELTA_MIN);
  });

  it('점수에 쓰이지 않는 참고 항목(차로 수)은 조정하지 않는다', () => {
    const result = applyLearning(profile(), emptyLearned(), hard('LANE_COUNT'), NOW);
    expect(result.learned.adjustments.LANE_COUNT).toBeUndefined();
  });

  it('원본 상태를 바꾸지 않는다 (불변)', () => {
    const base = emptyLearned();
    applyLearning(profile(), base, hard('U_TURN'), NOW);
    expect(base).toEqual({ adjustments: {}, feedbackCount: 0 });
  });
});

describe('학습 상태 문구', () => {
  it('기록이 적을 때는 확정하지 않고 "알아가는 중"이라고 말한다', () => {
    expect(learningStatus(emptyLearned()).phase).toBe('none');
    let learned = emptyLearned();
    learned = applyLearning(profile(), learned, hard('U_TURN'), NOW).learned;
    expect(learningStatus(learned)).toEqual({ phase: 'exploring', text: '아직 취향을 알아가는 중이에요.' });
    for (let i = 1; i < LEARNING_ESTABLISHED_FEEDBACK_COUNT; i++) {
      learned = applyLearning(profile(), learned, hard('U_TURN'), NOW).learned;
    }
    expect(learningStatus(learned).phase).toBe('established');
  });
});
