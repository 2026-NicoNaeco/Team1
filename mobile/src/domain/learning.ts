import { FACTORS } from './factors';
import type { DriverProfile, Feedback, FactorCode, LearnedState } from './types';

/**
 * 모의 개인화 규칙. 실제 학습 모델이 아니다.
 *
 * - 경로를 선택했다는 사실만으로는 아무것도 학습하지 않는다. 명시적인 피드백만 쓴다.
 * - 어려웠다(hard)고 고른 요소는 기본 가중치에 +0.4, 쉬웠다(easy)고 고른 요소는 -0.2 를 더한다.
 * - "보통" 평가와 요소를 고르지 않은 평가는 값을 바꾸지 않는다.
 * - 사용자가 직접 정한 요소는 바꾸지 않는다. (직접 설정 > 모의 학습)
 * - 사용자가 반영하겠다고 한 피드백만, 개인화를 켠 경우에만 적용한다.
 */

export const LEARNING_STEP_HARD = 0.4;
export const LEARNING_STEP_EASY = -0.2;
export const LEARNING_DELTA_MAX = 1.2;
export const LEARNING_DELTA_MIN = -0.4;
/** 이 횟수 미만이면 "아직 취향을 알아가는 중"으로 표시한다 */
export const LEARNING_ESTABLISHED_FEEDBACK_COUNT = 3;

export function emptyLearned(): LearnedState {
  return { adjustments: {}, feedbackCount: 0 };
}

export type LearningSkipReason = 'user_override' | 'not_adjustable';

export interface LearningEffect {
  factor: FactorCode;
  applied: boolean;
  skipReason?: LearningSkipReason;
  direction: 'raise' | 'lower';
}

function clamp(v: number): number {
  return Math.min(LEARNING_DELTA_MAX, Math.max(LEARNING_DELTA_MIN, v));
}

/** 피드백을 반영하면 무엇이 달라지는지 미리 계산한다 (저장하지 않음) */
export function previewLearning(
  profile: DriverProfile,
  feedback: Pick<Feedback, 'rating' | 'factors'>,
): LearningEffect[] {
  if (feedback.rating === 'normal') return [];
  const direction = feedback.rating === 'hard' ? 'raise' : 'lower';
  return feedback.factors.map((factor): LearningEffect => {
    if (!FACTORS[factor].scored) return { factor, applied: false, skipReason: 'not_adjustable', direction };
    if (profile.priorities[factor]) return { factor, applied: false, skipReason: 'user_override', direction };
    return { factor, applied: true, direction };
  });
}

export function applyLearning(
  profile: DriverProfile,
  learned: LearnedState,
  feedback: Feedback,
  nowIso: string,
): { learned: LearnedState; effects: LearningEffect[] } {
  if (!feedback.appliedToRecommendations || !profile.consent.usePersonalization) {
    return { learned, effects: [] };
  }
  const effects = previewLearning(profile, feedback);
  const applicable = effects.filter((e) => e.applied);
  if (applicable.length === 0) return { learned, effects };

  const adjustments = { ...learned.adjustments };
  for (const effect of applicable) {
    const prev = adjustments[effect.factor];
    const hard = feedback.rating === 'hard';
    adjustments[effect.factor] = {
      factor: effect.factor,
      delta: clamp((prev?.delta ?? 0) + (hard ? LEARNING_STEP_HARD : LEARNING_STEP_EASY)),
      hardCount: (prev?.hardCount ?? 0) + (hard ? 1 : 0),
      easyCount: (prev?.easyCount ?? 0) + (hard ? 0 : 1),
      updatedAt: nowIso,
    };
  }
  return {
    learned: { adjustments, feedbackCount: learned.feedbackCount + 1 },
    effects,
  };
}

export type LearningPhase = 'none' | 'exploring' | 'established';

export function learningStatus(learned: LearnedState): { phase: LearningPhase; text: string } {
  if (learned.feedbackCount === 0) {
    return { phase: 'none', text: '아직 반영된 피드백이 없어요.' };
  }
  if (learned.feedbackCount < LEARNING_ESTABLISHED_FEEDBACK_COUNT) {
    return { phase: 'exploring', text: '아직 취향을 알아가는 중이에요.' };
  }
  return { phase: 'established', text: `피드백 ${learned.feedbackCount}번을 추천에 반영하고 있어요.` };
}
