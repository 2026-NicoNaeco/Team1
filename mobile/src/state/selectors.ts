import { useMemo } from 'react';
import { resolvePreferences } from '../domain/preferences';
import type { EffectivePreferences } from '../domain/types';
import { useAppStore } from './appStore';

/** 프로필과 모의 학습 결과를 합친, 지금 추천에 쓰이는 선호 */
export function useEffectivePreferences(): EffectivePreferences {
  const profile = useAppStore((s) => s.profile);
  const learned = useAppStore((s) => s.learned);
  return useMemo(() => resolvePreferences(profile, learned), [profile, learned]);
}
