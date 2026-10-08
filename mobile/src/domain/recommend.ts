import { computeBurden, exclusiveValue, highwayKm, knownValue, type BurdenResult } from './burden';
import { FACTOR_ORDER, FACTORS, SCORED_FACTORS, sentenceLabel } from './factors';
import {
  describeMeasurement,
  formatFactorValue,
  formatKm,
  formatMinutes,
  formatWon,
  josa,
  minutesFromSeconds,
} from './format';
import type {
  EffectivePreferences,
  ExcludedRoute,
  FactorCode,
  RankedRoute,
  ReasonItem,
  RecommendationNotice,
  RecommendationResult,
  RouteCandidate,
  SettingsRelationItem,
  TradeoffItem,
} from './types';

/**
 * 경로 순위와 추천 이유 생성 (모의 규칙).
 *
 * 정책 순서
 * 1. 법규·통행 제한은 후보 단계에서 이미 걸러진다 (RouteProvider 책임, excluded 로 전달됨).
 * 2. 허용한 추가 시간 안의 경로를 먼저 추천한다. 안에서는 운전 부담이 낮은 순이다.
 * 3. 부담이 비슷하면 시간·거리·통행료가 작은 쪽이 앞선다 (작은 가중치로 반영).
 * 허용 시간을 넘는 경로는 몰래 완화해 추천하지 않고, 별도 안내와 함께 목록 뒤쪽에 둔다.
 */

const TIME_WEIGHT_PER_MINUTE = 0.12;
const TOLL_WEIGHT_PER_1000_WON = 0.35;
const DISTANCE_WEIGHT_PER_KM = 0.05;

/** "신경 안 써요"로 낮춘 요소는 추천 이유로 내세우지 않는다 */
const REASON_MIN_WEIGHT = 0.5;
/**
 * 설정과의 관계에 보여줄 최소 가중치. 직접 "되도록 피하고 싶어요"로 정한 요소(2.2)뿐 아니라
 * 평가 한 번으로 조정된 요소(1.4)도 포함해서, 모의 개인화가 반영된 모습을 확인할 수 있게 한다.
 */
const RELATION_MIN_WEIGHT = 1.3;
const KM_DIFF_THRESHOLD = 0.3;
const MAX_REASONS = 3;

interface Entry {
  candidate: RouteCandidate;
  durationMinutes: number;
  extraMinutes: number;
  burden: BurdenResult;
  score: number;
  withinTimeLimit: boolean;
}

