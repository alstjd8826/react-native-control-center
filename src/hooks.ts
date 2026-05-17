import { useState, useEffect, useCallback } from 'react';
import { ControlCenter } from './ControlCenter';

/**
 * App Group에 저장된 control 상태에 React 친화적 접근을 제공.
 *
 * Week 5 한계: getState가 Promise라 첫 렌더는 항상 null,
 * 다음 tick에 실제 값으로 업데이트.
 * Week 6에서 캐시 레이어를 추가해 sync 초기값을 보장할 예정.
 */
export function useControlState<T>(key: string): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null);

  // 초기값 — native에 비동기로 물어봄
  useEffect(() => {
    let cancelled = false;
    ControlCenter.getState<T>(key).then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // 변경 이벤트 구독
  useEffect(() => {
    return ControlCenter.onStateChange<T>(key, (newVal) => setValue(newVal));
  }, [key]);

  const setter = useCallback(
    (newVal: T) => {
      ControlCenter.setState(key, newVal);
      setValue(newVal); // optimistic update — 다음 이벤트가 같은 값을 다시 보내도 무해
    },
    [key]
  );

  return [value, setter];
}
