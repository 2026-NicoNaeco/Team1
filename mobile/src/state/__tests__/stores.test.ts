import { emptyLearned } from '../../domain/learning';
import { createSimulationRecord } from '../../domain/records';
import type { RouteCandidate, SimulationRecord } from '../../domain/types';
import { DemoNavigationSimulator } from '../../mock/navigationSimulator';
import { DemoPlaceSearchProvider } from '../../mock/mockPlaceSearch';
import { DemoRecommendationService } from '../../mock/mockRecommendation';
import { DemoRouteProvider } from '../../mock/mockRouteProvider';
import { PLACES } from '../../mock/places';
import { resetScenario, setScenario } from '../../mock/scenario';
import { setServices } from '../../services';
import { FaultInjectingRepository } from '../../services/repository/FaultInjectingRepository';
import { MemoryRepository } from '../../services/repository/MemoryRepository';
import { resetAppStoreForTests, useAppStore } from '../appStore';
import { clock } from '../clock';
import { initTripSync, useTripStore } from '../tripStore';
import { useUiStore } from '../uiStore';

const place = (id: string) => PLACES.find((p) => p.id === id)!;
const memory = new MemoryRepository();
let failing = false;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitFor(cond: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await flush();
  }
}

beforeAll(() => {
  setServices({
    places: new DemoPlaceSearchProvider(),
    routes: new DemoRouteProvider(),
    recommendation: new DemoRecommendationService(),
    createSimulator: () => new DemoNavigationSimulator(),
    repository: new FaultInjectingRepository(memory, () => failing),
  });
  initTripSync();
});
afterAll(() => setServices(null));

beforeEach(async () => {
  failing = false;
  resetScenario();
  setScenario({ searchLatencyMs: 0, routeLatencyMs: 0 });
  await memory.clearAll();
  resetAppStoreForTests();
  useTripStore.getState().resetTrip();
  useTripStore.getState().setOrigin(place('station'));
  useTripStore.getState().setLastRun(null);
  useAppStore.setState({ hydrated: true });
});

const onboard = (overrides: Partial<Parameters<ReturnType<typeof useAppStore.getState>['completeOnboarding']>[0]> = {}) =>
  useAppStore.getState().completeOnboarding({
    frequency: 'sometimes',
    burdens: ['LANE_CHANGE', 'UNPROTECTED_LEFT'],
    roadTypePreference: 'none',
    maxExtraMinutes: 10,
    consent: { saveRecords: true, usePersonalization: true },
    ...overrides,
  });

async function loadTrip(destination = 'univ-gate') {
  useTripStore.getState().setDestination(place(destination));
  await useTripStore.getState().loadRoutes();
}

function sampleRecord(id = clock.id('rec')): SimulationRecord {
  const { candidates, recommendation } = useTripStore.getState();
  const route = candidates[0] as RouteCandidate;
  return createSimulationRecord({
    id,
    nowIso: '2026-10-08T09:00:00.000Z',
    origin: place('station'),
    destination: place('univ-gate'),
    route,
    ranked: recommendation!.items.find((i) => i.routeId === route.id)!,
    recommendedRouteId: recommendation!.recommendedRouteId,
    outcome: 'arrived',
    progress: 1,
    feedback: null,
  });
}