export function recommend(
  candidates: readonly RouteCandidate[],
  prefs: EffectivePreferences,
  excluded: readonly ExcludedRoute[] = [],
): RecommendationResult {
  if (candidates.length === 0) {
    return {
      items: [],
      recommendedRouteId: null,
      preferenceSignature: prefs.signature,
      fastestRouteId: null,
      notices: excludedNotices(excluded),
    };
  }

  const fastest = [...candidates].sort(
    (a, b) => a.durationS - b.durationS || a.distanceM - b.distanceM || a.id.localeCompare(b.id),
  )[0]!;
  const fastestMinutes = minutesFromSeconds(fastest.durationS);
  const minDistanceM = Math.min(...candidates.map((c) => c.distanceM));

  const entries: Entry[] = candidates.map((candidate) => {
    const durationMinutes = minutesFromSeconds(candidate.durationS);
    const extraMinutes = Math.max(0, durationMinutes - fastestMinutes);
    const burden = computeBurden(candidate.factors, prefs);
    const tollWon = candidate.toll.availability === 'known' ? candidate.toll.won : 0;
    const score =
      burden.index +
      TIME_WEIGHT_PER_MINUTE * extraMinutes +
      TOLL_WEIGHT_PER_1000_WON * (tollWon / 1000) +
      DISTANCE_WEIGHT_PER_KM * Math.max(0, (candidate.distanceM - minDistanceM) / 1000);
    return {
      candidate,
      durationMinutes,
      extraMinutes,
      burden,
      score,
      withinTimeLimit: extraMinutes <= prefs.maxExtraMinutes,
    };
  });

  const ordered = [...entries].sort((a, b) => {
    if (a.withinTimeLimit !== b.withinTimeLimit) return a.withinTimeLimit ? -1 : 1;
    return a.score - b.score || a.candidate.durationS - b.candidate.durationS || a.candidate.id.localeCompare(b.candidate.id);
  });

  const headlines = assignHeadlines(candidates, fastest.id);
  const recommendedId = ordered[0]!.withinTimeLimit ? ordered[0]!.candidate.id : null;

  const items: RankedRoute[] = ordered.map((entry, i) => {
    const id = entry.candidate.id;
    const isFastest = id === fastest.id;
    return {
      routeId: id,
      rank: i + 1,
      isRecommended: id === recommendedId,
      withinTimeLimit: entry.withinTimeLimit,
      extraMinutes: entry.extraMinutes,
      durationMinutes: entry.durationMinutes,
      burdenLevel: entry.burden.level,
      burdenDrivers: burdenDrivers(entry),
      hasMissingInfo: entry.burden.missing.length > 0 || entry.candidate.toll.availability === 'unknown',
      headline: headlines.get(id) ?? `${entry.candidate.via} 경유`,
      reasons: buildReasons(entry, entries, fastest, isFastest, prefs),
      tradeoffs: buildTradeoffs(entry, entries, prefs),
      settingsRelation: buildSettingsRelation(entry, entries, prefs),
    };
  });

  return {
    items,
    recommendedRouteId: recommendedId,
    preferenceSignature: prefs.signature,
    fastestRouteId: fastest.id,
    notices: buildNotices(ordered, recommendedId, prefs, excluded),
  };
}

// ───────────────────────── 특징 한 줄 ─────────────────────────

/**
 * 경로의 객관적인 특징으로 제목을 붙인다. 사용자 설정과 무관하므로 설정을 바꿔도 제목은 그대로다.
 * 같은 특징이 두 경로에 붙지 않도록 우선순위대로 한 경로에만 배정한다.
 */
function assignHeadlines(candidates: readonly RouteCandidate[], fastestId: string): Map<string, string> {
  const result = new Map<string, string>();
  if (candidates.length < 2) return result;

  result.set(fastestId, '가장 빠른 길');

  const withHighway = candidates
    .filter((c) => !result.has(c.id) && highwayKm(c.factors) >= 3)
    .sort((a, b) => highwayKm(b.factors) - highwayKm(a.factors))[0];
  if (withHighway) result.set(withHighway.id, '고속도로를 지나는 길');

  const maneuvers = (c: RouteCandidate) =>
    (knownValue(c.factors, 'TURN_COUNT') ?? 0) +
    (knownValue(c.factors, 'LANE_CHANGE') ?? 0) +
    (knownValue(c.factors, 'MERGE_DIVERGE') ?? 0) +
    (knownValue(c.factors, 'ROUNDABOUT') ?? 0);
  const calm = candidates
    .filter((c) => !result.has(c.id))
    .sort((a, b) => maneuvers(a) - maneuvers(b) || a.durationS - b.durationS)[0];
  if (calm) {
    const turns = (c: RouteCandidate) => knownValue(c.factors, 'TURN_COUNT') ?? Infinity;
    const fewestTurns = Math.min(...candidates.map(turns));
    result.set(calm.id, turns(calm) === fewestTurns ? '회전이 적은 길' : '차로 변경이 적은 길');
  }

  const shortest = candidates
    .filter((c) => !result.has(c.id))
    .sort((a, b) => a.distanceM - b.distanceM)[0];
  if (shortest) result.set(shortest.id, '거리가 가장 짧은 길');

  return result;
}

// ───────────────────────── 부담의 주된 요소 ─────────────────────────

