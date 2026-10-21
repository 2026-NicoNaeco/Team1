import type { DriverProfile, LearnedState, Place, SimulationRecord } from '../../domain/types';
import type { LoadResult, LocalRepository } from '../types';

export class StorageFailure extends Error {
  constructor() {
    super('저장소에 쓸 수 없어요');
    this.name = 'StorageFailure';
  }
}

/**
 * 쓰기·삭제를 실패시킬 수 있는 저장소 래퍼 (개발용 시나리오: 로컬 저장 실패).
 * 읽기는 항상 실제 저장소에 위임한다.
 */
export class FaultInjectingRepository implements LocalRepository {
  constructor(
    private readonly inner: LocalRepository,
    private readonly shouldFail: () => boolean,
  ) {}

  private guard(): void {
    if (this.shouldFail()) throw new StorageFailure();
  }

  load(): Promise<LoadResult> {
    return this.inner.load();
  }

  async saveProfile(profile: DriverProfile): Promise<void> {
    this.guard();
    return this.inner.saveProfile(profile);
  }

  async saveLearned(learned: LearnedState): Promise<void> {
    this.guard();
    return this.inner.saveLearned(learned);
  }

  async saveRecords(records: SimulationRecord[]): Promise<void> {
    this.guard();
    return this.inner.saveRecords(records);
  }

  async saveRecents(places: Place[]): Promise<void> {
    this.guard();
    return this.inner.saveRecents(places);
  }

  async clearRecords(): Promise<void> {
    this.guard();
    return this.inner.clearRecords();
  }

  async clearLearned(): Promise<void> {
    this.guard();
    return this.inner.clearLearned();
  }

  async clearAll(): Promise<void> {
    this.guard();
    return this.inner.clearAll();
  }
}