describe('앱 상태: 온보딩과 설정', () => {
  it('온보딩에서 고른 부담 요소는 직접 정한 값(피하기)이 되고 저장된다', async () => {
    onboard();
    await flush();
    const { profile } = useAppStore.getState();
    expect(profile.onboardingCompleted).toBe(true);
    expect(profile.priorities).toEqual({ LANE_CHANGE: 'avoid', UNPROTECTED_LEFT: 'avoid' });
    expect(profile.consent).toEqual({ saveRecords: true, usePersonalization: true });
    expect(memory.profile?.priorities).toEqual(profile.priorities);
  });

  it('건너뛰기: 아무것도 고르지 않으면 직접 정한 값 없이 기본 설정으로 시작한다 (동의는 꺼짐)', () => {
    onboard({ burdens: [], consent: { saveRecords: false, usePersonalization: false }, frequency: 'unknown' });
    const { profile } = useAppStore.getState();
    expect(profile.priorities).toEqual({});
    expect(profile.consent).toEqual({ saveRecords: false, usePersonalization: false });
  });

  it('설정을 바꾸면 저장되고, 직접 정한 값을 지우면 자동으로 돌아간다', async () => {
    onboard();
    useAppStore.getState().setPriority('U_TURN', 'relaxed');
    expect(useAppStore.getState().profile.priorities.U_TURN).toBe('relaxed');
    useAppStore.getState().setPriority('U_TURN', null);
    expect(useAppStore.getState().profile.priorities.U_TURN).toBeUndefined();
    useAppStore.getState().updateProfile({ maxExtraMinutes: 20 });
    await flush();
    expect(memory.profile?.maxExtraMinutes).toBe(20);
  });

  it('앱을 다시 켜면(hydrate) 저장된 설정·기록·개인화 결과가 복원된다', async () => {
    onboard();
    await loadTrip();
    await useAppStore.getState().addRecord(sampleRecord('persisted'));
    useAppStore.getState().applyFeedback({ rating: 'hard', factors: ['NARROW_ROAD'], appliedToRecommendations: true });
    await flush();
    resetAppStoreForTests();
    expect(useAppStore.getState().profile.onboardingCompleted).toBe(false);
    await useAppStore.getState().hydrate();
    const state = useAppStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.profile.onboardingCompleted).toBe(true);
    expect(state.records.map((r) => r.id)).toEqual(['persisted']);
    expect(state.learned.adjustments.NARROW_ROAD?.delta).toBeCloseTo(0.4);
  });

  it('저장소를 읽지 못해도 기본 설정으로 앱을 쓸 수 있다', async () => {
    const original = memory.load.bind(memory);
    memory.load = async () => {
      throw new Error('boom');
    };
    resetAppStoreForTests();
    await useAppStore.getState().hydrate();
    memory.load = original;
    expect(useAppStore.getState().hydrated).toBe(true);
    expect(useAppStore.getState().discardedOnLoad).not.toEqual([]);
    expect(useAppStore.getState().profile.onboardingCompleted).toBe(false);
  });
});

describe('앱 상태: 기록 저장 동의와 저장 실패', () => {
  it('기록 저장에 동의하지 않으면 저장하지 않는다 (최근 목적지도 남기지 않는다)', async () => {
    onboard({ consent: { saveRecords: false, usePersonalization: false } });
    await loadTrip();
    expect(await useAppStore.getState().addRecord(sampleRecord())).toBe('disabled');
    expect(useAppStore.getState().records).toEqual([]);
    expect(useAppStore.getState().recents).toEqual([]);
    expect(memory.records).toEqual([]);
  });

  it('동의하면 최신 기록이 앞에 오고 최근 목적지도 남는다', async () => {
    onboard();
    await loadTrip('park-parking');
    await loadTrip('univ-gate');
    expect(await useAppStore.getState().addRecord(sampleRecord('first'))).toBe('saved');
    expect(await useAppStore.getState().addRecord(sampleRecord('second'))).toBe('saved');
    expect(useAppStore.getState().records.map((r) => r.id)).toEqual(['second', 'first']);
    expect(useAppStore.getState().recents.map((p) => p.id)).toEqual(['univ-gate', 'park-parking']);
    expect(useAppStore.getState().records[0]!.kind).toBe('simulation');
  });

  it('저장이 실패하면 숨기지 않고 알리며, 복구된 뒤 다시 시도하면 성공한다', async () => {
    onboard();
    await loadTrip();
    failing = true;
    expect(await useAppStore.getState().addRecord(sampleRecord('x'))).toBe('failed');
    expect(useAppStore.getState().persistence.status).toBe('error');
    expect(useAppStore.getState().records.map((r) => r.id)).toEqual(['x']); // 화면에는 남아 있다
    await useAppStore.getState().retryPersist();
    expect(useAppStore.getState().persistence.status).toBe('error'); // 아직 실패 중
    failing = false;
    await useAppStore.getState().retryPersist();
    expect(useAppStore.getState().persistence.status).toBe('ok');
    expect(memory.records.map((r) => r.id)).toEqual(['x']);
  });
});

