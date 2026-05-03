import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { addWidgetExtensionTarget } from '../core/xcode/addTarget';
import { setTargetBuildSettings } from '../core/xcode/buildSettings';

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

/**
 * 주어진 타겟의 모든 XCBuildConfiguration에서 특정 key의 값들을 모은다.
 * Debug + Release 두 곳에 다 적용됐는지 확인용.
 */
function getAllConfigValues(
  project: ReturnType<typeof loadProject>,
  targetUuid: string,
  key: string
): string[] {
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
    const settings = config.buildSettings as Record<string, string>;
    return settings[key] ?? '';
  });
}

describe('setTargetBuildSettings', () => {
  it('applies a setting to all configurations of a target', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      setTargetBuildSettings(project, widgetUuid, {
        IPHONEOS_DEPLOYMENT_TARGET: '18.0',
      });

      const values = getAllConfigValues(project, widgetUuid, 'IPHONEOS_DEPLOYMENT_TARGET');
      expect(values.length).toBeGreaterThanOrEqual(2); // Debug + Release at minimum
      expect(values.every((v) => v === '18.0')).toBe(true);
    });
  });

  it('quotes values that contain slashes', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      setTargetBuildSettings(project, widgetUuid, {
        INFOPLIST_FILE: 'ControlCenterExtension/Info.plist',
      });

      const values = getAllConfigValues(project, widgetUuid, 'INFOPLIST_FILE');
      expect(values.every((v) => v === '"ControlCenterExtension/Info.plist"')).toBe(true);
    });
  });

  it('leaves alphanumeric values unquoted', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      setTargetBuildSettings(project, widgetUuid, {
        SWIFT_VERSION: '5.0',
      });

      const values = getAllConfigValues(project, widgetUuid, 'SWIFT_VERSION');
      expect(values.every((v) => v === '5.0')).toBe(true); // no quotes
    });
  });

  it('overwrites existing values', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const main = summarize(project).targets.find((t) =>
        t.productType.includes('application')
      )!;

      // 메인 앱은 이미 IPHONEOS_DEPLOYMENT_TARGET 값을 갖고 있을 것
      setTargetBuildSettings(project, main.uuid, {
        IPHONEOS_DEPLOYMENT_TARGET: '20.0', // 임의 값으로 덮어쓰기
      });

      const values = getAllConfigValues(
        project,
        main.uuid,
        'IPHONEOS_DEPLOYMENT_TARGET'
      );
      expect(values.every((v) => v === '20.0')).toBe(true);
    });
  });

  it('applies multiple settings at once', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      setTargetBuildSettings(project, widgetUuid, {
        IPHONEOS_DEPLOYMENT_TARGET: '18.0',
        INFOPLIST_FILE: 'ControlCenterExtension/Info.plist',
        CODE_SIGN_ENTITLEMENTS:
          'ControlCenterExtension/ControlCenterExtension.entitlements',
        SWIFT_VERSION: '5.0',
      });

      expect(
        getAllConfigValues(project, widgetUuid, 'IPHONEOS_DEPLOYMENT_TARGET').every(
          (v) => v === '18.0'
        )
      ).toBe(true);
      expect(
        getAllConfigValues(project, widgetUuid, 'INFOPLIST_FILE').every(
          (v) => v === '"ControlCenterExtension/Info.plist"'
        )
      ).toBe(true);
      expect(
        getAllConfigValues(project, widgetUuid, 'CODE_SIGN_ENTITLEMENTS').every(
          (v) => v.includes('entitlements')
        )
      ).toBe(true);
      expect(
        getAllConfigValues(project, widgetUuid, 'SWIFT_VERSION').every((v) => v === '5.0')
      ).toBe(true);
    });
  });

  it('throws if target uuid does not exist', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      expect(() =>
        setTargetBuildSettings(project, 'NONEXISTENT', { SWIFT_VERSION: '5.0' })
      ).toThrow(/not found/);
    });
  });

  it('persists through writeSync round trip', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      setTargetBuildSettings(project, widgetUuid, {
        IPHONEOS_DEPLOYMENT_TARGET: '18.0',
      });
      fs.writeFileSync(pbxprojPath, project.writeSync());

      const reloaded = loadProject(pbxprojPath);
      const values = getAllConfigValues(
        reloaded,
        widgetUuid,
        'IPHONEOS_DEPLOYMENT_TARGET'
      );
      expect(values.every((v) => v === '18.0')).toBe(true);
    });
  });
});
