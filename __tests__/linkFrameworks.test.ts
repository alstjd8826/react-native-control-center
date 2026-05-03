import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { addWidgetExtensionTarget } from '../core/xcode/addTarget';
import { linkFrameworks } from '../core/xcode/linkFrameworks';

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

describe('linkFrameworks', () => {
  it('adds 3 frameworks to a freshly added widget target', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      linkFrameworks(project, widgetUuid, {
        frameworks: ['WidgetKit', 'SwiftUI', 'AppIntents'],
      });

      const summary = summarize(project);
      const widget = summary.targets.find((t) => t.uuid === widgetUuid)!;
      const frameworks = widget.buildPhases.find((p) => p.isa === 'PBXFrameworksBuildPhase')!;
      expect(frameworks.fileCount).toBe(3);
    });
  });

  it('linking the same framework to two targets reuses the FileReference', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);

      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      // Phase 2 fixture는 이미 AppIntents.framework 갖고 있으므로
      // 두 번 링크해도 새로운 FileReference는 생기지 않아야 함.
      const fileRefAfterAddTarget = summarize(project).fileReferenceCount;

      // 위젯에 AppIntents 링크 → 기존 FileRef 재사용
      linkFrameworks(project, widgetUuid, { frameworks: ['AppIntents'] });

      // 메인 앱(이미 있는 타겟)에도 AppIntents 링크 → 또 재사용
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;
      linkFrameworks(project, mainTarget.uuid, { frameworks: ['AppIntents'] });

      const after = summarize(project);

      // FileReference: 두 linkFrameworks 호출이 모두 재사용해야 하므로 변화 없음
      expect(after.fileReferenceCount).toBe(fileRefAfterAddTarget);

      // 각 타겟의 Frameworks 빌드 페이즈에 AppIntents 메모(BuildFile)가 들어가야 함
      const widget = after.targets.find((t) => t.uuid === widgetUuid)!;
      const main = after.targets.find((t) => t.uuid === mainTarget.uuid)!;

      const widgetFrameworks = widget.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;
      const mainFrameworks = main.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;

      // 위젯엔 새로 +1 (전엔 비어있었음)
      expect(widgetFrameworks).toBe(1);
      // 메인 앱엔 기존 1개(Phase 2에서 이미 AppIntents 링크됨) + 우리가 1개 더 추가
      expect(mainFrameworks).toBe(2);
    });
  });

  it('does not affect untouched targets', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;
      const mainFrameworksBefore = mainTarget.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;

      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      linkFrameworks(project, widgetUuid, {
        frameworks: ['WidgetKit', 'SwiftUI', 'AppIntents'],
      });

      // 메인 앱의 Frameworks는 그대로여야 함
      const after = summarize(project);
      const mainAfter = after.targets.find((t) => t.uuid === mainTarget.uuid)!;
      const mainFrameworksAfter = mainAfter.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!.fileCount;
      expect(mainFrameworksAfter).toBe(mainFrameworksBefore);
    });
  });

  it('persists through writeSync round trip', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid: widgetUuid } = addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });
      linkFrameworks(project, widgetUuid, {
        frameworks: ['WidgetKit', 'SwiftUI', 'AppIntents'],
      });
      fs.writeFileSync(pbxprojPath, project.writeSync());

      const reloaded = loadProject(pbxprojPath);
      const reloadedSummary = summarize(reloaded);
      const widget = reloadedSummary.targets.find((t) => t.uuid === widgetUuid)!;
      const frameworks = widget.buildPhases.find(
        (p) => p.isa === 'PBXFrameworksBuildPhase'
      )!;
      expect(frameworks.fileCount).toBe(3);
    });
  });
});
