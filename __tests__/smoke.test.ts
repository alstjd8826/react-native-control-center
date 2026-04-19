import { defineControls } from '../src/defineControls';

describe('scaffold smoke test', () => {
  it('defineControls passes through its input', () => {
    const controls = defineControls({
      quickNote: {
        type: 'button',
        title: '빠른 메모',
        icon: 'square.and.pencil',
      },
    });

    expect(controls.quickNote.type).toBe('button');
    expect(controls.quickNote.title).toBe('빠른 메모');
  });

  it('typing enforces union discrimination', () => {
    const controls = defineControls({
      toggle: {
        type: 'toggle',
        title: 'VPN',
        icons: { on: 'lock.fill', off: 'lock.open' },
        stateKey: 'vpnEnabled',
      },
    });

    expect(controls.toggle.type).toBe('toggle');
  });
});
