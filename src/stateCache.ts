// ─────────────────────────────────────────────────────────────────────────
//  stateCache — control 상태의 동기 보관함 (Week 6)
//
//  getState는 Promise라 값이 "다음 tick"에 도착한다. 그 사이 UI가 null로
//  깜빡이는 걸 막기 위해, 마지막으로 알던 값을 모듈 레벨 Map에 둔다.
//  useControlState 훅이 첫 렌더에서 이 캐시를 동기로 읽어 바로 표시한다.
//
//  react-native에 의존하지 않는 순수 모듈 — 그래서 node 환경에서 단독 테스트 가능.
// ─────────────────────────────────────────────────────────────────────────

const cache = new Map<string, unknown>();

/** 캐시된 마지막 값을 동기로 반환. 한 번도 본 적 없으면 undefined. */
export function getCachedState<T>(key: string): T | undefined {
  return cache.has(key) ? (cache.get(key) as T) : undefined;
}

/** 새 값을 캐시에 기록 (getState 응답 / setState / onStateChange 이벤트에서 호출). */
export function setCachedState(key: string, value: unknown): void {
  cache.set(key, value);
}

/** 네이티브 initialState 스냅샷으로 캐시를 한 번에 채움 (콜드 스타트 시드). */
export function seedCache(initial: Record<string, unknown> | undefined): void {
  if (!initial) return;
  for (const key of Object.keys(initial)) {
    cache.set(key, initial[key]);
  }
}

/** 테스트 전용 — 캐시를 비운다. */
export function __resetCacheForTests(): void {
  cache.clear();
}
