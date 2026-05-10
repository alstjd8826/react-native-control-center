import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateAndWriteFiles, deriveSharedFiles } from '../plugin';
import type { NativeFile } from '../core/generate';

/**
 * 임시 사용자 프로젝트(controls.ts + ios/ 폴더)를 만들고 종료 시 정리.
 */
function withTempUserProject(
  controlsTsContent: string,
  fn: (paths: { projectRoot: string; platformRoot: string; controlsRel: string }) => void
): void {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rncc-user-'));
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'ios'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'src', 'controls.ts'), controlsTsContent);

  try {
    fn({
      projectRoot,
      platformRoot: path.join(projectRoot, 'ios'),
      controlsRel: './src/controls.ts',
    });
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const buttonOnlyControls = `
import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: 'Quick Note',
    icon: 'square.and.pencil',
  },
});
`;

const mixedControls = `
import { defineControls } from 'react-native-control-center';

export default defineControls({
  quickNote: {
    type: 'button',
    title: 'Quick Note',
    icon: 'square.and.pencil',
  },
  vpn: {
    type: 'toggle',
    title: 'VPN',
    icons: { on: 'lock.fill', off: 'lock.open' },
    stateKey: 'vpnEnabled',
  },
});
`;

describe('generateAndWriteFiles (plugin core logic)', () => {
  it('writes the expected files into platformRoot', () => {
    withTempUserProject(buttonOnlyControls, ({ projectRoot, platformRoot, controlsRel }) => {
      const { files } = generateAndWriteFiles({
        projectRoot,
        platformRoot,
        bundleId: 'com.acme.app',
        controls: controlsRel,
        urlScheme: 'acme',
      });

      // 모든 약속된 파일이 디스크에 존재해야 함
      for (const f of files) {
        expect(fs.existsSync(path.join(platformRoot, f.path))).toBe(true);
      }
      // 핵심 파일 직접 확인
      expect(
        fs.existsSync(path.join(platformRoot, 'ControlCenterExtension/ControlBundle.swift'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(platformRoot, 'ControlCenterExtension/Controls/QuickNoteControl.swift')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(platformRoot, 'ControlCenterExtension/Intents/QuickNoteIntent.swift')
        )
      ).toBe(true);
    });
  });

  it('writes both Toggle and Button when controls.ts has mixed types', () => {
    withTempUserProject(mixedControls, ({ projectRoot, platformRoot, controlsRel }) => {
      generateAndWriteFiles({
        projectRoot,
        platformRoot,
        bundleId: 'com.acme.app',
        controls: controlsRel,
        urlScheme: 'acme',
      });
      expect(
        fs.existsSync(
          path.join(platformRoot, 'ControlCenterExtension/Controls/VpnControl.swift')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(platformRoot, 'ControlCenterExtension/Intents/VpnIntent.swift')
        )
      ).toBe(true);
    });
  });

  it('throws when controls.ts is missing', () => {
    withTempUserProject('', ({ projectRoot, platformRoot }) => {
      // 일부러 빈 controls.ts 만들었지만 다른 경로로 호출
      expect(() =>
        generateAndWriteFiles({
          projectRoot,
          platformRoot,
          bundleId: 'com.acme.app',
          controls: './nonexistent.ts',
          urlScheme: 'acme',
        })
      ).toThrow(/controls file not found/);
    });
  });

  it('honors custom extensionName when writing output paths', () => {
    withTempUserProject(buttonOnlyControls, ({ projectRoot, platformRoot, controlsRel }) => {
      generateAndWriteFiles({
        projectRoot,
        platformRoot,
        bundleId: 'com.acme.app',
        controls: controlsRel,
        urlScheme: 'acme',
        extensionName: 'MyControls',
      });
      expect(
        fs.existsSync(path.join(platformRoot, 'MyControls/ControlBundle.swift'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(platformRoot, 'MyControls/Info.plist'))
      ).toBe(true);
    });
  });

  it('controls.ts content survives round trip into Swift output', () => {
    withTempUserProject(buttonOnlyControls, ({ projectRoot, platformRoot, controlsRel }) => {
      generateAndWriteFiles({
        projectRoot,
        platformRoot,
        bundleId: 'com.acme.app',
        controls: controlsRel,
        urlScheme: 'acme',
      });
      const generatedSwift = fs.readFileSync(
        path.join(platformRoot, 'ControlCenterExtension/Controls/QuickNoteControl.swift'),
        'utf-8'
      );
      // controls.ts에서 선언한 title/icon이 Swift 코드에 들어있어야 함
      expect(generatedSwift).toContain('"Quick Note"');
      expect(generatedSwift).toContain('"square.and.pencil"');
    });
  });
});

describe('deriveSharedFiles', () => {
  it('extracts shared paths and strips the extension folder prefix', () => {
    const files: NativeFile[] = [
      {
        path: 'ControlCenterExtension/ControlBundle.swift',
        content: '',
        target: 'extension',
      },
      { path: 'ControlCenterExtension/ControlStore.swift', content: '', target: 'shared' },
      {
        path: 'ControlCenterExtension/Intents/QuickNoteIntent.swift',
        content: '',
        target: 'shared',
      },
      {
        path: 'ControlCenterExtension/MainApp.entitlements',
        content: '',
        target: 'app',
      },
    ];

    expect(deriveSharedFiles(files, 'ControlCenterExtension')).toEqual([
      'ControlStore.swift',
      'Intents/QuickNoteIntent.swift',
    ]);
  });

  it('returns empty array when no shared files', () => {
    const files: NativeFile[] = [
      {
        path: 'ControlCenterExtension/ControlBundle.swift',
        content: '',
        target: 'extension',
      },
    ];
    expect(deriveSharedFiles(files, 'ControlCenterExtension')).toEqual([]);
  });

  it('respects custom extension folder name', () => {
    const files: NativeFile[] = [
      { path: 'MyExt/ControlStore.swift', content: '', target: 'shared' },
    ];
    expect(deriveSharedFiles(files, 'MyExt')).toEqual(['ControlStore.swift']);
  });
});