describe('앱 상태: 삭제', () => {
  async function seed() {
    onboard();
    await loadTrip();
    await useAppStore.getState().addRecord(sampleRecord('a'));
    await useAppStore.getState().addRecord(sampleRecord('b'));
    useAppStore.getState().applyFeedback({ rating: 'hard', factors: ['NARROW_ROAD'], appliedToRecommendations: true });
    useAppStore.getState().addRecent(place('hospital'));
    await flush();
  }

  it('개별 기록 삭제', async () => {
    await seed();
    expect(await useAppStore.getState().deleteRecord('a')).toBe(true);
    expect(useAppStore.getState().records.map((r) => r.id)).toEqual(['b']);
    expect(memory.records.map((r) => r.id)).toEqual(['b']);
  });

  it('삭제가 실패하면 지워졌다고 보이지 않게 한다', async () => {
    await seed();
    failing = true;
    expect(await useAppStore.getState().deleteRecord('a')).toBe(false);
    expect(await useAppStore.getState().clearRecords()).toBe(false);
    expect(await useAppStore.getState().resetLearned()).toBe(false);
    expect(await useAppStore.getState().wipeAll()).toBe(false);
    expect(useAppStore.getState().records).toHaveLength(2);
    expect(useAppStore.getState().profile.onboardingCompleted).toBe(true);
  });

  it('기록 삭제와 개인화 초기화는 서로 다른 것을 지운다', async () => {
    await seed();
    expect(await useAppStore.getState().clearRecords()).toBe(true);
    expect(useAppStore.getState().records).toEqual([]);
    expect(useAppStore.getState().learned.feedbackCount).toBe(1); // 개인화 결과는 그대로
    expect(await useAppStore.getState().resetLearned()).toBe(true);
    expect(useAppStore.getState().learned).toEqual(emptyLearned());
    expect(useAppStore.getState().profile.onboardingCompleted).toBe(true); // 설정은 그대로
  });

  it('모든 데이터 삭제: 성향·기록·개인화 결과·최근 목적지를 지우고 처음 상태로 돌아간다', async () => {
    await seed();
    expect(await useAppStore.getState().wipeAll()).toBe(true);
    const s = useAppStore.getState();
    expect(s.profile.onboardingCompleted).toBe(false);
    expect(s.profile.priorities).toEqual({});
    expect(s.records).toEqual([]);
    expect(s.recents).toEqual([]);
    expect(s.learned).toEqual(emptyLearned());
    expect(memory.profile).toBeNull();
    expect(memory.records).toEqual([]);
    expect(memory.recents).toEqual([]);
    expect(memory.learned).toBeNull();
  });
});

describe('앱 상태: 모의 개인화', () => {
  it('직접 정한 요소는 평가로 바뀌지 않고, 정하지 않은 요소는 바뀐다', () => {
    onboard({ burdens: ['U_TURN'] });
    const effects = useAppStore
      .getState()
      .applyFeedback({ rating: 'hard', factors: ['U_TURN', 'ROUNDABOUT'], appliedToRecommendations: true });
    expect(effects.find((e) => e.factor === 'U_TURN')?.applied).toBe(false);
    expect(effects.find((e) => e.factor === 'ROUNDABOUT')?.applied).toBe(true);
    expect(useAppStore.getState().learned.adjustments.U_TURN).toBeUndefined();
    expect(useAppStore.getState().learned.adjustments.ROUNDABOUT?.delta).toBeCloseTo(0.4);
  });

  it('개인화에 동의하지 않았으면 평가를 반영하지 않는다', () => {
    onboard({ consent: { saveRecords: true, usePersonalization: false } });
    const effects = useAppStore.getState().applyFeedback({ rating: 'hard', factors: ['ROUNDABOUT'], appliedToRecommendations: true });
    expect(effects).toEqual([]);
    expect(useAppStore.getState().learned).toEqual(emptyLearned());
  });
});

describe('경로 상태: 조회와 선택', () => {
  it('목적지를 정하고 조회하면 후보·추천이 채워지고 추천 경로가 선택된다', async () => {
    onboard();
    useTripStore.getState().setDestination(place('univ-gate'));
    expect(useTripStore.getState().status).toBe('idle');
    const loading = useTripStore.getState().loadRoutes();
    expect(useTripStore.getState().status).toBe('loading');
    await loading;
    const s = useTripStore.getState();
    expect(s.status).toBe('ready');
    expect(s.candidates).toHaveLength(3);
    expect(s.selectedRouteId).toBe(s.recommendation!.recommendedRouteId);
    expect(s.selectionMode).toBe('auto');
  });

  it('카드를 눌러 선택해도 추천과 순서는 바뀌지 않는다 (선택과 추천은 별개)', async () => {
    onboard();
    await loadTrip();
    const before = useTripStore.getState().recommendation!;
    const other = useTripStore.getState().candidates.find((c) => c.id !== before.recommendedRouteId)!;
    useTripStore.getState().selectRoute(other.id);
    const s = useTripStore.getState();
    expect(s.selectedRouteId).toBe(other.id);
    expect(s.selectionMode).toBe('manual');
    expect(s.recommendation).toBe(before);
    expect(s.recommendation!.items.map((i) => i.routeId)).toEqual(before.items.map((i) => i.routeId));
    useTripStore.getState().selectRoute('does-not-exist');
    expect(useTripStore.getState().selectedRouteId).toBe(other.id);
  });

  it('새 목적지를 정하면 이전 경로·추천·선택이 즉시 사라진다', async () => {
    onboard();
    await loadTrip();
    useTripStore.getState().setDestination(place('park-parking'));
    const s = useTripStore.getState();
    expect(s.status).toBe('idle');
    expect(s.candidates).toEqual([]);
    expect(s.recommendation).toBeNull();
    expect(s.selectedRouteId).toBeNull();
  });

  it('오래된 응답은 버린다: 느린 조회 도중 목적지를 바꾸면 새 목적지의 결과만 남는다', async () => {
    onboard();
    setScenario({ routeLatencyMs: 40 });
    useTripStore.getState().setDestination(place('univ-gate'));
    const slow = useTripStore.getState().loadRoutes();
    await flush();
    useTripStore.getState().setDestination(place('mart'));
    setScenario({ routeLatencyMs: 0 });
    await useTripStore.getState().loadRoutes();
    await slow;
    const s = useTripStore.getState();
    expect(s.destination?.id).toBe('mart');
    expect(s.candidates).toHaveLength(1);
    expect(s.candidates[0]!.id.endsWith('~a0~A') || s.candidates[0]!.id.includes('a0')).toBe(true);
  });

  it('조회 실패 → 다시 시도하면 성공한다', async () => {
    onboard();
    setScenario({ routeFetch: 'fail_once' });
    useTripStore.getState().setDestination(place('univ-gate'));
    await useTripStore.getState().loadRoutes();
    expect(useTripStore.getState().status).toBe('error');
    expect(useTripStore.getState().error).toMatchObject({ code: 'NETWORK', retryable: true });
    expect(useTripStore.getState().candidates).toEqual([]);
    await useTripStore.getState().loadRoutes();
    expect(useTripStore.getState().status).toBe('ready');
    expect(useTripStore.getState().error).toBeNull();
  });

  it('후보가 없으면 오류가 아니라 빈 상태로 다루고 제외 사유를 남긴다', async () => {
    onboard();
    await loadTrip('riverside-parking');
    expect(useTripStore.getState().status).toBe('empty');
    expect(useTripStore.getState().excluded).toHaveLength(1);
    expect(useTripStore.getState().recommendation).toBeNull();
  });
});

