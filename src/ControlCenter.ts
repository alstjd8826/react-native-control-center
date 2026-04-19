// Day 4~5에서 NativeModule 래퍼로 구체화
export const ControlCenter = {
  onAction(_cb: (e: { id: string; params: Record<string, unknown> }) => void): () => void {
    return () => {};
  },
  onStateChange<T>(_key: string, _cb: (value: T) => void): () => void {
    return () => {};
  },
  setState<T>(_key: string, _value: T): Promise<void> {
    return Promise.resolve();
  },
  getState<T>(_key: string): T | null {
    return null;
  },
  isAvailable(): boolean {
    return false;
  },
};
