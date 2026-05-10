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
  /**
   * 위젯 타겟의 Sources/Resources 자동 멤버십에서 제외할 파일들.
   * Info.plist, *.entitlements 같이 build setting으로 따로 참조하는 파일은
   * 자동 컴파일/복사에서 빼야 "Multiple commands produce" 충돌을 피한다.
   */
  excludedFromWidget?: string[];
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

  // 0) ExceptionSet들 만들기. 다음 두 종류:
  //    - sharedFiles → 메인 앱이 추가 멤버로 가져갈 파일들
  //    - excludedFromWidget → 위젯 자기 자신의 자동 멤버십에서 빼는 파일들 (Info.plist 등)
  const exceptionRefs: Array<{ value: string; comment?: string }> = [];
  const exceptionSection =
    (objects['PBXFileSystemSynchronizedBuildFileExceptionSet'] ??= {});

  if (options.sharedFiles.length > 0) {
    const uuid = generateUuid(project);
    const comment = `Exceptions for "${options.folderName}" folder in main app target`;
    exceptionSection[uuid] = {
      isa: 'PBXFileSystemSynchronizedBuildFileExceptionSet',
      membershipExceptions: options.sharedFiles,
      target: options.mainAppTargetUuid,
    };
    exceptionSection[`${uuid}_comment`] = comment;
    exceptionRefs.push({ value: uuid, comment });
  }

  if (options.excludedFromWidget && options.excludedFromWidget.length > 0) {
    const uuid = generateUuid(project);
    const comment = `Exceptions for "${options.folderName}" folder in widget target`;
    exceptionSection[uuid] = {
      isa: 'PBXFileSystemSynchronizedBuildFileExceptionSet',
      membershipExceptions: options.excludedFromWidget,
      target: options.widgetTargetUuid,
    };
    exceptionSection[`${uuid}_comment`] = comment;
    exceptionRefs.push({ value: uuid, comment });
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
  if (exceptionRefs.length > 0) {
    groupObject.exceptions = exceptionRefs;
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
