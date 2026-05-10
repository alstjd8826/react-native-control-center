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
  //    - sharedFiles는 메인 앱이 추가로 가져가야 하므로 mainAppTargetUuid 쪽 예외
  //    - Info.plist와 entitlements는 위젯 build settings로 참조되므로 위젯의 자동
  //      멤버십에서는 빼야 "Multiple commands produce" 충돌이 안 남
  const widgetExclusions = [
    'Info.plist',
    `${options.widgetTargetName}.entitlements`,
    'MainApp.entitlements',
  ];
  addSyncedSourceFolder(project, {
    widgetTargetUuid,
    mainAppTargetUuid,
    folderName: options.widgetTargetName,
    sharedFiles: options.sharedFiles,
    excludedFromWidget: widgetExclusions,
  });

  // 4) 위젯 타겟 build settings
  const widgetEntitlementsPath = `${options.widgetTargetName}/${options.widgetTargetName}.entitlements`;
  const mainEntitlementsPath = `${options.widgetTargetName}/MainApp.entitlements`;

  setTargetBuildSettings(project, widgetTargetUuid, {
    IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
    INFOPLIST_FILE: `${options.widgetTargetName}/Info.plist`,
    // 우리가 직접 Info.plist를 만들기 때문에 Xcode 자동 생성을 끔.
    // 안 끄면 "Multiple commands produce Info.plist" 빌드 충돌 발생.
    GENERATE_INFOPLIST_FILE: 'NO',
    CODE_SIGN_ENTITLEMENTS: widgetEntitlementsPath,
    SWIFT_VERSION: swiftVersion,
    PRODUCT_BUNDLE_IDENTIFIER: options.widgetBundleId,
    SKIP_INSTALL: 'NO',
  });

  // 5) 메인 앱 타겟 build settings.
  //    - entitlement 경로 (App Group 공유)
  //    - 공유되는 Intent 파일이 LocalizedStringResource 등 iOS 16+ API를 쓰므로
  //      배포 타겟이 16.0보다 낮으면 16.0으로 올림 (이미 16+면 사용자 값 유지).
  const mainAppSettings: Record<string, string> = {
    CODE_SIGN_ENTITLEMENTS: mainEntitlementsPath,
  };
  const currentMainTarget = readDeploymentTarget(project, mainAppTargetUuid);
  if (currentMainTarget === null || compareVersion(currentMainTarget, '16.0') < 0) {
    mainAppSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
  }
  setTargetBuildSettings(project, mainAppTargetUuid, mainAppSettings);

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

function readDeploymentTarget(
  project: PBXProject,
  targetUuid: string
): string | null {
  const objects = project.hash.project.objects;
  const target = project.pbxNativeTargetSection()[targetUuid] as
    | Record<string, unknown>
    | undefined;
  if (!target) return null;
  const configListUuid = target.buildConfigurationList as string | undefined;
  if (!configListUuid) return null;
  const configList = objects['XCConfigurationList']?.[configListUuid] as
    | Record<string, unknown>
    | undefined;
  if (!configList) return null;
  const buildConfigs =
    (configList.buildConfigurations as Array<{ value: string }>) ?? [];
  for (const ref of buildConfigs) {
    const config = objects['XCBuildConfiguration']?.[ref.value] as
      | Record<string, unknown>
      | undefined;
    if (!config) continue;
    const settings = config.buildSettings as Record<string, string> | undefined;
    const v = settings?.IPHONEOS_DEPLOYMENT_TARGET;
    if (v) return stripQuotes(v);
  }
  return null;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}