describe('경로 상태: 설정이 바뀌면 추천을 다시 계산한다', () => {
  it('도로 특성(후보)은 그대로 두고 추천만 새로 만든다', async () => {
    onboard({ burdens: [] });
    await loadTrip();
    const { candidates, recommendation } = useTripStore.getState();
    useAppStore.getState().updateProfile({ maxExtraMinutes: 0 });
    await waitFor(() => useTripStore.getState().recommendation !== recommendation);
    const after = useTripStore.getState();
    expect(after.candidates).toBe(candidates);
    expect(after.recommendation!.preferenceSignature).not.toBe(recommendation!.preferenceSignature);
    expect(after.recommendation!.recommendedRouteId).not.toBe(recommendation!.recommendedRouteId);
    expect(after.selectedRouteId).toBe(after.recommendation!.recommendedRouteId); // 자동 선택은 새 추천을 따라간다
    expect(after.recomputeNotice).not.toBeNull();
  });

  it('사용자가 직접 고른 경로는 설정이 바뀌어도 유지된다', async () => {
    onboard({ burdens: [] });
    await loadTrip();
    const picked = useTripStore.getState().candidates.find((c) => c.label === 'A')!;
    useTripStore.getState().selectRoute(picked.id);
    const before = useTripStore.getState().recommendation;
    useAppStore.getState().updateProfile({ maxExtraMinutes: 5 });
    await waitFor(() => useTripStore.getState().recommendation !== before);
    expect(useTripStore.getState().selectedRouteId).toBe(picked.id);
    expect(useTripStore.getState().selectionMode).toBe('manual');
  });

  it('추천에 영향이 없는 변경이면 다시 계산하지 않는다', async () => {
    onboard();
    await loadTrip();
    const before = useTripStore.getState().recommendation;
    useAppStore.getState().setConsent({ saveRecords: false }); // 기록 저장은 추천과 무관
    await flush();
    expect(useTripStore.getState().recommendation).toBe(before);
  });

  it('조회 전에는 아무것도 하지 않는다', async () => {
    onboard();
    useAppStore.getState().updateProfile({ maxExtraMinutes: 5 });
    await flush();
    expect(useTripStore.getState().recommendation).toBeNull();
    expect(useTripStore.getState().status).toBe('idle');
  });
});

describe('화면 상태: 시연 안내와 개발용 도구', () => {
  it('시연 안내 확인과 개발용 도구는 처음에는 꺼져 있고, 켜면 이번 실행 동안 유지된다', () => {
    const initial = useUiStore.getState();
    expect(initial.demoNoticeAcknowledged).toBe(false);
    expect(initial.devToolsUnlocked).toBe(false);
    useUiStore.getState().acknowledgeDemoNotice();
    useUiStore.getState().unlockDevTools();
    expect(useUiStore.getState().demoNoticeAcknowledged).toBe(true);
    expect(useUiStore.getState().devToolsUnlocked).toBe(true);
    useUiStore.setState({ demoNoticeAcknowledged: false, devToolsUnlocked: false });
  });
});
