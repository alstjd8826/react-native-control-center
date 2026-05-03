import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { addWidgetExtensionTarget } from '../core/xcode/addTarget';
import { addSyncedSourceFolder } from '../core/xcode/addSyncedFolder';

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

function nonComment(uuid: string): boolean {
  return !uuid.endsWith('_comment');
}

describe('addSyncedSourceFolder', () => {
  it('creates a synchronized root group attached to the widget target', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      addSyncedSourceFolder(project, {
        widgetTargetUuid: widgetUuid,
        mainAppTargetUuid: mainTarget.uuid,
        folderName: 'NewControl',
        sharedFiles: [],
      });

      // 1) 새 SyncRootGroup 객체가 생겼는가?
      const groupSection =
        project.hash.project.objects['PBXFileSystemSynchronizedRootGroup'] ?? {};
      const groupCount = Object.keys(groupSection).filter(nonComment).length;
      // Phase 2 fixture 자체에 2개 있음 + 우리가 1개 추가 = 3
      expect(groupCount).toBe(3);

      // 2) 위젯 타겟의 fileSystemSynchronizedGroups에 등록됐는가?
      const targets = project.pbxNativeTargetSection();
      const widget = targets[widgetUuid] as Record<string, unknown>;
      const synced = widget.fileSystemSynchronizedGroups as Array<{ comment?: string }>;
      expect(synced).toBeDefined();
      expect(synced.find((g) => g.comment === 'NewControl')).toBeDefined();
    });
  });

  it('does not create an ExceptionSet when sharedFiles is empty', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;

      const beforeExceptions = Object.keys(
        project.hash.project.objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ?? {}
      ).filter(nonComment).length;

      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      addSyncedSourceFolder(project, {
        widgetTargetUuid: widgetUuid,
        mainAppTargetUuid: mainTarget.uuid,
        folderName: 'NewControl',
        sharedFiles: [],
      });

      const afterExceptions = Object.keys(
        project.hash.project.objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ?? {}
      ).filter(nonComment).length;
      expect(afterExceptions).toBe(beforeExceptions); // 새 예외 없음
    });
  });

  it('creates an ExceptionSet referencing main app target when sharedFiles given', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;

      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      addSyncedSourceFolder(project, {
        widgetTargetUuid: widgetUuid,
        mainAppTargetUuid: mainTarget.uuid,
        folderName: 'NewControl',
        sharedFiles: ['ControlStore.swift', 'Intents/QuickNoteIntent.swift'],
      });

      const exceptionSection =
        project.hash.project.objects['PBXFileSystemSynchronizedBuildFileExceptionSet']!;
      const ourException = Object.entries(exceptionSection).find(
        ([uuid, value]) =>
          !uuid.endsWith('_comment') &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).target === mainTarget.uuid
      );
      expect(ourException).toBeDefined();

      const [, exceptionObject] = ourException!;
      const memberships = (exceptionObject as Record<string, unknown>)
        .membershipExceptions as string[];
      expect(memberships).toEqual([
        'ControlStore.swift',
        'Intents/QuickNoteIntent.swift',
      ]);
    });
  });

  it('SynchronizedRootGroup references the ExceptionSet', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const mainTarget = summarize(project).targets.find((t) =>
        t.productType.includes('application')
      )!;
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      addSyncedSourceFolder(project, {
        widgetTargetUuid: widgetUuid,
        mainAppTargetUuid: mainTarget.uuid,
        folderName: 'NewControl',
        sharedFiles: ['ControlStore.swift'],
      });

      const groupSection =
        project.hash.project.objects['PBXFileSystemSynchronizedRootGroup']!;
      const ourGroup = Object.entries(groupSection).find(
        ([uuid, value]) =>
          !uuid.endsWith('_comment') &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).path === 'NewControl'
      );
      expect(ourGroup).toBeDefined();

      const [, groupObject] = ourGroup!;
      const exceptions = (groupObject as Record<string, unknown>)
        .exceptions as Array<{ value: string }> | undefined;
      expect(exceptions).toBeDefined();
      expect(exceptions!.length).toBe(1);
    });
  });

  it('persists through writeSync round trip', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const mainTarget = summarize(project).targets.find((t) =>
        t.productType.includes('application')
      )!;
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      addSyncedSourceFolder(project, {
        widgetTargetUuid: widgetUuid,
        mainAppTargetUuid: mainTarget.uuid,
        folderName: 'NewControl',
        sharedFiles: ['ControlStore.swift'],
      });
      fs.writeFileSync(pbxprojPath, project.writeSync());

      const reloaded = loadProject(pbxprojPath);
      const groupCount = Object.keys(
        reloaded.hash.project.objects['PBXFileSystemSynchronizedRootGroup'] ?? {}
      ).filter(nonComment).length;
      expect(groupCount).toBe(3);

      const exceptionCount = Object.keys(
        reloaded.hash.project.objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ?? {}
      ).filter(nonComment).length;
      // Phase 2 fixture 자체에 2개 + 우리 1개 = 3
      expect(exceptionCount).toBe(3);
    });
  });
});
