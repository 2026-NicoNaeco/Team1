import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyLearned } from '../../domain/learning';
import { createDefaultProfile } from '../../domain/preferences';
import type { Place, SimulationRecord } from '../../domain/types';
import { PLACES } from '../../mock/places';
import { AsyncStorageRepository, STORAGE_PREFIX } from '../repository/AsyncStorageRepository';
import { FaultInjectingRepository } from '../repository/FaultInjectingRepository';
import { parseLearned, parseProfile, parsePlace, parseRecord } from '../repository/validate';

const NOW = '2026-10-08T09:00:00.000Z';

const record = (id: string): SimulationRecord => ({
  id,
  kind: 'simulation',
  createdAt: NOW,
  origin: { id: 'station', name: '새싹역 앞' },
  destination: { id: 'univ-gate', name: '한빛대학교 정문' },
  route: {
    id: 'r1',
    label: 'C',
    headline: '회전이 적은 길',
    via: '행복로 · 푸른길',
    distanceM: 11800,
    durationMinutes: 28,
    extraMinutes: 7,
    burdenLevel: 'low',
    tollWon: 0,
    factors: {
      TURN_COUNT: { availability: 'known', value: 2 },
      ACCIDENT_ZONE: { availability: 'partial', value: 0 },
      TRAFFIC_VOLUME: { availability: 'unknown', value: null },
    },
  },
  recommendedRouteId: 'r1',
  chosenWasRecommended: true,
  outcome: 'arrived',
  progress: 1,
  feedback: { rating: 'hard', factors: ['NARROW_ROAD'], appliedToRecommendations: true },
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('AsyncStorageRepository', () => {
  const repo = new AsyncStorageRepository();

  it('저장한 값을 그대로 읽어 온다', async () => {
    const profile = { ...createDefaultProfile(NOW), onboardingCompleted: true, priorities: { U_TURN: 'avoid' as const } };
    const learned = { adjustments: { U_TURN: { factor: 'U_TURN' as const, delta: 0.4, hardCount: 1, easyCount: 0, updatedAt: NOW } }, feedbackCount: 1 };
    await repo.saveProfile(profile);
    await repo.saveLearned(learned);
    await repo.saveRecords([record('a'), record('b')]);
    await repo.saveRecents([PLACES[1]!]);
    const { data, discarded } = await repo.load();
    expect(discarded).toEqual([]);
    expect(data.profile).toEqual(profile);
    expect(data.learned).toEqual(learned);
    expect(data.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(data.records[0]!.route.factors.TRAFFIC_VOLUME).toEqual({ availability: 'unknown', value: null });
    expect(data.recents[0]!.id).toBe(PLACES[1]!.id);
  });

  it('아무것도 저장하지 않았으면 비어 있다 (임의의 기록을 채우지 않는다)', async () => {
    const { data, discarded } = await repo.load();
    expect(data).toEqual({ profile: null, learned: null, records: [], recents: [] });
    expect(discarded).toEqual([]);
  });

  it('손상된 저장값은 버리고 무엇을 버렸는지 알린다', async () => {
    await AsyncStorage.setItem(STORAGE_PREFIX + 'v1:profile', '{ not json');
    await AsyncStorage.setItem(STORAGE_PREFIX + 'v1:records', JSON.stringify([record('ok'), { kind: 'simulation', id: 'broken' }, 42]));
    const { data, discarded } = await repo.load();
    expect(data.profile).toBeNull();
    expect(data.records.map((r) => r.id)).toEqual(['ok']);
    expect(discarded).toEqual(expect.arrayContaining(['운전 성향', '일부 시뮬레이션 기록']));
  });

  it('기록만 / 개인화 결과만 따로 지울 수 있다', async () => {
    await repo.saveProfile(createDefaultProfile(NOW));
    await repo.saveLearned({ adjustments: {}, feedbackCount: 2 });
    await repo.saveRecords([record('a')]);
    await repo.clearRecords();
    expect((await repo.load()).data.records).toEqual([]);
    expect((await repo.load()).data.learned).not.toBeNull();
    await repo.clearLearned();
    const { data } = await repo.load();
    expect(data.learned).toBeNull();
    expect(data.profile).not.toBeNull();
  });

  it('모든 데이터 삭제는 뉴비맵이 저장한 키만 지운다', async () => {
    await repo.saveProfile(createDefaultProfile(NOW));
    await repo.saveRecords([record('a')]);
    await repo.saveRecents([PLACES[0]!]);
    await AsyncStorage.setItem('other-app:keep', '1');
    await AsyncStorage.setItem(STORAGE_PREFIX + 'cache:route', '{}');
    await repo.clearAll();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(STORAGE_PREFIX))).toEqual([]);
    expect(keys).toContain('other-app:keep');
  });

  it('민감한 위치 이력이나 개인 식별 정보를 저장하지 않는다', async () => {
    await repo.saveRecords([record('a')]);
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_PREFIX + 'v1:records'))!) as unknown;
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(stored);
    // 경로 좌표(GPS 이력)·이름·연락처 같은 필드는 기록에 존재하지 않는다
    for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'path', 'position', 'email', 'phone', 'userName']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe('FaultInjectingRepository (저장 실패 시나리오)', () => {
  it('실패 중에는 쓰기·삭제가 던지고 읽기는 계속된다', async () => {
    let failing = false;
    const repo = new FaultInjectingRepository(new AsyncStorageRepository(), () => failing);
    await repo.saveRecords([record('a')]);
    failing = true;
    await expect(repo.saveRecords([record('b')])).rejects.toThrow();
    await expect(repo.clearAll()).rejects.toThrow();
    await expect(repo.clearRecords()).rejects.toThrow();
    expect((await repo.load()).data.records.map((r) => r.id)).toEqual(['a']);
    failing = false;
    await repo.clearAll();
    expect((await repo.load()).data.records).toEqual([]);
  });
});

describe('저장값 검증', () => {
  it('알 수 없는 요소 코드와 우선순위는 걸러낸다', () => {
    const parsed = parseProfile({ ...createDefaultProfile(NOW), priorities: { U_TURN: 'avoid', NOPE: 'avoid', ROUNDABOUT: 'extreme' } });
    expect(parsed?.priorities).toEqual({ U_TURN: 'avoid' });
  });

  it('버전이 다르거나 필수 값이 없으면 버린다', () => {
    expect(parseProfile({ ...createDefaultProfile(NOW), schemaVersion: 2 })).toBeNull();
    expect(parseProfile({ schemaVersion: 1 })).toBeNull();
    expect(parseProfile(null)).toBeNull();
    expect(parseLearned({ feedbackCount: 'x', adjustments: {} })).toBeNull();
    expect(parseRecord({ ...record('x'), kind: 'real-drive' })).toBeNull();
    expect(parsePlace({ id: 'x' })).toBeNull();
  });

  it('장소는 좌표를 포함해 복원한다', () => {
    const place: Place = PLACES[0]!;
    expect(parsePlace(JSON.parse(JSON.stringify(place)))).toEqual(place);
  });

  it('빈 학습 상태도 올바르게 읽는다', () => {
    expect(parseLearned(emptyLearned())).toEqual(emptyLearned());
  });
});
