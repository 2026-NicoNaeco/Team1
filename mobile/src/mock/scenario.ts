import type { FactorCode } from '../domain/types';

/**
 * 개발용 시나리오 스위치.
 * 오류·지연·정보 누락 같은 상태를 문구가 아니라 실제 동작으로 재현하기 위한 값이다.
 * 일반 사용자 화면에는 노출하지 않고(설정 > 데모 안내 > 개발용 시나리오), 앱을 다시 켜면 초기화된다.
 */

export type RouteFetchMode = 'ok' | 'fail_once' | 'fail_always' | 'no_eligible';

export interface MockScenario {
  /** 장소 검색 응답 지연(ms) */
  searchLatencyMs: number;
  /** 경로 조회 응답 지연(ms) */
  routeLatencyMs: number;
  routeFetch: RouteFetchMode;
  /** 교통량·사고다발구간 정보를 확인할 수 없는 상태로 만든다 */
  hideRoadInfo: boolean;
  /** 로컬 저장이 실패하는 상태로 만든다 */
  storageFails: boolean;
  /** 시뮬레이션 진행 배속 (실제 소요 시간 대비). 개발 중 빠르게 확인하기 위한 값 */
  simulationSpeedup: number;
}

export const DEFAULT_SCENARIO: MockScenario = {
  searchLatencyMs: 350,
  routeLatencyMs: 800,
  routeFetch: 'ok',
  hideRoadInfo: false,
  storageFails: false,
  simulationSpeedup: 14,
};

export const HIDDEN_ROAD_INFO: FactorCode[] = ['TRAFFIC_VOLUME', 'ACCIDENT_ZONE'];

let current: MockScenario = { ...DEFAULT_SCENARIO };
/** fail_once 모드에서 이미 한 번 실패했는지 */
let failedOnce = false;
const listeners = new Set<() => void>();

export function getScenario(): MockScenario {
  return current;
}

export function setScenario(patch: Partial<MockScenario>): void {
  if (patch.routeFetch !== undefined && patch.routeFetch !== current.routeFetch) failedOnce = false;
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

export function resetScenario(): void {
  failedOnce = false;
  current = { ...DEFAULT_SCENARIO };
  listeners.forEach((l) => l());
}

export function subscribeScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** fail_once 모드: 첫 호출만 실패시키고 이후에는 성공시킨다 */
export function consumeFailOnce(): boolean {
  if (current.routeFetch !== 'fail_once') return false;
  if (failedOnce) return false;
  failedOnce = true;
  return true;
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
