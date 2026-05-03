import type { PBXProject, PBXNativeTarget, PBXBuildPhase, PBXBuildFile } from 'xcode';
import './types';

export interface EmbedCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * 위젯이 메인 앱에 정상적으로 임베드되었는지 검증한다.
 *
 * xcode 패키지의 addTarget('app_extension', ...)이 호출되면 메인 앱 타겟에
 * PBXCopyFilesBuildPhase가 자동으로 생성되고 .appex 파일이 거기 등록된다.
 * 이 함수는 그 결과가 실제로 존재하는지 확인하는 안전망 역할.
 *
 * 임베드가 누락된 경우 사용할 수 있는 ensureEmbedded()도 함께 제공.
 */
export function verifyEmbedded(
  project: PBXProject,
  mainAppTargetUuid: string,
  widgetTargetUuid: string
): EmbedCheckResult {
  const objects = project.hash.project.objects;

  // 1) 메인 앱 타겟에 PBXCopyFilesBuildPhase가 있는가?
  const targets = project.pbxNativeTargetSection();
  const mainTarget = targets[mainAppTargetUuid] as PBXNativeTarget | undefined;
  if (!mainTarget || typeof mainTarget === 'string') {
    return { ok: false, reason: `Main app target ${mainAppTargetUuid} not found.` };
  }

  const copyFilesPhases = collectCopyFilesPhases(project, mainTarget);
  if (copyFilesPhases.length === 0) {
    return {
      ok: false,
      reason: 'Main app target has no PBXCopyFilesBuildPhase. Widget cannot be embedded.',
    };
  }

  // 2) 위젯 타겟의 productReference 찾기 (.appex 의 PBXFileReference uuid)
  const widgetTarget = targets[widgetTargetUuid] as PBXNativeTarget | undefined;
  if (!widgetTarget || typeof widgetTarget === 'string') {
    return { ok: false, reason: `Widget target ${widgetTargetUuid} not found.` };
  }
  const productRef = (widgetTarget as Record<string, unknown>).productReference as
    | string
    | undefined;
  if (!productRef) {
    return { ok: false, reason: 'Widget target has no productReference.' };
  }

  // 3) 어느 CopyFiles 페이즈든 그 .appex를 가리키는 BuildFile을 가진 게 있는가?
  const buildFileSection = project.pbxBuildFileSection();
  for (const phase of copyFilesPhases) {
    for (const ref of phase.files) {
      const buildFile = buildFileSection[ref.value] as PBXBuildFile | undefined;
      if (!buildFile || typeof buildFile === 'string') continue;
      if (buildFile.fileRef === productRef) {
        return { ok: true };
      }
    }
  }

  return {
    ok: false,
    reason: 'No PBXCopyFilesBuildPhase entry references the widget productReference.',
  };
}

function collectCopyFilesPhases(
  project: PBXProject,
  target: PBXNativeTarget
): PBXBuildPhase[] {
  const objects = project.hash.project.objects;
  const result: PBXBuildPhase[] = [];
  for (const ref of target.buildPhases ?? []) {
    const phase = findObjectAcrossSections(objects, ref.value) as
      | PBXBuildPhase
      | undefined;
    if (phase && phase.isa === 'PBXCopyFilesBuildPhase') {
      result.push(phase);
    }
  }
  return result;
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