function burdenDrivers(entry: Entry): RankedRoute['burdenDrivers'] {
  return [...entry.burden.contributions]
    .sort((a, b) => b.points - a.points || FACTOR_ORDER.indexOf(a.factor) - FACTOR_ORDER.indexOf(b.factor))
    .slice(0, 2)
    .map(({ factor }) => {
      const value = driverValue(entry.candidate, factor);
      return { factor, text: `${sentenceLabel(factor)} ${formatFactorValue(factor, value)}` };
    });
}

/** 부담 계산과 같은 기준의 값 (방향 전환은 비보호 좌회전·유턴을 뺀 일반 좌·우회전) */
function driverValue(c: RouteCandidate, factor: FactorCode): number {
  const m = c.factors[factor];
  if (m.availability === 'unknown') return 0;
  if (factor !== 'TURN_COUNT') return m.value;
  const unprotected = knownValue(c.factors, 'UNPROTECTED_LEFT') ?? 0;
  const uTurn = knownValue(c.factors, 'U_TURN') ?? 0;
  return Math.max(0, m.value - unprotected - uTurn);
}

// ───────────────────────── 추천 이유 ─────────────────────────

function noneText(code: FactorCode): string {
  switch (code) {
    case 'ROUNDABOUT':
      return '회전교차로를 지나지 않아요';
    case 'PROTECTED_ZONE':
      return '보호구역을 지나지 않아요';
    case 'ACCIDENT_ZONE':
      return '자료상 사고다발구간에 해당하지 않아요';
    case 'TRAFFIC_VOLUME':
      return '혼잡한 구간이 없어요 (모의값)';
    case 'LANE_CHANGE':
      return '필수 차로 변경이 없어요 (예상)';
    default:
      return `${josa(sentenceLabel(code), '이/가')} 없어요`;
  }
}

type ScoredReason = ReasonItem & { impact: number };

function buildReasons(
  entry: Entry,
  all: readonly Entry[],
  baseline: RouteCandidate,
  isFastest: boolean,
  prefs: EffectivePreferences,
): ReasonItem[] {
  const c = entry.candidate;
  const others = all.filter((e) => e !== entry).map((e) => e.candidate);
  const out: ScoredReason[] = [];

  if (isFastest && others.length > 0) {
    out.push({ id: 'fastest', kind: 'fastest', text: '가장 빠른 경로예요', impact: 3 });
  }

  for (const code of SCORED_FACTORS) {
    const weight = prefs.weights[code];
    if (weight < REASON_MIN_WEIGHT) continue;
    const info = FACTORS[code];
    const mine = exclusiveValue(c.factors, code);
    if (mine === null) continue;
    const threshold = info.counter === 'km' ? KM_DIFF_THRESHOLD : 1;
    const relatesTo = { label: info.avoidLabel, source: prefs.weightSources[code] };
    const label = sentenceLabel(code);

    if (!isFastest) {
      const base = exclusiveValue(baseline.factors, code);
      if (base === null) continue;
      const diff = base - mine;
      if (diff < threshold) continue;
      const impact = diff * info.unitLoad * weight;
      if (mine === 0) {
        out.push({ id: `none:${code}`, kind: 'none', factor: code, text: noneText(code), relatesTo, impact: impact * 1.1 });
      } else {
        out.push({
          id: `fewer:${code}`,
          kind: 'fewer',
          factor: code,
          text: `빠른 경로보다 ${josa(label, '이/가')} ${formatFactorValue(code, diff)} 적어요`,
          relatesTo,
          impact,
        });
      }
      continue;
    }

    // 가장 빠른 경로는 "다른 경로보다"가 아니라 후보들 사이에서 가장 적은 항목만 내세운다.
    const otherValues = others.map((o) => exclusiveValue(o.factors, code));
    if (otherValues.length === 0 || otherValues.some((v) => v === null)) continue;
    const minOther = Math.min(...(otherValues as number[]));
    const diff = minOther - mine;
    if (diff < threshold) continue;
    const impact = diff * info.unitLoad * weight;
    out.push({
      id: mine === 0 ? `none:${code}` : `lowest:${code}`,
      kind: mine === 0 ? 'none' : 'fewer',
      factor: code,
      text:
        mine === 0
          ? noneText(code)
          : `${josa(label, '이/가')} 후보 중 가장 적어요 (${formatFactorValue(code, mine)})`,
      relatesTo,
      impact,
    });
  }

  const hw = highwayKm(c.factors);
  const otherHasHighway = others.some((o) => highwayKm(o.factors) > 0);
  if (prefs.roadTypePreference === 'highway' && hw >= 3) {
    out.push({
      id: 'pref:highway',
      kind: 'preference',
      text: `고속도로를 선호하는 설정에 맞아요 (고속도로 ${formatKm(hw)})`,
      relatesTo: { label: '고속도로 선호', source: 'user' },
      impact: 4 + hw * 0.3,
    });
  }
  if (prefs.roadTypePreference === 'general' && hw === 0 && otherHasHighway) {
    out.push({
      id: 'pref:general',
      kind: 'preference',
      text: '일반도로로만 가요 (일반도로 선호 설정)',
      relatesTo: { label: '일반도로 선호', source: 'user' },
      impact: 4,
    });
  }

  const picked = pickReasons(out);
  if (picked.length < 2) {
    const lights = c.factors.TRAFFIC_LIGHT;
    const lightsText =
      lights.availability === 'unknown'
        ? '신호등 정보는 확인할 수 없어요'
        : lights.value === 0
          ? '신호등 없이 가요'
          : `신호등 ${formatFactorValue('TRAFFIC_LIGHT', lights.value)}를 지나요`;
    const fallbacks: ReasonItem[] = [
      { id: 'fact:via', kind: 'fact', text: `${c.via} 위주로 이동해요` },
      { id: 'fact:lights', kind: 'fact', factor: 'TRAFFIC_LIGHT', text: lightsText },
    ];
    for (const f of fallbacks) {
      if (picked.length >= 2) break;
      picked.push(f);
    }
  }
  return picked;
}

