import { generateSwiftFiles, defaultAppGroupId } from '../core/generate/swift';
import type { ParsedControl } from '../core/types';

const baseButton: ParsedControl = {
  id: 'quickNote',
  type: 'button',
  title: 'Quick Note',
  icon: 'square.and.pencil',
};

describe('ControlStore.swift generation', () => {
  it('uses default app group id derived from bundle id', () => {
    expect(defaultAppGroupId('com.acme.app')).toBe('group.com.acme.app.controls');
  });

  it('renders ControlStore with default app group id', () => {
    const files = generateSwiftFiles({
      controls: [baseButton],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const store = files.find((f) => f.path === 'ControlStore.swift')!;
    expect(store.content).toContain(
      'public static let appGroupId = "group.com.acme.app.controls"'
    );
    expect(store.content).toContain(
      'public static let darwinNotificationName = "group.com.acme.app.controls.event"'
    );
  });

  it('honors custom app group id', () => {
    const files = generateSwiftFiles({
      controls: [baseButton],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
      appGroupId: 'group.custom.shared',
    });
    const store = files.find((f) => f.path === 'ControlStore.swift')!;
    expect(store.content).toContain('public static let appGroupId = "group.custom.shared"');
  });

  it('exposes the public API the runtime needs', () => {
    const files = generateSwiftFiles({
      controls: [baseButton],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const store = files.find((f) => f.path === 'ControlStore.swift')!;
    // toggle state
    expect(store.content).toContain('public func getBool(_ key: String) -> Bool');
    expect(store.content).toContain('public func setBool(_ key: String, value: Bool)');
    // queue draining (called by the native module)
    expect(store.content).toContain('public func dequeueActionEvents()');
    expect(store.content).toContain('public func dequeueStateChangeEvents()');
  });

  it('keeps action queue separate from state change queue', () => {
    const files = generateSwiftFiles({
      controls: [baseButton],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const store = files.find((f) => f.path === 'ControlStore.swift')!;
    expect(store.content).toContain('"__rncc.actionQueue"');
    expect(store.content).toContain('"__rncc.stateChangeQueue"');
  });

  it('posts a Darwin notification on every enqueue', () => {
    const files = generateSwiftFiles({
      controls: [baseButton],
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const store = files.find((f) => f.path === 'ControlStore.swift')!;
    expect(store.content).toContain('CFNotificationCenterGetDarwinNotifyCenter');
    expect(store.content).toContain('CFNotificationCenterPostNotification');
  });
});
