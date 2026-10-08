import { cumulativeDistances } from '../../domain/geo';
import { distanceToPolyline } from '../../map/chipAnchor';
import { geoToLocal } from '../demoCity/projection';
import { DemoNavigationSimulator } from '../navigationSimulator';
import { DemoPlaceSearchProvider } from '../mockPlaceSearch';
import { DemoRouteProvider, computeRoutes, DEMO_GRAPH } from '../mockRouteProvider';
import { DEMO_ORIGIN, PLACES, PLACE_NODE } from '../places';
import { DEFAULT_SCENARIO, resetScenario, setScenario } from '../scenario';
import { RouteProviderError, type SimulationSnapshot } from '../../services/types';

beforeEach(() => {
  resetScenario();
  setScenario({ searchLatencyMs: 0, routeLatencyMs: 0 });
});
afterAll(() => resetScenario());

describe('장소 검색 (샘플 안에서만)', () => {
  const provider = new DemoPlaceSearchProvider();

  it('이름·주소·종류로 찾는다', async () => {
    expect((await provider.search('한빛대학교')).map((p) => p.id)).toContain('univ-gate');
    expect((await provider.search('병원로')).map((p) => p.id)).toEqual(['hospital']);
    expect((await provider.search('주차장')).length).toBeGreaterThanOrEqual(3);
    expect((await provider.search(' 한빛 대학교 ')).length).toBeGreaterThan(0);
  });

  it('초성으로도 찾는다', async () => {
    expect((await provider.search('ㅎㅂㄷㅎㄱ')).map((p) => p.id)).toContain('univ-gate');
  });

  it('샘플에 없는 검색어에는 빈 결과를 돌려주고 없는 장소를 만들어 내지 않는다', async () => {
    expect(await provider.search('스타벅스')).toEqual([]);
    expect(await provider.search('')).toEqual([]);
    expect(await provider.search('   ')).toEqual([]);
  });

  it('긴 장소명과 긴 주소도 그대로 돌려준다', async () => {
    const [annex] = await provider.search('국제교류관');
    expect(annex!.name.length).toBeGreaterThan(30);
    expect(annex!.address.length).toBeGreaterThan(40);
  });

  it('데모 위치(출발지)는 실제 위치 권한 없이 쓸 수 있는 고정 장소다', () => {
    expect(provider.getDefaultOrigin()).toBe(DEMO_ORIGIN);
    expect(DEMO_ORIGIN.name).toContain('데모 위치');
  });

  it('진행 중인 검색을 취소할 수 있다', async () => {
    setScenario({ searchLatencyMs: 50 });
    const controller = new AbortController();
    const pending = provider.search('병원', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('경로 제공자의 개발용 시나리오', () => {
  const provider = new DemoRouteProvider();
  const origin = DEMO_ORIGIN;
  const univ = PLACES.find((p) => p.id === 'univ-gate')!;

  it('정상: 후보를 돌려준다', async () => {
    const result = await provider.findRoutes(origin, univ);
    expect(result.candidates).toHaveLength(3);
  });

  it('한 번 실패 후 성공: 첫 호출만 실패하고 다시 시도하면 성공한다', async () => {
    setScenario({ routeFetch: 'fail_once' });
    await expect(provider.findRoutes(origin, univ)).rejects.toBeInstanceOf(RouteProviderError);
    await expect(provider.findRoutes(origin, univ)).resolves.toMatchObject({ candidates: expect.any(Array) });
  });

  it('계속 실패: 재시도 가능한 오류로 알린다', async () => {
    setScenario({ routeFetch: 'fail_always' });
    for (let i = 0; i < 2; i++) {
      await expect(provider.findRoutes(origin, univ)).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
    }
  });

  it('조건에 맞는 경로 없음: 후보 0개와 제외 사유', async () => {
    setScenario({ routeFetch: 'no_eligible' });
    const result = await provider.findRoutes(origin, univ);
    expect(result.candidates).toEqual([]);
    expect(result.excluded).toHaveLength(1);
  });

  it('도로 정보 일부 없음: 교통량·사고다발구간이 정보 없음이 된다 (0 이 아니다)', async () => {
    setScenario({ hideRoadInfo: true });
    const result = await provider.findRoutes(origin, univ);
    for (const c of result.candidates) {
      expect(c.factors.TRAFFIC_VOLUME.availability).toBe('unknown');
      expect(c.factors.ACCIDENT_ZONE.availability).toBe('unknown');
      expect(c.factors.TURN_COUNT.availability).toBe('known');
      for (const step of c.steps) {
        expect(step.factors.TRAFFIC_VOLUME).toBeUndefined();
        expect(step.factors.ACCIDENT_ZONE).toBeUndefined();
      }
    }
  });

  it('출발지와 도착지가 같으면 재시도해도 소용없는 오류다', async () => {
    await expect(provider.findRoutes(univ, univ)).rejects.toMatchObject({ code: 'SAME_LOCATION', retryable: false });
  });

  it('시나리오 기본값은 정상·지연 없음이 아니라 가벼운 지연이다', () => {
    expect(DEFAULT_SCENARIO.routeFetch).toBe('ok');
    expect(DEFAULT_SCENARIO.hideRoadInfo).toBe(false);
    expect(DEFAULT_SCENARIO.storageFails).toBe(false);
  });
});

describe('주행 시뮬레이터', () => {
  const route = computeRoutes(DEMO_GRAPH, 'stn', PLACE_NODE['univ-gate']!).candidates[0]!;
  // 테스트가 도중에 실패해도 타이머가 남지 않도록 항상 정리한다
  const created: DemoNavigationSimulator[] = [];
  const make = () => {
    const sim = new DemoNavigationSimulator({ speedup: () => 20, tickMs: 1_000_000 });
    created.push(sim);
    return sim;
  };
  afterEach(() => {
    created.splice(0).forEach((sim) => sim.dispose());
  });

  it('경로를 따라 단조 증가하며 도착한다', () => {
    const sim = make();
    const snaps: SimulationSnapshot[] = [];
    sim.subscribe((s) => snaps.push(s));
    sim.start(route);
    expect(sim.getSnapshot()!.status).toBe('running');
    let last = -1;
    for (let i = 0; i < 400 && sim.getSnapshot()!.status === 'running'; i++) {
      sim.advance(250);
      const s = sim.getSnapshot()!;
      expect(s.progressM).toBeGreaterThanOrEqual(last);
      last = s.progressM;
    }
    const end = sim.getSnapshot()!;
    expect(end.status).toBe('arrived');
    expect(end.fraction).toBe(1);
    expect(end.remainingM).toBe(0);
    expect(end.nextStep).toBeNull();
    sim.dispose();
  });

  it('다음 안내와 남은 거리가 일관된다', () => {
    const sim = make();
    sim.start(route);
    const first = sim.getSnapshot()!;
    expect(first.currentStep.maneuver).toBe('DEPART');
    expect(first.nextStep!.index).toBe(1);
    expect(first.distanceToNextM).toBeCloseTo(route.steps[1]!.offsetM, 1);
    expect(first.thenStep!.index).toBe(2);
    expect(first.remainingM).toBeCloseTo(cumulativeDistances(route.path).at(-1)!, 3);
    // 다음 안내를 지나면 현재 단계가 넘어간다
    sim.start(route, { fromProgressM: route.steps[1]!.offsetM + 5 });
    const passed = sim.getSnapshot()!;
    expect(passed.currentStep.index).toBe(1);
    expect(passed.nextStep!.index).toBe(2);
    sim.dispose();
  });

  it('남은 시간은 줄어들고 전체 소요 시간에서 시작한다', () => {
    const sim = make();
    sim.start(route);
    const start = sim.getSnapshot()!.remainingS;
    expect(start).toBeCloseTo(route.durationS, 0);
    sim.advance(5000);
    expect(sim.getSnapshot()!.remainingS).toBeLessThan(start);
    sim.dispose();
  });

  it('일시정지 중에는 진행하지 않고 재개하면 이어서 간다', () => {
    const sim = make();
    sim.start(route);
    sim.advance(2000);
    sim.pause();
    const paused = sim.getSnapshot()!;
    expect(paused.status).toBe('paused');
    sim.advance(5000);
    expect(sim.getSnapshot()!.progressM).toBe(paused.progressM);
    sim.resume();
    sim.advance(1000);
    expect(sim.getSnapshot()!.progressM).toBeGreaterThan(paused.progressM);
    sim.dispose();
  });

  it('종료하면 stopped 이고 그 지점부터 이어서 시작할 수 있다', () => {
    const sim = make();
    sim.start(route);
    sim.advance(3000);
    const at = sim.getSnapshot()!.progressM;
    sim.stop();
    expect(sim.getSnapshot()!.status).toBe('stopped');
    sim.advance(3000);
    expect(sim.getSnapshot()!.progressM).toBe(at);
    sim.start(route, { fromProgressM: at });
    expect(sim.getSnapshot()!.status).toBe('running');
    expect(sim.getSnapshot()!.progressM).toBeCloseTo(at, 3);
    sim.start(route);
    expect(sim.getSnapshot()!.progressM).toBe(0);
    sim.dispose();
  });

  it('현재 위치는 항상 경로 위에 있고 진행 방향이 있다', () => {
    const sim = make();
    sim.start(route);
    for (let i = 0; i < 20; i++) {
      sim.advance(1500);
      const s = sim.getSnapshot()!;
      // 꼭짓점 사이를 보간하므로 꼭짓점이 아니라 경로 선분까지의 거리를 잰다
      const offPath = distanceToPolyline(geoToLocal(s.position), route.path.map(geoToLocal));
      expect(offPath).toBeLessThan(0.5);
      expect(s.headingDeg).toBeGreaterThanOrEqual(0);
      expect(s.headingDeg).toBeLessThan(360);
    }
    sim.dispose();
  });
});
