import plist from 'plist';
import {
  generateAppGroupEntitlements,
  mergeAppGroupIntoEntitlements,
} from '../core/generate/entitlements';

describe('generateAppGroupEntitlements', () => {
  it('emits a single-group entitlements file', () => {
    const xml = generateAppGroupEntitlements({ appGroupId: 'group.com.acme.app.controls' });
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed['com.apple.security.application-groups']).toEqual([
      'group.com.acme.app.controls',
    ]);
  });

  it('merges extra entitlement keys', () => {
    const xml = generateAppGroupEntitlements({
      appGroupId: 'group.com.acme.app.controls',
      merge: {
        'com.apple.security.cs.allow-jit': true,
      },
    });
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed['com.apple.security.cs.allow-jit']).toBe(true);
    expect(parsed['com.apple.security.application-groups']).toEqual([
      'group.com.acme.app.controls',
    ]);
  });

  it('output is valid plist XML', () => {
    const xml = generateAppGroupEntitlements({ appGroupId: 'group.x.y' });
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(() => plist.parse(xml)).not.toThrow();
  });
});

describe('mergeAppGroupIntoEntitlements', () => {
  it('adds the group to a file with no existing groups', () => {
    const existing = plist.build({
      'com.apple.developer.icloud-services': ['CloudKit'],
    } as any);
    const merged = mergeAppGroupIntoEntitlements(existing, 'group.com.acme.app.controls');
    const parsed = plist.parse(merged) as Record<string, any>;
    expect(parsed['com.apple.security.application-groups']).toEqual([
      'group.com.acme.app.controls',
    ]);
    expect(parsed['com.apple.developer.icloud-services']).toEqual(['CloudKit']);
  });

  it('appends to existing groups without duplicating', () => {
    const existing = plist.build({
      'com.apple.security.application-groups': ['group.foo', 'group.com.acme.app.controls'],
    } as any);
    const merged = mergeAppGroupIntoEntitlements(existing, 'group.com.acme.app.controls');
    const parsed = plist.parse(merged) as Record<string, any>;
    expect(parsed['com.apple.security.application-groups']).toEqual([
      'group.foo',
      'group.com.acme.app.controls',
    ]);
  });

  it('preserves order while deduplicating', () => {
    const existing = plist.build({
      'com.apple.security.application-groups': ['group.a', 'group.b'],
    } as any);
    const merged = mergeAppGroupIntoEntitlements(existing, 'group.c');
    const parsed = plist.parse(merged) as Record<string, any>;
    expect(parsed['com.apple.security.application-groups']).toEqual([
      'group.a',
      'group.b',
      'group.c',
    ]);
  });
});
