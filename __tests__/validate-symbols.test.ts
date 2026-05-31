import {
  isKnownSymbol,
  collectUnknownSymbols,
  warnUnknownSymbols,
} from '../core/validateSymbols';
import { SF_SYMBOL_NAMES } from '../core/sf-symbols-data';
import type { ParsedControl } from '../core/types';

describe('SF Symbol data', () => {
  it('ships the full generated symbol set', () => {
    // Apple의 전체 세트는 5000개를 훌쩍 넘는다 — 큐레이션(~200)이 아니라 풀셋인지 확인
    expect(SF_SYMBOL_NAMES.length).toBeGreaterThan(5000);
  });

  it('contains well-known symbols', () => {
    expect(isKnownSymbol('square.and.pencil')).toBe(true);
    expect(isKnownSymbol('lock.fill')).toBe(true);
    expect(isKnownSymbol('wifi')).toBe(true);
  });

  it('rejects made-up names', () => {
    expect(isKnownSymbol('definitely.not.a.symbol')).toBe(false);
    expect(isKnownSymbol('lock.filll')).toBe(false); // 흔한 오타
  });
});

describe('collectUnknownSymbols', () => {
  it('returns nothing when every icon is valid', () => {
    const controls: ParsedControl[] = [
      { id: 'note', type: 'button', title: 'Note', icon: 'square.and.pencil' },
      {
        id: 'vpn',
        type: 'toggle',
        title: 'VPN',
        icons: { on: 'lock.fill', off: 'lock.open' },
        stateKey: 'vpnEnabled',
      },
    ];
    expect(collectUnknownSymbols(controls)).toEqual([]);
  });

  it('flags a button with a misspelled icon', () => {
    const controls: ParsedControl[] = [
      { id: 'note', type: 'button', title: 'Note', icon: 'squareee.and.pencil' },
    ];
    expect(collectUnknownSymbols(controls)).toEqual([
      { controlId: 'note', field: 'icon', name: 'squareee.and.pencil' },
    ]);
  });

  it('flags both on and off icons of a toggle independently', () => {
    const controls: ParsedControl[] = [
      {
        id: 'vpn',
        type: 'toggle',
        title: 'VPN',
        icons: { on: 'lock.fill', off: 'nope.icon' },
        stateKey: 'vpnEnabled',
      },
    ];
    expect(collectUnknownSymbols(controls)).toEqual([
      { controlId: 'vpn', field: 'icons.off', name: 'nope.icon' },
    ]);
  });
});

describe('warnUnknownSymbols', () => {
  it('console.warn으로 보고하고 목록을 반환한다', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const controls: ParsedControl[] = [
      { id: 'note', type: 'button', title: 'Note', icon: 'bad.symbol' },
    ];
    const result = warnUnknownSymbols(controls);
    expect(result).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toContain('bad.symbol');
    spy.mockRestore();
  });

  it('전부 유효하면 아무것도 출력하지 않는다', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownSymbols([
      { id: 'note', type: 'button', title: 'Note', icon: 'square.and.pencil' },
    ]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