function pickReasons(items: ScoredReason[]): ReasonItem[] {
  const sorted = [...items].sort(
    (a, b) =>
      b.impact - a.impact ||
      (a.factor ? FACTOR_ORDER.indexOf(a.factor) : -1) - (b.factor ? FACTOR_ORDER.indexOf(b.factor) : -1),
  );
  const seen = new Set<string>();
  const out: ReasonItem[] = [];
  for (const { impact: _impact, ...reason } of sorted) {
    const key = reason.factor ?? reason.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
    if (out.length >= MAX_REASONS) break;
  }
  return out;
}

// ───────────────────────── 감수할 점·확인할 점 ─────────────────────────

function buildTradeoffs(entry: Entry, all: readonly Entry[], prefs: EffectivePreferences): TradeoffItem[] {
  const c = entry.candidate;
  const out: TradeoffItem[] = [];

  if (!entry.withinTimeLimit) {
    out.push({
      id: 'over_limit',
      kind: 'over_limit',
      text: `허용한 추가 시간(+${prefs.maxExtraMinutes}분)보다 ${entry.extraMinutes - prefs.maxExtraMinutes}분 더 걸려요`,
    });
  }
  if (entry.extraMinutes > 0) {
    out.push({
      id: 'extra_time',
      kind: 'extra_time',
      text: `가장 빠른 경로보다 ${formatMinutes(entry.extraMinutes)} 더 걸려요`,
    });
  }
  if (c.toll.availability === 'known' && c.toll.won > 0) {
    out.push({ id: 'toll', kind: 'toll', text: `통행료 ${formatWon(c.toll.won)}이 들어요` });
  } else if (c.toll.availability === 'unknown') {
    out.push({ id: 'toll_unknown', kind: 'unknown_info', text: '통행료 정보를 확인할 수 없어요' });
  }

  const hw = highwayKm(c.factors);
  const anyHighway = all.some((e) => highwayKm(e.candidate.factors) > 0);
  if (prefs.roadTypePreference === 'general' && hw > 0) {
    out.push({
      id: 'pref_mismatch',
      kind: 'preference_mismatch',
      text: `고속도로 ${formatKm(hw)}를 지나요 (일반도로 선호 설정과 달라요)`,
    });
  } else if (prefs.roadTypePreference === 'highway' && hw === 0 && anyHighway) {
    out.push({
      id: 'pref_mismatch',
      kind: 'preference_mismatch',
      text: '고속도로를 지나지 않아요 (고속도로 선호 설정과 달라요)',
    });
  }

  // 되도록 피하고 싶은 요소가 후보 중 가장 적은 쪽보다 많을 때
  const more: Array<TradeoffItem & { impact: number }> = [];
  for (const code of SCORED_FACTORS) {
    const weight = prefs.weights[code];
    if (weight < RELATION_MIN_WEIGHT) continue;
    const mine = exclusiveValue(c.factors, code);
    if (mine === null || mine <= 0) continue;
    const values = all.map((e) => exclusiveValue(e.candidate.factors, code));
    if (values.some((v) => v === null)) continue;
    const min = Math.min(...(values as number[]));
    if (mine <= min) continue;
    more.push({
      id: `more:${code}`,
      kind: 'more',
      factor: code,
      text: `${josa(sentenceLabel(code), '이/가')} ${formatFactorValue(code, mine)} 있어요`,
      impact: (mine - min) * FACTORS[code].unitLoad * weight,
    });
  }
  more
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2)
    .forEach(({ impact: _impact, ...item }) => out.push(item));

  const zones = knownValue(c.factors, 'PROTECTED_ZONE');
  if (zones !== null && zones > 0) {
    out.push({
      id: 'protected_zone',
      kind: 'protected_zone',
      factor: 'PROTECTED_ZONE',
      text: `보호구역 ${zones}곳을 지나요 (서행 구간)`,
    });
  }
  const accidents = knownValue(c.factors, 'ACCIDENT_ZONE');
  if (accidents !== null && accidents > 0) {
    out.push({
      id: 'accident_zone',
      kind: 'accident_zone',
      factor: 'ACCIDENT_ZONE',
      text: `사고다발구간 ${accidents}곳을 지나요`,
    });
  }

  const missing = SCORED_FACTORS.filter((code) => c.factors[code].availability !== 'known');
  if (missing.length > 0) {
    const names = missing.slice(0, 2).map((code) => FACTORS[code].label).join('·');
    const rest = missing.length > 2 ? ` 외 ${missing.length - 2}개` : '';
    out.push({
      id: 'unknown_info',
      kind: 'unknown_info',
      text: `일부 구간은 ${names}${rest} 정보를 확인할 수 없어요`,
    });
  }

  if (out.length === 0) {
    // 모든 항목이 후보 중 가장 낫더라도 데모 데이터라는 점은 언제나 확인할 점이다.
    out.push({
      id: 'demo_data',
      kind: 'unknown_info',
      text: '데모 데이터라 실제 도로 상황과 다를 수 있어요',
    });
  }
  return out;
}

