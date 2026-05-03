import type { PBXProject, PBXBuildFile, PBXFileReference, PBXBuildPhase } from 'xcode';
import './types';

export interface LinkFrameworksOptions {
  /** 기본 SDK framework 이름들. 예: ['WidgetKit', 'SwiftUI', 'AppIntents'] */
  frameworks: string[];
}

/**
 * 지정된 타겟에 iOS SDK framework들을 링크한다.
 *
 * 핵심 매커니즘 (Day 1에 배운 그대로):
 *   - 같은 framework가 이미 프로젝트에 있으면 → PBXFileReference 재사용,
 *     PBXBuildFile만 새로 만들어서 이 타겟의 Frameworks 빌드 페이즈에 추가
 *   - 처음 추가하는 framework면 → xcode 패키지의 addFramework() 호출 (모든 작업
 *     알아서 해줌: FileRef + BuildFile + Frameworks phase 등록)
 *
 * 다른 타겟에도 같은 framework 링크하려면 다른 targetUuid로 다시 호출.
 */
export function linkFrameworks(
  project: PBXProject,
  targetUuid: string,
  options: LinkFrameworksOptions
): void {
  for (const name of options.frameworks) {
    const path = `System/Library/Frameworks/${name}.framework`;
    const existingFileRefUuid = findFileReferenceUuid(project, path);

    if (existingFileRefUuid) {
      // 두 번째 이상의 타겟 — 새 BuildFile만 만들어서 기존 FileRef를 가리키게 함
      addAdditionalBuildFile(project, targetUuid, existingFileRefUuid, `${name}.framework`);
    } else {
      // 처음 추가 — xcode 패키지가 FileRef + BuildFile + Frameworks 모두 처리
      project.addFramework(path, { target: targetUuid });
    }
  }
}

/**
 * PBXFileReference 섹션을 훑어 같은 path 가진 항목 찾기.
 * pbxproj 형식상 path는 "..." 로 감싸진 형태일 수도 있어 둘 다 매칭.
 */
function findFileReferenceUuid(
  project: PBXProject,
  path: string
): string | null {
  const section = project.pbxFileReferenceSection();
  for (const [uuid, value] of Object.entries(section)) {
    if (uuid.endsWith('_comment') || typeof value === 'string') continue;
    const ref = value as PBXFileReference;
    const refPath = ref.path ?? '';
    if (refPath === path || refPath === `"${path}"`) {
      return uuid;
    }
  }
  return null;
}

/**
 * 기존 FileReference를 가리키는 새 PBXBuildFile을 만들고
 * 지정 타겟의 PBXFrameworksBuildPhase에 등록.
 */
function addAdditionalBuildFile(
  project: PBXProject,
  targetUuid: string,
  fileRefUuid: string,
  basename: string
): void {
  const objects = project.hash.project.objects;

  // 1) 새 BuildFile 객체 생성
  const buildFileSection = (objects['PBXBuildFile'] ??= {});
  const buildFileUuid = generateUuid(project);
  const comment = `${basename} in Frameworks`;

  const buildFile: PBXBuildFile = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    // xcode 패키지가 빈 객체 자리에 fileRef_comment 같은 걸 넣어도 OK
  };
  buildFileSection[buildFileUuid] = buildFile;
  buildFileSection[`${buildFileUuid}_comment`] = comment;

  // 2) 타겟의 Frameworks 빌드 페이즈에 추가
  const frameworksPhase: PBXBuildPhase | undefined = project.pbxFrameworksBuildPhaseObj(targetUuid);
  if (!frameworksPhase) {
    throw new Error(`Target ${targetUuid} has no PBXFrameworksBuildPhase`);
  }
  frameworksPhase.files.push({
    value: buildFileUuid,
    comment,
  });
}

/**
 * xcode 패키지의 generateUuid를 노출해 사용.
 */
function generateUuid(project: PBXProject): string {
  // 패키지가 prototype에 generateUuid를 갖고 있음 — 타입 선언엔 빠져있어 캐스트
  return (project as unknown as { generateUuid: () => string }).generateUuid();
}
