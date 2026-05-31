import { useState, useEffect, useCallback } from 'react';
import { ControlCenter } from './ControlCenter';

/**
 * App Group에 저장된 control 상태에 React 친화적 접근을 제공.
 *
 * Week 6: 캐시 레이어로 sync 초기값 보장.
 * 첫 렌더에서 ControlCenter의 캐시(네이티브 initialState 시드 + 직전 값)를
 * 동기로 읽어 깜빡임을 없앤다. 캐시에 없으면 null로 시작해 getState 응답을 기다림.
 */
export function useControlState<T>(key: string): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(() => {
    const cached = ControlCenter.getCachedState<T>(key);
    return cached !== undefined ? cached : null;
  });

  // 초기값 — native에 비동기로 물어봄 (캐시가 오래됐을 수 있으니 최신값으로 보정)
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