// ───────────────────────── 내 설정과의 관계 ─────────────────────────

function buildSettingsRelation(entry: Entry, all: readonly Entry[], prefs: EffectivePreferences): SettingsRelationItem[] {
  const c = entry.candidate;
  const rows: Array<SettingsRelationItem & { order: number }> = [];

  for (const code of SCORED_FACTORS) {
    const weight = prefs.weights[code];
    if (weight < RELATION_MIN_WEIGHT) continue;
    const info = FACTORS[code];
    const m = c.factors[code];
    const mine = exclusiveValue(c.factors, code);
    const values = all.map((e) => exclusiveValue(e.candidate.factors, code));
    let standing: SettingsRelationItem['standing'] = 'unknown';
    if (mine !== null && values.every((v) => v !== null)) {
      const nums = values as number[];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      standing = max === min ? 'same' : mine <= min ? 'lowest' : 'higher';
    }
    rows.push({
      factor: code,
      label: info.avoidLabel,
      source: prefs.weightSources[code],
      routeValueText: describeMeasurement(code, m),
      standing,
      order: -weight * info.unitLoad,
    });
  }
  return rows
    .sort((a, b) => a.order - b.order)
    .slice(0, 5)
    .map(({ order: _order, ...row }) => row);
}

// ───────────────────────── 안내 ─────────────────────────

