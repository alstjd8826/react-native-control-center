import xcode, { type PBXProject, type PBXNativeTarget } from 'xcode';
import './types'; // ambient module declaration

/**
 * 진단/디버그 전용 — 기존 pbxproj를 열어 구조를 요약.
 * Day 1에서 실제 동작하는 Xcode 프로젝트가 어떻게 생겼는지 파악하는 데 사용.
 */

export interface ProjectSummary {
  filepath: string;
  rootObjectUuid: string;
  targets: TargetSummary[];
  fileReferenceCount: number;
  buildFileCount: number;
  groupCount: number;
}

export interface TargetSummary {
  uuid: string;
  name: string;
  productType: string;
  productName: string;
  buildPhases: BuildPhaseSummary[];
  dependencyCount: number;
}

export interface BuildPhaseSummary {
  uuid: string;
  isa: string;
  fileCount: number;
}

export function loadProject(filepath: string): PBXProject {
  const project = xcode.project(filepath);
  project.parseSync();
  return project;
}

export function summarize(project: PBXProject): ProjectSummary {
  const root = project.getFirstProject();
  const targets = enumerateTargets(project);

  return {
    filepath: project.filepath,
    rootObjectUuid: root.uuid,
    targets,
    fileReferenceCount: countSection(project.pbxFileReferenceSection()),
    buildFileCount: countSection(project.pbxBuildFileSection()),
    groupCount: countSection(project.hash.project.objects['PBXGroup'] ?? {}),
  };
}

function enumerateTargets(project: PBXProject): TargetSummary[] {
  const section = project.pbxNativeTargetSection();
  const summaries: TargetSummary[] = [];

  for (const [uuid, value] of Object.entries(section)) {
    // _comment 키는 건너뜀
    if (uuid.endsWith('_comment') || typeof value === 'string') continue;
    const target = value as PBXNativeTarget;
    if (target.isa !== 'PBXNativeTarget') continue;

    summaries.push({
      uuid,
      name: target.name,
      productName: target.productName,
      productType: target.productType,
      dependencyCount: target.dependencies?.length ?? 0,
      buildPhases: summarizeBuildPhases(project, target),
    });
  }

  return summaries;
}

function summarizeBuildPhases(
  project: PBXProject,
  target: PBXNativeTarget
): BuildPhaseSummary[] {
  const summaries: BuildPhaseSummary[] = [];
  const objects = project.hash.project.objects;

  for (const ref of target.buildPhases) {
    const sectionName = (ref.comment ?? '').replace(/^.*:\s*/, '');
    const phase = findObjectAcrossSections(objects, ref.value);
    if (!phase) continue;
    summaries.push({
      uuid: ref.value,
      isa: (phase as { isa?: string }).isa ?? sectionName,
      fileCount:
        ((phase as { files?: unknown[] }).files ?? []).length,
    });
  }

  return summaries;
}

function findObjectAcrossSections(
  objects: Record<string, Record<string, unknown>>,
  uuid: string
): unknown {
  for (const sectionName of Object.keys(objects)) {
    const section = objects[sectionName];
    if (section && uuid in section) {
      return section[uuid];
    }
  }
  return null;
}

function countSection(section: Record<string, unknown>): number {
  return Object.keys(section).filter((k) => !k.endsWith('_comment')).length;
}
