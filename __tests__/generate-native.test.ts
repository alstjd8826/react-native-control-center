import * as path from 'node:path';
import { parseControlsFile } from '../core/parseControls';
import { generateNativeFiles } from '../core/generate';

const fixture = (name: string) => path.join(__dirname, '__fixtures__', name);

describe('generateNativeFiles — full E2E', () => {
  it('emits all expected files for a Button-only fixture', () => {
    const controls = parseControlsFile(fixture('valid-single-button.ts'));
    const files = generateNativeFiles({
      controls,
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });

    expect(files.map((f) => `${f.target}:${f.path}`).sort()).toEqual([
      'app:ControlCenterExtension/MainApp.entitlements',
      'extension:ControlCenterExtension/ControlBundle.swift',
      'extension:ControlCenterExtension/ControlCenterExtension.entitlements',
      'extension:ControlCenterExtension/Controls/QuickNoteControl.swift',
      'extension:ControlCenterExtension/Info.plist',
      'shared:ControlCenterExtension/ControlStore.swift',
      'shared:ControlCenterExtension/Intents/QuickNoteIntent.swift',
    ]);
  });

  it('emits all expected files for a mixed Button + Toggle fixture', () => {
    const controls = parseControlsFile(fixture('valid-mixed-with-toggle.ts'));
    const files = generateNativeFiles({
      controls,
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });

    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain('ControlCenterExtension/Controls/QuickNoteControl.swift');
    expect(paths).toContain('ControlCenterExtension/Controls/VpnControl.swift');
    expect(paths).toContain('ControlCenterExtension/Intents/QuickNoteIntent.swift');
    expect(paths).toContain('ControlCenterExtension/Intents/VpnIntent.swift');
    expect(paths).toContain('ControlCenterExtension/ControlStore.swift');
    expect(paths).toContain('ControlCenterExtension/Info.plist');
    expect(paths).toContain('ControlCenterExtension/ControlCenterExtension.entitlements');
    expect(paths).toContain('ControlCenterExtension/MainApp.entitlements');
  });

  it('app + extension entitlements share the same App Group', () => {
    const controls = parseControlsFile(fixture('valid-single-button.ts'));
    const files = generateNativeFiles({
      controls,
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });
    const ext = files.find((f) => f.path.endsWith('ControlCenterExtension.entitlements'))!;
    const app = files.find((f) => f.path.endsWith('MainApp.entitlements'))!;
    expect(ext.content).toBe(app.content);
    expect(ext.content).toContain('group.com.acme.app.controls');
  });

  it('respects custom extension name and app group id', () => {
    const controls = parseControlsFile(fixture('valid-single-button.ts'));
    const files = generateNativeFiles({
      controls,
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
      extensionName: 'MyControls',
      appGroupId: 'group.team.shared',
    });
    expect(files.every((f) => f.path.startsWith('MyControls/'))).toBe(true);
    const store = files.find((f) => f.path.endsWith('ControlStore.swift'))!;
    expect(store.content).toContain('"group.team.shared"');
  });

  it('marks shared files (Store + Intents) for both targets', () => {
    const controls = parseControlsFile(fixture('valid-mixed-with-toggle.ts'));
    const files = generateNativeFiles({
      controls,
      bundleId: 'com.acme.app',
      urlScheme: 'acme',
    });

    const sharedPaths = files.filter((f) => f.target === 'shared').map((f) => f.path);
    expect(sharedPaths).toContain('ControlCenterExtension/ControlStore.swift');
    expect(sharedPaths).toContain('ControlCenterExtension/Intents/QuickNoteIntent.swift');
    expect(sharedPaths).toContain('ControlCenterExtension/Intents/VpnIntent.swift');

    const extensionPaths = files.filter((f) => f.target === 'extension').map((f) => f.path);
    expect(extensionPaths).toContain('ControlCenterExtension/ControlBundle.swift');
    expect(extensionPaths).toContain('ControlCenterExtension/Controls/QuickNoteControl.swift');
    expect(extensionPaths).toContain('ControlCenterExtension/Controls/VpnControl.swift');
  });
});
