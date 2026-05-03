import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { addWidgetExtensionTarget } from '../core/xcode/addTarget';
import { verifyEmbedded } from '../core/xcode/embed';

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

describe('verifyEmbedded', () => {
  it('confirms widget is auto-embedded into main app after addWidgetExtensionTarget', () => {
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

      const result = verifyEmbedded(project, mainTarget.uuid, widgetUuid);
      expect(result.ok).toBe(true);
    });
  });

  it('reports failure when given a target uuid that does not exist', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const result = verifyEmbedded(project, 'NONEXISTENT', 'NONEXISTENT2');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  it('confirms Phase 2 reference project has its widget embedded', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const summary = summarize(project);
      const main = summary.targets.find((t) =>
        t.productType.includes('application')
      )!;
      const widget = summary.targets.find((t) =>
        t.productType.includes('app-extension')
      )!;

      // Phase 2 fixture는 처음부터 정상 임베드 상태여야 함
      const result = verifyEmbedded(project, main.uuid, widget.uuid);
      expect(result.ok).toBe(true);
    });
  });

  it('total embedded .appex count grows by 1 after adding a new widget', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);
      const mainTarget = before.targets.find((t) =>
        t.productType.includes('application')
      )!;

      const totalBefore = mainTarget.buildPhases
        .filter((p) => p.isa === 'PBXCopyFilesBuildPhase')
        .reduce((sum, p) => sum + p.fileCount, 0);

      addWidgetExtensionTarget(project, {
        name: 'NewControl',
        bundleId: 'com.acme.app.NewControl',
      });

      const after = summarize(project);
      const mainAfter = after.targets.find((t) => t.uuid === mainTarget.uuid)!;
      const totalAfter = mainAfter.buildPhases
        .filter((p) => p.isa === 'PBXCopyFilesBuildPhase')
        .reduce((sum, p) => sum + p.fileCount, 0);

      // xcode 패키지가 기존 페이즈에 추가하든 새 페이즈를 만들든,
      // 메인 앱이 임베드하는 .appex 총 개수는 1개 늘어야 함
      expect(totalAfter).toBe(totalBefore + 1);
    });
  });
});
