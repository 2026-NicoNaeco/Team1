/** 화면 표시용 포맷터와 한국어 조사 처리. */

import { FACTORS, tagLabel } from './factors';
import type { FactorCode, Measurement } from './types';

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const RIEUL_FINAL = 8;

function finalConsonantIndex(word: string): number {
  const ch = word.trim().slice(-1);
  if (!ch) return 0;
  const code = ch.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) return (code - HANGUL_START) % 28;
  // 숫자는 읽는 소리 기준: 영·일·삼·육·칠·팔 은 받침이 있다
  if (/[0-9]/.test(ch)) return '013678'.includes(ch) ? 1 : 0;
  return 0;
}

export type JosaPair = '이/가' | '은/는' | '을/를' | '과/와' | '으로/로';

/** 받침 유무에 맞는 조사를 단어 뒤에 붙여 돌려준다. josa('유턴', '이/가') → '유턴이' */
export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = pair.split('/') as [string, string];
  const idx = finalConsonantIndex(word);
  if (pair === '으로/로') return word + (idx === 0 || idx === RIEUL_FINAL ? withoutFinal : withFinal);
  return word + (idx !== 0 ? withFinal : withoutFinal);
}

export function minutesFromSeconds(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** 28 → "28분", 65 → "1시간 5분" */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`;
}

/** 경로 요약용: 9200 → "9.2km", 850 → "850m" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 주행 안내용: 가까울수록 10m 단위로, 멀면 0.1km 단위로 */
export function formatNavDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(0, Math.round(meters / 10) * 10)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)}km`;
}

export function formatWon(won: number): string {
  return `${Math.round(won).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

/** 가장 빠른 후보 대비 추가 시간. 0 이면 "가장 빠름" */
export function formatExtra(extraMinutes: number): string {
  return extraMinutes <= 0 ? '가장 빠름' : `빠른 경로보다 +${extraMinutes}분`;
}

/** 값과 단위를 붙인다. 소수 한 자리(km)·정수(횟수) */
export function formatFactorValue(code: FactorCode, value: number): string {
  const info = FACTORS[code];
  if (info.counter === 'km') return `${value.toFixed(1)}km`;
  if (info.counter === '차로') return `${Math.round(value)}차로`;
  return `${Math.round(value)}${info.counter}`;
}

/**
 * 측정값을 사람이 읽는 문구로 바꾼다.
 * 알 수 없음·일부만 확인·확인 결과 0 을 서로 다른 문구로 돌려준다.
 */
export function describeMeasurement(code: FactorCode, m: Measurement): string {
  const info = FACTORS[code];
  if (m.availability === 'unknown') return '정보 없음';
  const text = m.value === 0 && info.counter !== '차로' ? '없음' : formatFactorValue(code, m.value);
  return m.availability === 'partial' ? `${text} (확인된 구간 기준)` : text;
}

export type FactorState = 'present' | 'none' | 'partial' | 'unknown';

/**
 * 운전 요소 태그에 쓰는 문구와 상태.
 * - present: 확인했고 있음 / none: 확인했고 없음(0) / partial: 일부 구간만 확인 / unknown: 정보 없음
 * "없음(0)"과 "정보 없음"은 항상 다른 문구와 상태로 돌려준다.
 */
export function factorSummary(code: FactorCode, m: Measurement): { text: string; state: FactorState } {
  const label = tagLabel(code);
  if (m.availability === 'unknown') return { text: `${label} 정보 없음`, state: 'unknown' };

  if (code === 'LANE_COUNT') return { text: `차로 수 ${m.note ?? formatFactorValue(code, m.value)}`, state: 'present' };
  if (code === 'ROAD_TYPE') {
    return m.value > 0
      ? { text: `고속도로 ${m.value.toFixed(1)}km`, state: 'present' }
      : { text: '일반도로만 지나요', state: 'none' };
  }

  if (m.availability === 'partial') {
    return {
      text:
        m.value > 0
          ? `${label} ${formatFactorValue(code, m.value)} 이상 (일부 정보 없음)`
          : `${label} 확인된 곳 없음 (일부 정보 없음)`,
      state: 'partial',
    };
  }
  return m.value === 0
    ? { text: `${label} 없음`, state: 'none' }
    : { text: `${label} ${formatFactorValue(code, m.value)}`, state: 'present' };
}

export const RATING_LABEL = { easy: '쉬웠어요', normal: '보통이에요', hard: '어려웠어요' } as const;

/** 2026.10.08 17:45 (기기의 현지 시간) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
