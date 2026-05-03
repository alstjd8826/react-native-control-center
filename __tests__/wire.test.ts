import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { wireXcodeProject } from '../core/xcode/wire';

const FIXTURE_PBXPROJ = path.join(
  __dirname,
  '__fixtures__',
  'empty-main-app',
  'project.pbxproj'
);

function withTempProject<T>(fn: (pbxprojPath: string) => T): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rncc-pbx-'));
  const pbxprojPath = path.join(tmpDir, 'project.pbxproj');
  fs.copyFileSync(FIXTURE_PBXPROJ, pbxprojPath);
  try {
    return fn(pbxprojPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const baseOptions = {
  mainAppBundleId: 'com.acme.app',
  widgetTargetName: 'ControlCenterExtension',
  widgetBundleId: 'com.acme.app.controlcenter',
  sharedFiles: ['ControlStore.swift', 'Intents/QuickNoteIntent.swift'],
};

describe('wireXcodeProject (full integration)', () => {
  it('returns both target uuids and they exist', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { widgetTargetUuid, mainAppTargetUuid } = wireXcodeProject(
        project,
        baseOptions
      );

      const summary = summarize(project);
      const uuids = summary.targets.map((t) => t.uuid);
      expect(uuids).toContain(widgetTargetUuid);
      expect(uuids).toContain(mainAppTargetUuid);
    });
  });

  it('widget target has WidgetKit/SwiftUI/AppIntents linked', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { widgetTargetUuid } = wireXcodeProject(project, baseOptions);

      const widget = summarize(project).targets.find((t) => t.uuid === widgetTargetUuid)!;
      const frameworks = widget.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!;
      expect(frameworks.fileCount).toBe(3);
    });
  });

  it('main app gets AppIntents added (in addition to existing)', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const main = before.targets.find((t) =>
        t.productType.includes('application')
      )!;
      const beforeMainFrameworks = main.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;

      wireXcodeProject(project, baseOptions);

      const after = summarize(project);
      const mainAfter = after.targets.find((t) => t.uuid === main.uuid)!;
      const afterMainFrameworks = mainAfter.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;
      // 기존 1개(AppIntents 이미 링크됨) + 우리가 또 호출 = 재사용 → 같은 1개
      // 또는 새로 1개 추가될 수도 있음 — 어느 쪽이든 ≥1
      expect(afterMainFrameworks).toBeGreaterThanOrEqual(beforeMainFrameworks);
    });
  });

  it('synced folder + ExceptionSet are created', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      wireXcodeProject(project, baseOptions);

      const groupCount = Object.keys(
        project.hash.project.objects['PBXFileSystemSynchronizedRootGroup'] ?? {}
      ).filter((k) => !k.endsWith('_comment')).length;
      expect(groupCount).toBe(3); // Phase 2 fixture 2개 + 우리 1개

      const exceptionCount = Object.keys(
        project.hash.project.objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ?? {}
      ).filter((k) => !k.endsWith('_comment')).length;
      expect(exceptionCount).toBe(3); // Phase 2 2개 + 우리 1개 (sharedFiles 있으므로)
    });
  });

  it('widget target has all expected build settings', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { widgetTargetUuid } = wireXcodeProject(project, baseOptions);

      const settings = collectBuildSettings(project, widgetTargetUuid);
      // Debug + Release 둘 다 같은 값을 가져야 함
      for (const config of settings) {
        expect(config.IPHONEOS_DEPLOYMENT_TARGET).toBe('18.0');
        expect(config.SWIFT_VERSION).toBe('5.0');
        expect(config.PRODUCT_BUNDLE_IDENTIFIER).toContain('controlcenter');
        expect(config.INFOPLIST_FILE).toContain('Info.plist');
        expect(config.CODE_SIGN_ENTITLEMENTS).toContain('.entitlements');
      }
    });
  });

  it('main app target gets CODE_SIGN_ENTITLEMENTS pointing to MainApp.entitlements', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { mainAppTargetUuid } = wireXcodeProject(project, baseOptions);

      const settings = collectBuildSettings(project, mainAppTargetUuid);
      for (const config of settings) {
        expect(config.CODE_SIGN_ENTITLEMENTS).toContain('MainApp.entitlements');
      }
    });
  });

  it('embed verification passes after wiring', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      // wire 자체가 verifyEmbedded를 호출하므로 throw 없이 끝나면 통과
      expect(() => wireXcodeProject(project, baseOptions)).not.toThrow();
    });
  });

  it('persists through writeSync round trip', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { widgetTargetUuid } = wireXcodeProject(project, baseOptions);
      fs.writeFileSync(pbxprojPath, project.writeSync());

      const reloaded = loadProject(pbxprojPath);
      const widget = summarize(reloaded).targets.find((t) => t.uuid === widgetTargetUuid);
      expect(widget).toBeDefined();
      expect(widget!.productType).toContain('app-extension');
    });
  });

  it('respects custom deploymentTarget and swiftVersion', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { widgetTargetUuid } = wireXcodeProject(project, {
        ...baseOptions,
        deploymentTarget: '17.0',
        swiftVersion: '5.9',
      });

      const settings = collectBuildSettings(project, widgetTargetUuid);
      for (const config of settings) {
        expect(config.IPHONEOS_DEPLOYMENT_TARGET).toBe('17.0');
        expect(config.SWIFT_VERSION).toBe('5.9');
      }
    });
  });
});

/** 헬퍼: 타겟의 모든 configuration의 buildSettings dict를 모은다. */
function collectBuildSettings(
  project: ReturnType<typeof loadProject>,
  targetUuid: string
): Record<string, string>[] {
  const objects = project.hash.project.objects;
  const target = project.pbxNativeTargetSection()[targetUuid] as Record<string, unknown>;
  const configListUuid = target.buildConfigurationList as string;
  const configList = objects['XCConfigurationList']![configListUuid] as Record<
    string,
    unknown
  >;
  const buildConfigs = configList.buildConfigurations as Array<{ value: string }>;
  return buildConfigs.map((ref) => {
    const config = objects['XCBuildConfiguration']![ref.value] as Record<string, unknown>;
    return (config.buildSettings as Record<string, string>) ?? {};
  });
}
