import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DriverProfile, LearnedState, Place, SimulationRecord } from '../../domain/types';
import type { LoadResult, LocalRepository } from '../types';
import { parseLearned, parsePlace, parseProfile, parseRecord } from './validate';

/**
 * AsyncStorage 에 JSON 으로 저장한다. 암호화하지 않으며 이 기기 안에만 남는다.
 * 키는 모두 PREFIX 로 시작하므로 clearAll 이 앱이 저장한 값을 빠짐없이 지울 수 있다.
 */
export const STORAGE_PREFIX = 'newbiemap:';
const SCHEMA = 'v1';

const KEYS = {
  profile: `${STORAGE_PREFIX}${SCHEMA}:profile`,
  learned: `${STORAGE_PREFIX}${SCHEMA}:learned`,
  records: `${STORAGE_PREFIX}${SCHEMA}:records`,
  recents: `${STORAGE_PREFIX}${SCHEMA}:recents`,
} as const;

async function readJson(key: string): Promise<{ found: boolean; value: unknown; corrupted: boolean }> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return { found: false, value: null, corrupted: false };
  try {
    return { found: true, value: JSON.parse(raw), corrupted: false };
  } catch {
    return { found: true, value: null, corrupted: true };
  }
}

export class AsyncStorageRepository implements LocalRepository {
  async load(): Promise<LoadResult> {
    const discarded: string[] = [];
    const [profileRaw, learnedRaw, recordsRaw, recentsRaw] = await Promise.all([
      readJson(KEYS.profile),
      readJson(KEYS.learned),
      readJson(KEYS.records),
      readJson(KEYS.recents),
    ]);

    const profile = profileRaw.found ? parseProfile(profileRaw.value) : null;
    if (profileRaw.found && !profile) discarded.push('운전 성향');

    const learned = learnedRaw.found ? parseLearned(learnedRaw.value) : null;
    if (learnedRaw.found && !learned) discarded.push('개인화 결과');

    let records: SimulationRecord[] = [];
    if (recordsRaw.found) {
      if (Array.isArray(recordsRaw.value)) {
        records = recordsRaw.value.map(parseRecord).filter((r): r is SimulationRecord => r !== null);
        if (records.length !== recordsRaw.value.length) discarded.push('일부 시뮬레이션 기록');
      } else {
        discarded.push('시뮬레이션 기록');
      }
    }

    let recents: Place[] = [];
    if (recentsRaw.found && Array.isArray(recentsRaw.value)) {
      recents = recentsRaw.value.map(parsePlace).filter((p): p is Place => p !== null);
    }

    return { data: { profile, learned, records, recents }, discarded };
  }

  async saveProfile(profile: DriverProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
  }

  async saveLearned(learned: LearnedState): Promise<void> {
    await AsyncStorage.setItem(KEYS.learned, JSON.stringify(learned));
  }

  async saveRecords(records: SimulationRecord[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.records, JSON.stringify(records));
  }

  async saveRecents(places: Place[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.recents, JSON.stringify(places));
  }

  async clearRecords(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.records);
  }

  async clearLearned(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.learned);
  }

  async clearAll(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  }
}
