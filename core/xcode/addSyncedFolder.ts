import type { PBXProject, PBXNativeTarget } from 'xcode';
import './types';

export interface AddSyncedFolderOptions {
  /** 위젯 타겟 uuid — 이 폴더의 1차 멤버 */
  widgetTargetUuid: string;
  /** 메인 앱 타겟 uuid — sharedFiles에 한해 추가 멤버 */
  mainAppTargetUuid: string;
  /** 폴더 이름 (사용자 ios/ 디렉토리 기준 상대 경로) */
  folderName: string;
  /** 메인 앱과 공유할 폴더 내 파일들 (폴더 기준 상대 경로) */
  sharedFiles: string[];
}

/**
 * Xcode 16+의 fileSystemSynchronizedGroups 기반 멤버십 처리.
 *
 * 동작:
 *   1) PBXFileSystemSynchronizedRootGroup을 만들어 폴더와 위젯 타겟을 매핑
 *   2) sharedFiles가 있으면 ExceptionSet을 만들어 메인 앱 타겟에 그 파일들을 추가 멤버십으로 부여
 *
 * xcode npm 패키지(@3.0.1)는 이 객체들을 모르므로 pbxproj 섹션을 직접 변형한다.
 */
export function addSyncedSourceFolder(
  project: PBXProject,
  options: AddSyncedFolderOptions
): void {
  const objects = project.hash.project.objects;

  // 0) sharedFiles가 있으면 ExceptionSet 먼저 만든다
  let exceptionUuid: string | null = null;
  if (options.sharedFiles.length > 0) {
    exceptionUuid = generateUuid(project);
    const exceptionSection =
      (objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ??= {});
    const comment = `Exceptions for "${options.folderName}" folder in main app target`;

    exceptionSection[exceptionUuid] = {
      isa: 'PBXFileSystemSynchronizedBuildFileExceptionSet',
      membershipExceptions: options.sharedFiles,
      target: options.mainAppTargetUuid,
    };
    exceptionSection[`${exceptionUuid}_comment`] = comment;
  }

  // 1) SynchronizedRootGroup 객체 생성
  const groupUuid = generateUuid(project);
  const groupSection = (objects['PBXFileSystemSynchronizedRootGroup'] ??= {});
  const groupComment = options.folderName;

  const groupObject: Record<string, unknown> = {
    isa: 'PBXFileSystemSynchronizedRootGroup',
    path: options.folderName,
    sourceTree: '"<group>"',
  };
  if (exceptionUuid) {
    groupObject.exceptions = [
      { value: exceptionUuid, comment: `Exceptions for "${options.folderName}" folder in main app target` },
    ];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (groupSection as any)[groupUuid] = groupObject;
  groupSection[`${groupUuid}_comment`] = groupComment;

  // 2) 위젯 타겟의 fileSystemSynchronizedGroups에 등록
  const targetSection = project.pbxNativeTargetSection();
  const widgetTarget = targetSection[options.widgetTargetUuid] as PBXNativeTarget | undefined;
  if (!widgetTarget || typeof widgetTarget === 'string') {
    throw new Error(`Widget target ${options.widgetTargetUuid} not found.`);
  }
  const synced = ((widgetTarget as Record<string, unknown>)
    .fileSystemSynchronizedGroups as Array<{ value: string; comment?: string }> | undefined) ?? [];
  synced.push({ value: groupUuid, comment: groupComment });
  (widgetTarget as Record<string, unknown>).fileSystemSynchronizedGroups = synced;
}

function generateUuid(project: PBXProject): string {
  return (project as unknown as { generateUuid: () => string }).generateUuid();
}
