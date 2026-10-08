import { FACTOR_ORDER } from '../../domain/factors';
import type {
  DriverProfile,
  Feedback,
  FactorCode,
  LearnedAdjustment,
  LearnedState,
  Place,
  PriorityLevel,
  SimulationRecord,
} from '../../domain/types';

/**
 * 저장된 값을 읽을 때의 방어적 검증.
 * 앱 버전이 바뀌었거나 저장값이 손상됐을 때 잘못된 데이터를 그대로 쓰지 않고 해당 항목만 버린다.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isFactor = (v: unknown): v is FactorCode => isStr(v) && (FACTOR_ORDER as string[]).includes(v);

const FREQUENCIES = ['rare', 'sometimes', 'often', 'unknown'];
const ROAD_PREFS = ['highway', 'general', 'none'];
const LEVELS: PriorityLevel[] = ['relaxed', 'normal', 'avoid'];
const BURDEN_LEVELS = ['low', 'medium', 'high'];
const RATINGS = ['easy', 'normal', 'hard'];
const OUTCOMES = ['arrived', 'stopped'];

export function parseProfile(raw: unknown): DriverProfile | null {
  if (!isObj(raw) || raw.schemaVersion !== 1) return null;
  if (!isBool(raw.onboardingCompleted) || !isStr(raw.updatedAt)) return null;
  if (!FREQUENCIES.includes(raw.frequency as string) || !ROAD_PREFS.includes(raw.roadTypePreference as string)) {
    return null;
  }
  if (!isNum(raw.maxExtraMinutes) || !isObj(raw.consent) || !isObj(raw.priorities)) return null;
  const consent = raw.consent;
  if (!isBool(consent.saveRecords) || !isBool(consent.usePersonalization)) return null;

  const priorities: DriverProfile['priorities'] = {};
  for (const [code, level] of Object.entries(raw.priorities)) {
    if (isFactor(code) && LEVELS.includes(level as PriorityLevel)) priorities[code] = level as PriorityLevel;
  }
  return {
    schemaVersion: 1,
    onboardingCompleted: raw.onboardingCompleted,
    frequency: raw.frequency as DriverProfile['frequency'],
    roadTypePreference: raw.roadTypePreference as DriverProfile['roadTypePreference'],
    maxExtraMinutes: raw.maxExtraMinutes,
    priorities,
    consent: { saveRecords: consent.saveRecords, usePersonalization: consent.usePersonalization },
    updatedAt: raw.updatedAt,
  };
}

export function parseLearned(raw: unknown): LearnedState | null {
  if (!isObj(raw) || !isNum(raw.feedbackCount) || !isObj(raw.adjustments)) return null;
  const adjustments: LearnedState['adjustments'] = {};
  for (const [code, value] of Object.entries(raw.adjustments)) {
    if (!isFactor(code) || !isObj(value)) continue;
    if (!isNum(value.delta) || !isNum(value.hardCount) || !isNum(value.easyCount) || !isStr(value.updatedAt)) continue;
    const adjustment: LearnedAdjustment = {
      factor: code,
      delta: value.delta,
      hardCount: value.hardCount,
      easyCount: value.easyCount,
      updatedAt: value.updatedAt,
    };
    adjustments[code] = adjustment;
  }
  return { adjustments, feedbackCount: raw.feedbackCount };
}

export function parsePlace(raw: unknown): Place | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.address) || !isStr(raw.category)) return null;
  const loc = raw.location;
  if (!isObj(loc) || !isNum(loc.lat) || !isNum(loc.lng)) return null;
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address,
    category: raw.category as Place['category'],
    location: { lat: loc.lat, lng: loc.lng },
  };
}

function parseFeedback(raw: unknown): Feedback | null {
  if (!isObj(raw) || !RATINGS.includes(raw.rating as string) || !Array.isArray(raw.factors)) return null;
  if (!isBool(raw.appliedToRecommendations)) return null;
  return {
    rating: raw.rating as Feedback['rating'],
    factors: raw.factors.filter(isFactor),
    appliedToRecommendations: raw.appliedToRecommendations,
  };
}

export function parseRecord(raw: unknown): SimulationRecord | null {
  if (!isObj(raw) || raw.kind !== 'simulation' || !isStr(raw.id) || !isStr(raw.createdAt)) return null;
  const { origin, destination, route } = raw;
  if (!isObj(origin) || !isStr(origin.id) || !isStr(origin.name)) return null;
  if (!isObj(destination) || !isStr(destination.id) || !isStr(destination.name)) return null;
  if (!isObj(route) || !isStr(route.id) || !isStr(route.label) || !isStr(route.headline) || !isStr(route.via)) {
    return null;
  }
  if (!isNum(route.distanceM) || !isNum(route.durationMinutes) || !isNum(route.extraMinutes)) return null;
  if (!BURDEN_LEVELS.includes(route.burdenLevel as string)) return null;
  if (!(route.tollWon === null || isNum(route.tollWon)) || !isObj(route.factors)) return null;
  if (!OUTCOMES.includes(raw.outcome as string) || !isNum(raw.progress) || !isBool(raw.chosenWasRecommended)) {
    return null;
  }
  const feedback = raw.feedback === null ? null : parseFeedback(raw.feedback);
  if (raw.feedback !== null && feedback === null) return null;

  const factors: SimulationRecord['route']['factors'] = {};
  for (const [code, value] of Object.entries(route.factors)) {
    if (!isFactor(code) || !isObj(value)) continue;
    const availability = value.availability;
    if (availability !== 'known' && availability !== 'partial' && availability !== 'unknown') continue;
    factors[code] = { availability, value: isNum(value.value) ? value.value : null };
  }
  return {
    id: raw.id,
    kind: 'simulation',
    createdAt: raw.createdAt,
    origin: { id: origin.id, name: origin.name },
    destination: { id: destination.id, name: destination.name },
    route: {
      id: route.id,
      label: route.label,
      headline: route.headline,
      via: route.via,
      distanceM: route.distanceM,
      durationMinutes: route.durationMinutes,
      extraMinutes: route.extraMinutes,
      burdenLevel: route.burdenLevel as SimulationRecord['route']['burdenLevel'],
      tollWon: route.tollWon as number | null,
      factors,
    },
    recommendedRouteId: isStr(raw.recommendedRouteId) ? raw.recommendedRouteId : null,
    chosenWasRecommended: raw.chosenWasRecommended,
    outcome: raw.outcome as SimulationRecord['outcome'],
    progress: raw.progress,
    feedback,
  };
}
