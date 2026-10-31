import { cumulativeDistances, pointAlong } from '../domain/geo';
import type { GuidanceStep, RouteCandidate } from '../domain/types';
import type { NavigationSimulator, SimulationSnapshot, SimulationStatus } from '../services/types';
import { getScenario } from './scenario';

type Listener = (snapshot: SimulationSnapshot) => void;

export interface SimulatorOptions {
  /** 갱신 주기(ms) */
  tickMs?: number;
  now?: () => number;
  /** 실제 소요 시간 대비 배속. 기본값은 시나리오 설정을 따른다. */
  speedup?: () => number;
}

const MAX_TICK_MS = 250;

/**
 * 선택한 경로 위를 따라 움직이는 시뮬레이션.
 * 실제 위치 정보를 쓰지 않고, 경로의 도형과 안내 단계만으로 결정적으로 진행한다.
 */
export class DemoNavigationSimulator implements NavigationSimulator {
  private route: RouteCandidate | null = null;
  private cumulative: number[] = [];
  private status: SimulationStatus = 'idle';
  private progressM = 0;
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private readonly tickMs: number;
  private readonly now: () => number;
  private readonly speedup: () => number;

  constructor(options: SimulatorOptions = {}) {
    this.tickMs = options.tickMs ?? 100;
    this.now = options.now ?? (() => Date.now());
    this.speedup = options.speedup ?? (() => getScenario().simulationSpeedup);
  }

  start(route: RouteCandidate, options?: { fromProgressM?: number }): void {
    this.clearTimer();
    this.route = route;
    this.cumulative = cumulativeDistances(route.path);
    const total = this.cumulative[this.cumulative.length - 1] ?? 0;
    this.progressM = Math.min(Math.max(options?.fromProgressM ?? 0, 0), total);
    this.status = 'running';
    this.emit();
    this.startTimer();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.clearTimer();
    this.status = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.emit();
    this.startTimer();
  }

  stop(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    this.clearTimer();
    this.status = 'stopped';
    this.emit();
  }

  getSnapshot(): SimulationSnapshot | null {
    return this.route ? this.buildSnapshot(this.route) : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  /** 지정한 시간(ms)만큼 진행한다. 타이머가 호출하며 테스트에서도 직접 쓴다. */
  advance(dtMs: number): void {
    if (this.status !== 'running' || !this.route) return;
    const total = this.cumulative[this.cumulative.length - 1] ?? 0;
    const simulatedMs = (this.route.durationS * 1000) / Math.max(1, this.speedup());
    const metersPerMs = simulatedMs > 0 ? total / simulatedMs : total;
    this.progressM = Math.min(total, this.progressM + metersPerMs * dtMs);
    if (this.progressM >= total) {
      this.clearTimer();
      this.status = 'arrived';
    }
    this.emit();
  }

  private startTimer(): void {
    this.lastTickAt = this.now();
    this.timer = setInterval(() => {
      const t = this.now();
      const dt = Math.min(t - this.lastTickAt, MAX_TICK_MS);
      this.lastTickAt = t;
      this.advance(dt);
    }, this.tickMs);
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    if (!this.route) return;
    const snapshot = this.buildSnapshot(this.route);
    this.listeners.forEach((l) => l(snapshot));
  }

  private buildSnapshot(route: RouteCandidate): SimulationSnapshot {
    const total = this.cumulative[this.cumulative.length - 1] ?? 0;
    const sample = pointAlong(route.path, this.cumulative, this.progressM);
    const steps = route.steps;
    const arrived = this.status === 'arrived';

    let index = 0;
    for (let i = 0; i < steps.length; i++) if (steps[i]!.offsetM <= this.progressM + 0.5) index = i;
    // 도착하기 전에는 마지막 단계(ARRIVE)를 "현재"로 보지 않는다
    if (!arrived && steps[index]?.maneuver === 'ARRIVE' && index > 0) index -= 1;

    const current = steps[index]!;
    const next: GuidanceStep | null = arrived ? null : (steps[index + 1] ?? null);
    const then: GuidanceStep | null = arrived ? null : (steps[index + 2] ?? null);

    // 단계별 소요 시간을 거리 비율로 나눠 남은 시간을 계산한다
    let elapsedS = 0;
    for (let i = 0; i < index; i++) elapsedS += steps[i]!.durationS;
    if (current.lengthM > 0) {
      const within = Math.min(1, Math.max(0, (this.progressM - current.offsetM) / current.lengthM));
      elapsedS += current.durationS * within;
    }

    return {
      status: this.status,
      progressM: this.progressM,
      totalM: total,
      fraction: total > 0 ? this.progressM / total : 0,
      position: sample.point,
      headingDeg: sample.bearing,
      currentStep: current,
      nextStep: next,
      thenStep: then,
      distanceToNextM: next ? Math.max(0, next.offsetM - this.progressM) : 0,
      remainingM: Math.max(0, total - this.progressM),
      remainingS: arrived ? 0 : Math.max(0, route.durationS - elapsedS),
    };
  }
}
