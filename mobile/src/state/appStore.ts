import { create } from 'zustand';
import { applyLearning, emptyLearned, type LearningEffect } from '../domain/learning';
import { createDefaultProfile } from '../domain/preferences';
import { prependRecent, prependRecord } from '../domain/records';
import type {
  DriverProfile,
  DrivingFrequency,
  FactorCode,
  Feedback,
  LearnedState,
  Place,
  PriorityLevel,
  RoadTypePreference,
  SimulationRecord,
} from '../domain/types';
import { getServices } from '../services';
import { clock } from './clock';

/**
 * 사용자 성향·동의·기록·모의 개인화 결과.
 *
 * 저장 정책
 * - 설정 변경과 기록 추가는 화면에 먼저 반영하고 저장은 뒤에서 한다. 저장이 실패하면 숨기지 않고
 *   persistence.status 를 'error' 로 바꿔 알리며, retryPersist 로 다시 시도한다.
 * - 삭제는 반대로 저장소에서 실제로 지워진 뒤에만 화면에서 지운다. 실패하면 지워졌다고 보이지 않게 한다.
 */

type PersistKey = 'profile' | 'learned' | 'records' | 'recents';

export interface OnboardingResult {
  frequency: DrivingFrequency;
  burdens: FactorCode[];
  roadTypePreference: RoadTypePreference;
  maxExtraMinutes: number;
  consent: DriverProfile['consent'];
}

export interface PersistenceState {
  status: 'ok' | 'error';
}

interface AppState {
  hydrated: boolean;
  /** 읽을 수 없어 버린 저장 항목 (손상된 값) */
  discardedOnLoad: string[];
  profile: DriverProfile;
  learned: LearnedState;
  records: SimulationRecord[];
  recents: Place[];
  persistence: PersistenceState;

  hydrate: () => Promise<void>;
  completeOnboarding: (result: OnboardingResult) => void;
  updateProfile: (patch: Partial<Omit<DriverProfile, 'schemaVersion' | 'priorities' | 'consent'>>) => void;
  /** 개발용 시나리오: 성향 값을 한 번에 바꾼다 */
  applyPreset: (preset: Pick<DriverProfile, 'frequency' | 'roadTypePreference' | 'maxExtraMinutes' | 'priorities'>) => void;
  /** level 이 null 이면 직접 정한 값을 지우고 자동으로 돌린다 */
  setPriority: (code: FactorCode, level: PriorityLevel | null) => void;
  setConsent: (patch: Partial<DriverProfile['consent']>) => void;
  /** disabled: 기록 저장에 동의하지 않아 저장하지 않음 / failed: 저장하려 했으나 실패 */
  addRecord: (record: SimulationRecord) => Promise<'saved' | 'failed' | 'disabled'>;
  addRecent: (place: Place) => void;
  applyFeedback: (feedback: Feedback) => LearningEffect[];
  deleteRecord: (id: string) => Promise<boolean>;
  clearRecords: () => Promise<boolean>;
  resetLearned: () => Promise<boolean>;
  wipeAll: () => Promise<boolean>;
  retryPersist: () => Promise<void>;
}

const initialProfile = () => createDefaultProfile(clock.now().toISOString());

const dirty = new Set<PersistKey>();

