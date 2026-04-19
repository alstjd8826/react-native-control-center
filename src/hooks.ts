import { useState, useEffect, useCallback } from 'react';
import { ControlCenter } from './ControlCenter';

export function useControlState<T>(key: string): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(() => ControlCenter.getState<T>(key));

  useEffect(() => {
    return ControlCenter.onStateChange<T>(key, (newVal) => setValue(newVal));
  }, [key]);

  const setter = useCallback(
    (newVal: T) => {
      ControlCenter.setState(key, newVal);
      setValue(newVal);
    },
    [key]
  );

  return [value, setter];
}
