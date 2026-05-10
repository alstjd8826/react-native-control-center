import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runGenerate } from '../cli/runGenerate';

const FIXTURE_PBXPROJ = path.join(
  __dirname,
  '__fixtures__',
  'empty-main-app',
  'project.pbxproj'
);

/**
 * RN CLI 프로젝트의 디렉토리 구조를 흉내내는 임시 폴더.
 *
 * tmp/
 *   package.json (rnControlCenter 설정 포함)
 *   src/controls.ts
 *   ios/
 *     QuickNote/Info.plist (bundleId 추론용)
 *     QuickNote.xcodeproj/project.pbxproj
 */
function withTempBareProject(opts: {
  controlsTs: string;
  packageRnControlCenter: object | undefined;
  bundleId?: string;
  fn: (projectRoot: string) => void;
}): void {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rncc-bare-'));
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'src', 'controls.ts'), opts.controlsTs);

  const pkg: Record<string, unknown> = { name: 'demo-app' };
  if (opts.packageRnControlCenter !== undefined) {
    pkg.rnControlCenter = opts.packageRnControlCenter;
  }
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify(pkg, null, 2));

  // ios/QuickNote/Info.plist
  fs.mkdirSync(path.join(projectRoot, 'ios', 'QuickNote'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'ios', 'QuickNote', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${opts.bundleId ?? 'com.demo.app'}</string>
</dict>
</plist>`
  );

  // ios/QuickNote.xcodeproj/project.pbxproj — fixture를 카피
  fs.mkdirSync(path.join(projectRoot, 'ios', 'QuickNote.xcodeproj'), { recursive: true });
  fs.copyFileSync(
    FIXTURE_PBXPROJ,
    path.join(projectRoot, 'ios', 'QuickNote.xcodeproj', 'project.pbxproj')
  );

  try {
    opts.fn(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const buttonControls = `
import { defineControls } from 'react-native-control-center';
export default defineControls({
  quickNote: { type: 'button', title: 'Quick Note', icon: 'square.and.pencil' },
});
`;

describe('runGenerate (RN CLI)', () => {
  it('generates files and modifies pbxproj end-to-end', () => {
    withTempBareProject({
      controlsTs: buttonControls,
      packageRnControlCenter: {
        controls: './src/controls.ts',
        urlScheme: 'demo',
      },
      fn: (projectRoot) => {
        const result = runGenerate({ projectRoot });
        expect(result.filesWritten.length).toBeGreaterThanOrEqual(7);
        expect(result.widgetTargetUuid).toBeTruthy();
        expect(result.mainAppTargetUuid).toBeTruthy();

        // 핵심 파일들 디스크에 존재
        const ios = path.join(projectRoot, 'ios');
        expect(
          fs.existsSync(
            path.join(ios, 'ControlCenterExtension', 'ControlBundle.swift')
          )
        ).toBe(true);
        expect(
          fs.existsSync(path.join(ios, 'ControlCenterExtension', 'Info.plist'))
        ).toBe(true);

        // pbxproj가 디스크에 다시 쓰였는가? (수정 시간이 fixture 시간보다 늦음)
        const pbxStat = fs.statSync(result.pbxprojPath);
        expect(pbxStat.size).toBeGreaterThan(0);
        const pbxText = fs.readFileSync(result.pbxprojPath, 'utf-8');
        expect(pbxText).toContain('ControlCenterExtension');
      },
    });
  });

  it('throws when package.json is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rncc-empty-'));
    try {
      expect(() => runGenerate({ projectRoot: tmp })).toThrow(/package.json not found/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws when rnControlCenter config is missing', () => {
    withTempBareProject({
      controlsTs: buttonControls,
      packageRnControlCenter: undefined,
      fn: (projectRoot) => {
        expect(() => runGenerate({ projectRoot })).toThrow(/No "rnControlCenter" key/);
      },
    });
  });

  it('throws when controls path is missing in config', () => {
    withTempBareProject({
      controlsTs: buttonControls,
      packageRnControlCenter: { urlScheme: 'demo' },
      fn: (projectRoot) => {
        expect(() => runGenerate({ projectRoot })).toThrow(/controls is required/);
      },
    });
  });

  it('throws when urlScheme is missing', () => {
    withTempBareProject({
      controlsTs: buttonControls,
      packageRnControlCenter: { controls: './src/controls.ts' },
      fn: (projectRoot) => {
        expect(() => runGenerate({ projectRoot })).toThrow(/urlScheme is required/);
      },
    });
  });

  it('throws when ios/ folder is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rncc-noios-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'x',
        rnControlCenter: { controls: './c.ts', urlScheme: 'x' },
      })
    );
    fs.writeFileSync(path.join(tmp, 'c.ts'), buttonControls);
    try {
      expect(() => runGenerate({ projectRoot: tmp })).toThrow(/ios\/ folder not found/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('uses bundleId from package.json when explicitly provided', () => {
    withTempBareProject({
      controlsTs: buttonControls,
      packageRnControlCenter: {
        controls: './src/controls.ts',
        urlScheme: 'demo',
        bundleId: 'com.explicit.id',
      },
      fn: (projectRoot) => {
        const result = runGenerate({ projectRoot });
        const intentSwift = fs.readFileSync(
          path.join(
            projectRoot,
            'ios',
            'ControlCenterExtension',
            'Intents',
            'QuickNoteIntent.swift'
          ),
          'utf-8'
        );
        expect(intentSwift).toContain('demo://control/quickNote');
        expect(result.widgetTargetUuid).toBeTruthy();
      },
    });
  });
});
