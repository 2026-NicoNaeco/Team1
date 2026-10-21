import type { Place } from '../domain/types';
import type { PlaceSearchProvider, RequestOptions } from '../services/types';
import { CATEGORY_LABEL, DEMO_ORIGIN, PLACES } from './places';
import { abortableDelay, getScenario } from './scenario';

const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function toChoseong(text: string): string {
  return [...text]
    .map((ch) => {
      const offset = ch.charCodeAt(0) - 0xac00;
      return offset >= 0 && offset <= 11171 ? CHOSEONG[Math.floor(offset / 588)]! : ch;
    })
    .join('');
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const isChoseongQuery = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

/** 질의와 장소가 얼마나 가까운지. 낮을수록 먼저 보인다. 일치하지 않으면 null */
function matchRank(place: Place, query: string): number | null {
  const name = normalize(place.name);
  if (isChoseongQuery(query)) {
    return toChoseong(name).includes(query) ? 1 : null;
  }
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (normalize(CATEGORY_LABEL[place.category]).includes(query)) return 2;
  if (normalize(place.address).includes(query)) return 3;
  return null;
}

/**
 * 데모 장소 검색. 샘플 장소 안에서만 찾는다.
 * 샘플에 없는 검색어에는 빈 결과를 돌려주며, 없는 장소를 만들어 내지 않는다.
 */
export class DemoPlaceSearchProvider implements PlaceSearchProvider {
  getDefaultOrigin(): Place {
    return DEMO_ORIGIN;
  }

  async search(query: string, options?: RequestOptions): Promise<Place[]> {
    await abortableDelay(getScenario().searchLatencyMs, options?.signal);
    const q = normalize(query);
    if (q.length === 0) return [];
    return PLACES.map((place) => ({ place, rank: matchRank(place, q) }))
      .filter((m): m is { place: Place; rank: number } => m.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'ko'))
      .map((m) => m.place);
  }

  async listSamples(options?: RequestOptions): Promise<Place[]> {
    await abortableDelay(Math.min(getScenario().searchLatencyMs, 150), options?.signal);
    return PLACES.filter((p) => p.id !== 'station');
  }
}
