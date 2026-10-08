import type { DriverProfile, LearnedState, Place, SimulationRecord } from '../../domain/types';
import type { LoadResult, LocalRepository } from '../types';

/** 테스트용 메모리 저장소. 저장·삭제 호출 기록을 남겨 검증에 쓴다. */
export class MemoryRepository implements LocalRepository {
  profile: DriverProfile | null = null;
  learned: LearnedState | null = null;
  records: SimulationRecord[] = [];
  recents: Place[] = [];

  async load(): Promise<LoadResult> {
    return {
      data: {
        profile: this.profile,
        learned: this.learned,
        records: [...this.records],
        recents: [...this.recents],
      },
      discarded: [],
    };
  }

  async saveProfile(profile: DriverProfile): Promise<void> {
    this.profile = profile;
  }

  async saveLearned(learned: LearnedState): Promise<void> {
    this.learned = learned;
  }

  async saveRecords(records: SimulationRecord[]): Promise<void> {
    this.records = [...records];
  }

  async saveRecents(places: Place[]): Promise<void> {
    this.recents = [...places];
  }

  async clearRecords(): Promise<void> {
    this.records = [];
  }

  async clearLearned(): Promise<void> {
    this.learned = null;
  }

  async clearAll(): Promise<void> {
    this.profile = null;
    this.learned = null;
    this.records = [];
    this.recents = [];
  }
}
