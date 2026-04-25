import plist from 'plist';
import { generateExtensionInfoPlist } from '../core/generate/plist';

describe('generateExtensionInfoPlist', () => {
  it('produces valid XML plist', () => {
    const xml = generateExtensionInfoPlist();
    expect(xml.startsWith('<?xml')).toBe(true);
    // 라운드트립으로 파싱 가능해야 함
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed.NSExtension.NSExtensionPointIdentifier).toBe(
      'com.apple.widgetkit-extension'
    );
  });

  it('includes display name when provided', () => {
    const xml = generateExtensionInfoPlist({ extensionBundleName: 'MyControlExt' });
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed.CFBundleDisplayName).toBe('MyControlExt');
  });

  it('omits display name when not provided', () => {
    const xml = generateExtensionInfoPlist();
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed.CFBundleDisplayName).toBeUndefined();
  });

  it('merges custom extra keys at root level', () => {
    const xml = generateExtensionInfoPlist({
      extra: { CFBundlePackageType: 'XPC!', NSHumanReadableCopyright: '© 2026' },
    });
    const parsed = plist.parse(xml) as Record<string, any>;
    expect(parsed.CFBundlePackageType).toBe('XPC!');
    expect(parsed.NSHumanReadableCopyright).toBe('© 2026');
  });

  it('does not mutate the input options', () => {
    const opts = { extra: { foo: 'bar' } };
    generateExtensionInfoPlist(opts);
    expect(opts).toEqual({ extra: { foo: 'bar' } });
  });
});
