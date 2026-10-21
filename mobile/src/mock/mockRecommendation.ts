import { recommend } from '../domain/recommend';
import type { RecommendationInput, RecommendationService } from '../services/types';
import type { RecommendationResult } from '../domain/types';

/**
 * 모의 추천 서비스. domain/recommend.ts 의 결정적 규칙을 비동기 인터페이스로 감싼다.
 * 실제 추천·개인화 모델이 아니다. 같은 입력에는 항상 같은 결과가 나온다.
 */
export class DemoRecommendationService implements RecommendationService {
  async recommend(input: RecommendationInput): Promise<RecommendationResult> {
    return recommend(input.candidates, input.preferences, input.excluded ?? []);
  }
}
