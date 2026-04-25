import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadProject, summarize } from '../core/xcode/inspect';

// Phase 2의 골든 레퍼런스 — 실제로 동작하는 Control Widget 프로젝트
const PHASE2_PBXPROJ = path.join(
  __dirname,
  '..',
  '..',
  'QuickNote',
  'QuickNote.xcodeproj',
  'project.pbxproj'
);

describe('inspect Phase 2 reference project', () => {
  // Phase 2 레포가 있을 때만 동작 (CI에서는 skip)
  const exists = fs.existsSync(PHASE2_PBXPROJ);

  (exists ? describe : describe.skip)('summary', () => {
    it('parses and summarizes the QuickNote project', () => {
      const project = loadProject(PHASE2_PBXPROJ);
      const summary = summarize(project);

      // 메인 앱 + Widget Extension 두 타겟이 있어야 함
      expect(summary.targets.length).toBeGreaterThanOrEqual(2);

      const main = summary.targets.find((t) => t.productType.includes('application'));
      const widget = summary.targets.find((t) =>
        t.productType.includes('app-extension')
      );

      expect(main).toBeDefined();
      expect(widget).toBeDefined();
      expect(widget!.name).toMatch(/Widget|Control|Extension/i);
    });

    it('main app and widget have separate build phases', () => {
      const project = loadProject(PHASE2_PBXPROJ);
      const summary = summarize(project);

      for (const target of summary.targets) {
        // Sources, Frameworks, Resources 정도는 기본
        const isaList = target.buildPhases.map((p) => p.isa);
        expect(isaList).toContain('PBXSourcesBuildPhase');
        expect(isaList).toContain('PBXFrameworksBuildPhase');
      }
    });

    it('main app has a CopyFiles phase that embeds the widget', () => {
      const project = loadProject(PHASE2_PBXPROJ);
      const summary = summarize(project);

      const main = summary.targets.find((t) => t.productType.includes('application'))!;
      const copyPhases = main.buildPhases.filter(
        (p) => p.isa === 'PBXCopyFilesBuildPhase'
      );

      // 위젯 익스텐션을 PlugIns 폴더로 복사하는 phase가 있어야 함
      expect(copyPhases.length).toBeGreaterThanOrEqual(1);
    });
  });

  if (!exists) {
    it.skip('Phase 2 reference not present — skipping inspect tests', () => {});
  }
});
