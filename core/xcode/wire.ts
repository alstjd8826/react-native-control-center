import type { PBXProject, PBXNativeTarget } from 'xcode';
import './types';
import { addWidgetExtensionTarget } from './addTarget';
import { linkFrameworks } from './linkFrameworks';
import { addSyncedSourceFolder } from './addSyncedFolder';
import { setTargetBuildSettings } from './buildSettings';
import { verifyEmbedded } from './embed';

export interface WireOptions {
  /** 메인 앱 bundle id. 예: "com.acme.app" */
  mainAppBundleId: string;
  /** 위젯 타겟 이름 + 폴더 이름. 예: "ControlCenterExtension" */
  widgetTargetName: string;
  /** 위젯 bundle id. 관례상 메인 앱 id의 하위. 예: "com.acme.app.controlcenter" */
  widgetBundleId: string;
  /** 메인 앱과 공유할 폴더 내 파일 (폴더 기준 상대 경로) */
  sharedFiles: string[];
  /** 위젯 deployment target. 기본 18.0 */
  deploymentTarget?: string;
  /** Swift 버전. 기본 5.0 */
  swiftVersion?: string;
}

export interface WireResult {
  widgetTargetUuid: string;
  mainAppTargetUuid: string;
}

/**
 * Day 2~6의 모든 부품을 순서대로 호출해 사용자 Xcode 프로젝트에 위젯 익스텐션을
 * 완전히 통합한다.
 *
 * 호출자(plugin/ 또는 cli/)는 이 함수 하나만 부르면 됨.
 */
export function wireXcodeProject(project: PBXProject, options: WireOptions): WireResult {
  const deploymentTarget = options.deploymentTarget ?? '18.0';
  const swiftVersion = options.swiftVersion ?? '5.0';

  // 0) 메인 앱 타겟 찾기
  const mainAppTargetUuid = findMainAppTargetUuid(project);
  if (!mainAppTargetUuid) {
    throw new Error('Could not find main application target in the Xcode project.');
  }

  // 1) 위젯 타겟 생성 (자동으로 메인 앱에 CopyFiles 임베드까지 됨)
  const { uuid: widgetTargetUuid } = addWidgetExtensionTarget(project, {
    name: options.widgetTargetName,
    bundleId: options.widgetBundleId,
  });

  // 2) Frameworks 링크
  linkFrameworks(project, widgetTargetUuid, {
    frameworks: ['WidgetKit', 'SwiftUI', 'AppIntents'],
  });
  linkFrameworks(project, mainAppTargetUuid, {
    frameworks: ['AppIntents'],
  });

  // 3) Synced 폴더 + ExceptionSet
  addSyncedSourceFolder(project, {
    widgetTargetUuid,
    mainAppTargetUuid,
    folderName: options.widgetTargetName,
    sharedFiles: options.sharedFiles,
  });

  // 4) 위젯 타겟 build settings
  const widgetEntitlementsPath = `${options.widgetTargetName}/${options.widgetTargetName}.entitlements`;
  const mainEntitlementsPath = `${options.widgetTargetName}/MainApp.entitlements`;

  setTargetBuildSettings(project, widgetTargetUuid, {
    IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
    INFOPLIST_FILE: `${options.widgetTargetName}/Info.plist`,
    CODE_SIGN_ENTITLEMENTS: widgetEntitlementsPath,
    SWIFT_VERSION: swiftVersion,
    PRODUCT_BUNDLE_IDENTIFIER: options.widgetBundleId,
    SKIP_INSTALL: 'NO',
  });

  // 5) 메인 앱 타겟 build settings (entitlement 경로만 더해줌)
  setTargetBuildSettings(project, mainAppTargetUuid, {
    CODE_SIGN_ENTITLEMENTS: mainEntitlementsPath,
  });

  // 6) 임베드 검증
  const embedCheck = verifyEmbedded(project, mainAppTargetUuid, widgetTargetUuid);
  if (!embedCheck.ok) {
    throw new Error(`Widget embedding verification failed: ${embedCheck.reason}`);
  }

  return { widgetTargetUuid, mainAppTargetUuid };
}

function findMainAppTargetUuid(project: PBXProject): string | null {
  const section = project.pbxNativeTargetSection();
  for (const [uuid, value] of Object.entries(section)) {
    if (uuid.endsWith('_comment') || typeof value === 'string') continue;
    const target = value as PBXNativeTarget;
    if (target.isa !== 'PBXNativeTarget') continue;
    const productType = stripQuotes(target.productType);
    if (productType === 'com.apple.product-type.application') {
      return uuid;
    }
  }
  return null;
}

function stripQuotes(value: string | undefined): string {
  if (!value) return '';
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
