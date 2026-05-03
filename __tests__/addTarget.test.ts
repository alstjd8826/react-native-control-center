import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadProject, summarize } from '../core/xcode/inspect';
import { addWidgetExtensionTarget } from '../core/xcode/addTarget';

const FIXTURE_PBXPROJ = path.join(
  __dirname,
  '__fixtures__',
  'empty-main-app',
  'project.pbxproj'
);

/**
 * 픽스처 pbxproj를 임시 디렉터리에 복사 → 그 위에서 변형 테스트.
 * 원본 fixture는 절대 수정하지 않음.
 */
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

describe('addWidgetExtensionTarget', () => {
  it('adds a new target alongside existing ones', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const before = summarize(project);

      addWidgetExtensionTarget(project, {
        name: 'NewControlCenter',
        bundleId: 'com.acme.app.NewControlCenter',
      });

      const after = summarize(project);
      expect(after.targets.length).toBe(before.targets.length + 1);
    });
  });

  it('new target has app-extension product type', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);

      const { uuid, target } = addWidgetExtensionTarget(project, {
        name: 'NewControlCenter',
        bundleId: 'com.acme.app.NewControlCenter',
      });

      expect(uuid).toBeTruthy();
      expect(target.productType).toContain('app-extension');
    });
  });

  it('returns a uuid that resolves back to the same target', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      const { uuid } = addWidgetExtensionTarget(project, {
        name: 'NewControlCenter',
        bundleId: 'com.acme.app.NewControlCenter',
      });

      const summary = summarize(project);
      const found = summary.targets.find((t) => t.uuid === uuid);
      expect(found).toBeDefined();
      expect(found!.name).toBe('NewControlCenter');
    });
  });

  it('persists when written back to disk', () => {
    withTempProject((pbxprojPath) => {
      const project = loadProject(pbxprojPath);
      addWidgetExtensionTarget(project, {
        name: 'NewControlCenter',
        bundleId: 'com.acme.app.NewControlCenter',
      });
      fs.writeFileSync(pbxprojPath, project.writeSync());

      // 다시 읽어서 확인
      const reloaded = loadProject(pbxprojPath);
      const summary = summarize(reloaded);
      const widget = summary.targets.find((t) =>
        t.productType.includes('app-extension') && t.name === 'NewControlCenter'
      );
      expect(widget).toBeDefined();
    });
  });
});
