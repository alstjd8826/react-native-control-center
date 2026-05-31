import {
  getCachedState,
  setCachedState,
  seedCache,
  __resetCacheForTests,
} from '../src/stateCache';

describe('stateCache', () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it('returns undefined for keys it has never seen', () => {
    expect(getCachedState('nope')).toBeUndefined();
  });

  it('stores and returns a value synchronously', () => {
    setCachedState('vpnEnabled', true);
    expect(getCachedState<boolean>('vpnEnabled')).toBe(true);
  });

  it('distinguishes a stored false from an unseen key', () => {
    setCachedState('wifiEnabled', false);
    // false 값과 "본 적 없음(undefined)"은 다르게 취급되어야 한다
    expect(getCachedState<boolean>('wifiEnabled')).toBe(false);
    expect(getCachedState<boolean>('other')).toBeUndefined();
  });

  it('overwrites with the latest value', () => {
    setCachedState('x', 1);
    setCachedState('x', 2);
    expect(getCachedState<number>('x')).toBe(2);
  });

  it('seeds multiple keys from a native snapshot', () => {
    seedCache({ vpnEnabled: true, wifiEnabled: false });
    expect(getCachedState<boolean>('vpnEnabled')).toBe(true);
    expect(getCachedState<boolean>('wifiEnabled')).toBe(false);
  });

  it('treats an undefined snapshot as a no-op', () => {
    expect(() => seedCache(undefined)).not.toThrow();
    expect(getCachedState('anything')).toBeUndefined();
  });
});
