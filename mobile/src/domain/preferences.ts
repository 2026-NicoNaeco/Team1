import { COMPLEX_FACTORS, FACTOR_ORDER, FACTORS } from './factors';
import type {
  DriverProfile,
  DrivingFrequency,
  EffectivePreferences,
  FactorCode,
  LearnedState,
  PriorityLevel,
  WeightSource,
} from './types';

export const DEFAULT_MAX_EXTRA_MINUTES = 10;
export const MAX_EXTRA_MINUTES_RANGE = { min: 0, max: 30, step: 5 } as const;

/** 사용자가 직접 정한 우선순위가 가중치에 곱해지는 값 */
export const PRIORITY_WEIGHT: Record<PriorityLevel, number> = {
  relaxed: 0.3,
  normal: 1.0,
  avoid: 2.2,
};

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  relaxed: '신경 안 써요',
  normal: '보통',
  avoid: '되도록 피하고 싶어요',
};

export const FREQUENCY_LABEL: Record<DrivingFrequency, string> = {
  rare: '거의 안 해요',
  sometimes: '가끔 해요',
  often: '자주 해요',
  unknown: '아직 잘 모르겠어요',
};

/**
 * 운전 빈도가 적을수록 "직접 정하지 않은 복잡한 조작 요소"의 기본 가중치를 조금 올린다 (모의 규칙).
 * 운전 능력을 평가하는 값이 아니라 직접 정하지 않은 항목의 시작점일 뿐이며, 직접 정한 값이 있으면 쓰이지 않는다.
 */
const FREQUENCY_PRIOR: Record<DrivingFrequency, number> = {
  rare: 0.25,
  sometimes: 0.1,
  often: 0,
  unknown: 0,
};

const WEIGHT_MIN = 0.3;
const WEIGHT_MAX = 3.0;

export function createDefaultProfile(nowIso: string): DriverProfile {
  return {
    schemaVersion: 1,
    onboardingCompleted: false,
    frequency: 'unknown',
    roadTypePreference: 'none',
    maxExtraMinutes: DEFAULT_MAX_EXTRA_MINUTES,
    priorities: {},
    // 저장·개인화는 사용자가 직접 켤 때만 동작한다.
    consent: { saveRecords: false, usePersonalization: false },
    updatedAt: nowIso,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 프로필과 모의 학습 결과를 추천 서비스가 쓰는 선호로 합친다.
 * 우선순위: 사용자가 직접 정한 값 > 모의 학습 > 기본값(+운전 빈도 시작점)
 */
export function resolvePreferences(profile: DriverProfile, learned: LearnedState): EffectivePreferences {
  const weights = {} as Record<FactorCode, number>;
  const weightSources = {} as Record<FactorCode, WeightSource>;

  for (const code of FACTOR_ORDER) {
    const info = FACTORS[code];
    if (!info.scored) {
      weights[code] = 0;
      weightSources[code] = 'default';
      continue;
    }
    const explicit = profile.priorities[code];
    if (explicit) {
      weights[code] = PRIORITY_WEIGHT[explicit];
      weightSources[code] = 'user';
      continue;
    }
    let weight = 1;
    if (COMPLEX_FACTORS.includes(code)) weight += FREQUENCY_PRIOR[profile.frequency];
    let source: WeightSource = 'default';
    const adjustment = profile.consent.usePersonalization ? learned.adjustments[code] : undefined;
    if (adjustment && adjustment.delta !== 0) {
      weight += adjustment.delta;
      source = 'learned';
    }
    weights[code] = clamp(weight, WEIGHT_MIN, WEIGHT_MAX);
    weightSources[code] = source;
  }

  const signature = [
    profile.maxExtraMinutes,
    profile.roadTypePreference,
    ...FACTOR_ORDER.map((c) => weights[c].toFixed(3)),
  ].join('|');

  return {
    weights,
    weightSources,
    roadTypePreference: profile.roadTypePreference,
    maxExtraMinutes: profile.maxExtraMinutes,
    signature,
  };
}

/** 설정 화면에 보여줄 현재 상태 문구 */
export function describeFactorSetting(
  code: FactorCode,
  profile: DriverProfile,
  prefs: EffectivePreferences,
): { text: string; source: WeightSource } {
  const source = prefs.weightSources[code];
  if (source === 'user') {
    return { text: PRIORITY_LABEL[profile.priorities[code] ?? 'normal'], source };
  }
  if (source === 'learned') return { text: '자동 · 평가 반영 중', source };
  return { text: '자동 · 보통', source };
}
