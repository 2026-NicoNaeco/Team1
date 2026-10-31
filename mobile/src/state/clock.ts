/** 시간과 id 생성을 한곳에 모아 테스트에서 고정할 수 있게 한다 */
export const clock = {
  now: (): Date => new Date(),
  id: (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
};
