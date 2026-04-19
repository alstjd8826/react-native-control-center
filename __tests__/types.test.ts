import { defineControls } from '../src/defineControls';
import type { StrictSFSymbolName } from '../src/types';

describe('SFSymbolName types', () => {
  it('accepts known SF Symbols', () => {
    const controls = defineControls({
      quickNote: {
        type: 'button',
        title: '빠른 메모',
        icon: 'square.and.pencil',
      },
    });
    expect(controls.quickNote.icon).toBe('square.and.pencil');
  });

  it('flex mode accepts arbitrary strings', () => {
    // Custom symbol not in our curated list
    const controls = defineControls({
      custom: {
        type: 'button',
        title: 'Custom',
        icon: 'my.custom.symbol.v3',
      },
    });
    expect(controls.custom.icon).toBe('my.custom.symbol.v3');
  });

  it('strict mode enforces known symbols at type level', () => {
    // 이 체크는 컴파일 타임에만 작동 (런타임 효과 없음)
    const strict: StrictSFSymbolName = 'heart.fill';
    expect(strict).toBe('heart.fill');
  });

  it('supports toggle with separate on/off icons', () => {
    const controls = defineControls({
      vpn: {
        type: 'toggle',
        title: 'VPN',
        icons: { on: 'lock.fill', off: 'lock.open' },
        stateKey: 'vpnEnabled',
      },
    });
    expect(controls.vpn.icons.on).toBe('lock.fill');
    expect(controls.vpn.icons.off).toBe('lock.open');
  });

  it('supports tint with hex color', () => {
    const controls = defineControls({
      warning: {
        type: 'button',
        title: 'Warning',
        icon: 'exclamationmark.triangle.fill',
        tint: '#FF9500',
      },
    });
    expect(controls.warning.tint).toBe('#FF9500');
  });
});