export const useAppStore = create<AppState>()((set, get) => {
  async function persist(key: PersistKey): Promise<boolean> {
    const repo = getServices().repository;
    const state = get();
    try {
      if (key === 'profile') await repo.saveProfile(state.profile);
      else if (key === 'learned') await repo.saveLearned(state.learned);
      else if (key === 'records') await repo.saveRecords(state.records);
      else await repo.saveRecents(state.recents);
      dirty.delete(key);
      if (dirty.size === 0) set({ persistence: { status: 'ok' } });
      return true;
    } catch {
      dirty.add(key);
      set({ persistence: { status: 'error' } });
      return false;
    }
  }

  const touchProfile = (profile: DriverProfile) => {
    set({ profile: { ...profile, updatedAt: clock.now().toISOString() } });
    void persist('profile');
  };

  return {
    hydrated: false,
    discardedOnLoad: [],
    profile: initialProfile(),
    learned: emptyLearned(),
    records: [],
    recents: [],
    persistence: { status: 'ok' },

    hydrate: async () => {
      try {
        const { data, discarded } = await getServices().repository.load();
        set({
          hydrated: true,
          discardedOnLoad: discarded,
          profile: data.profile ?? initialProfile(),
          learned: data.learned ?? emptyLearned(),
          records: data.records,
          recents: data.recents,
        });
      } catch {
        // 저장소를 읽을 수 없어도 기본 설정으로 앱을 쓸 수 있어야 한다.
        set({ hydrated: true, discardedOnLoad: ['저장된 데이터를 읽지 못했어요'] });
      }
    },

    completeOnboarding: (result) => {
      const priorities: DriverProfile['priorities'] = {};
      for (const code of result.burdens) priorities[code] = 'avoid';
      touchProfile({
        ...get().profile,
        onboardingCompleted: true,
        frequency: result.frequency,
        roadTypePreference: result.roadTypePreference,
        maxExtraMinutes: result.maxExtraMinutes,
        priorities,
        consent: result.consent,
      });
    },

    updateProfile: (patch) => touchProfile({ ...get().profile, ...patch }),

    applyPreset: (preset) => touchProfile({ ...get().profile, ...preset, onboardingCompleted: true }),

    setPriority: (code, level) => {
      const priorities = { ...get().profile.priorities };
      if (level === null) delete priorities[code];
      else priorities[code] = level;
      touchProfile({ ...get().profile, priorities });
    },

    setConsent: (patch) => {
      const profile = get().profile;
      touchProfile({ ...profile, consent: { ...profile.consent, ...patch } });
    },

    addRecord: async (record) => {
      if (!get().profile.consent.saveRecords) return 'disabled';
      set({ records: prependRecord(get().records, record) });
      return (await persist('records')) ? 'saved' : 'failed';
    },

    addRecent: (place) => {
      // 최근 목적지도 기록 저장에 동의한 경우에만 이 기기에 남긴다
      if (!get().profile.consent.saveRecords) return;
      set({ recents: prependRecent(get().recents, place) });
      void persist('recents');
    },

    applyFeedback: (feedback) => {
      const { profile, learned } = get();
      const result = applyLearning(profile, learned, feedback, clock.now().toISOString());
      if (result.learned !== learned) {
        set({ learned: result.learned });
        void persist('learned');
      }
      return result.effects;
    },

    deleteRecord: async (id) => {
      const next = get().records.filter((r) => r.id !== id);
      try {
        await getServices().repository.saveRecords(next);
        set({ records: next });
        return true;
      } catch {
        return false;
      }
    },

    clearRecords: async () => {
      try {
        await getServices().repository.clearRecords();
        set({ records: [] });
        return true;
      } catch {
        return false;
      }
    },

    resetLearned: async () => {
      try {
        await getServices().repository.clearLearned();
        set({ learned: emptyLearned() });
        return true;
      } catch {
        return false;
      }
    },

    wipeAll: async () => {
      try {
        await getServices().repository.clearAll();
      } catch {
        return false;
      }
      dirty.clear();
      set({
        profile: initialProfile(),
        learned: emptyLearned(),
        records: [],
        recents: [],
        discardedOnLoad: [],
        persistence: { status: 'ok' },
      });
      return true;
    },

    retryPersist: async () => {
      for (const key of [...dirty]) await persist(key);
    },
  };
});

/** 테스트에서 저장소 상태를 초기화한다 */
export function resetAppStoreForTests(): void {
  dirty.clear();
  useAppStore.setState({
    hydrated: false,
    discardedOnLoad: [],
    profile: initialProfile(),
    learned: emptyLearned(),
    records: [],
    recents: [],
    persistence: { status: 'ok' },
  });
}
