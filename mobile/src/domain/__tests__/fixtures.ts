import { FACTOR_ORDER, FACTORS } from '../factors';
import type { FactorCode, Measurement, RouteFactors } from '../types';

const SOURCE = { kind: 'demo_sample', name: '테스트' } as const;

export const known = (code: FactorCode, value: number): Measurement => ({
  availability: 'known',
  value,
  unit: FACTORS[code].unit,
  source: SOURCE,
  verification: 'unverified',
});

export const unknown = (code: FactorCode): Measurement => ({
  availability: 'unknown',
  unit: FACTORS[code].unit,
  source: SOURCE,
});

export const partial = (code: FactorCode, value: number): Measurement => ({
  availability: 'partial',
  value,
  unit: FACTORS[code].unit,
  coverage: 0.5,
  source: SOURCE,
  verification: 'unverified',
});

/** 모든 요소가 "확인했고 0"인 경로 특성. 필요한 항목만 덮어쓴다. */
export function makeFactors(overrides: Partial<Record<FactorCode, Measurement>> = {}): RouteFactors {
  const factors = {} as RouteFactors;
  for (const code of FACTOR_ORDER) factors[code] = overrides[code] ?? known(code, 0);
  return factors;
}

export const NOW = '2026-10-08T09:00:00.000Z';