function excludedNotices(excluded: readonly ExcludedRoute[]): RecommendationNotice[] {
  if (excluded.length === 0) return [];
  return [
    {
      kind: 'excluded_restricted',
      text: `통행 제한으로 제외된 경로가 ${excluded.length}개 있어요 (데모 데이터)`,
    },
  ];
}

function buildNotices(
  ordered: readonly Entry[],
  recommendedId: string | null,
  prefs: EffectivePreferences,
  excluded: readonly ExcludedRoute[],
): RecommendationNotice[] {
  const notices: RecommendationNotice[] = [];
  const recommended = ordered.find((e) => e.candidate.id === recommendedId);

  if (ordered.length === 1) {
    notices.push({ kind: 'single_candidate', text: '이 목적지는 후보가 1개뿐이라 비교할 경로가 없어요.' });
  }

  const overLimit = ordered.filter((e) => !e.withinTimeLimit);
  if (recommended && overLimit.length > 0) {
    // 허용 시간을 넘지만 추천 경로보다 부담 지수가 낮은 경로가 있으면 숨기지 않고 알린다.
    const easier = overLimit.filter((e) => e.burden.index < recommended.burden.index);
    if (easier.length > 0) {
      const best = easier[0]!;
      const labels = easier.map((e) => `${e.candidate.label}`).join('·');
      notices.push({
        kind: 'over_limit',
        routeIds: easier.map((e) => e.candidate.id),
        text:
          `허용한 추가 시간(+${prefs.maxExtraMinutes}분)을 넘어 ${labels} 경로는 추천에서 뺐어요. ` +
          `${best.candidate.label} 경로는 ${best.extraMinutes}분 더 걸리는 대신 ${easierSummary(best, recommended)}`,
      });
    }
  }

  notices.push(...excludedNotices(excluded));

  if (ordered.some((e) => e.burden.missing.length > 0)) {
    notices.push({
      kind: 'missing_info',
      text: '일부 도로 정보는 확인할 수 없어요. 확인되지 않은 항목은 "정보 없음"으로 표시했어요.',
    });
  }
  return notices;
}

/** 추천 경로와 비교해 부담이 낮은 이유를 한 문장으로 */
function easierSummary(easier: Entry, recommended: Entry): string {
  const diffs: Array<{ code: FactorCode; none: boolean; text: string; points: number }> = [];
  for (const code of SCORED_FACTORS) {
    const a = exclusiveValue(easier.candidate.factors, code);
    const b = exclusiveValue(recommended.candidate.factors, code);
    if (a === null || b === null) continue;
    const info = FACTORS[code];
    const diff = b - a;
    if (diff < (info.counter === 'km' ? KM_DIFF_THRESHOLD : 1)) continue;
    diffs.push({
      code,
      none: a === 0,
      text: `${josa(sentenceLabel(code), '이/가')} ${formatFactorValue(code, diff)} 적어요`,
      points: diff * info.unitLoad,
    });
  }
  const top = diffs.sort((x, y) => y.points - x.points).slice(0, 2);
  if (top.length === 0) return '운전 부담이 더 낮을 수 있어요.';

  // "없어요"끼리는 한 문장으로 묶는다: "합류·분기와 차로 변경이 없어요"
  const none = top.filter((d) => d.none);
  const fewer = top.filter((d) => !d.none);
  const parts: string[] = [];
  if (none.length === 1) parts.push(`${josa(sentenceLabel(none[0]!.code), '이/가')} 없어요`);
  if (none.length === 2) {
    parts.push(`${josa(sentenceLabel(none[0]!.code), '과/와')} ${josa(sentenceLabel(none[1]!.code), '이/가')} 없어요`);
  }
  parts.push(...fewer.map((d) => d.text));
  return `${parts.join(', ')}.`;
}
