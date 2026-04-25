import { generateSwiftFiles, defaultAppGroupId, type GeneratedFile } from './swift';
import { generateExtensionInfoPlist } from './plist';
import { generateAppGroupEntitlements } from './entitlements';
import type { ParsedControl } from '../types';

export interface GenerateNativeOptions {
  controls: ParsedControl[];
  /** 메인 앱 bundle ID (예: "com.acme.app"). */
  bundleId: string;
  /** 딥링크 URL scheme (예: "acme"). */
  urlScheme: string;
  /** App Group 식별자. 미지정 시 `group.{bundleId}.controls`. */
  appGroupId?: string;
  /** Widget Extension 디렉터리 이름. 기본 "ControlCenterExtension". */
  extensionName?: string;
  /** Bundle struct 이름. 기본 "ControlCenterBundle". */
  bundleStructName?: string;
}

export type FileTarget = 'extension' | 'app' | 'shared';

export interface NativeFile {
  /** 출력 상대 경로 (예: "ControlCenterExtension/Controls/QuickNoteControl.swift"). */
  path: string;
  content: string;
  /** 어느 타겟에 멤버십을 부여해야 하는지 — Week 3 pbxproj 작업에서 사용. */
  target: FileTarget;
}

/**
 * 라이브러리의 단일 코드 생성 진입점.
 * Swift 파일 + Info.plist + entitlement 두 파일을 한꺼번에 만들어 반환.
 */
export function generateNativeFiles(opts: GenerateNativeOptions): NativeFile[] {
  const extName = opts.extensionName ?? 'ControlCenterExtension';
  const appGroupId = opts.appGroupId ?? defaultAppGroupId(opts.bundleId);

  const files: NativeFile[] = [];

  // 1) Swift sources
  const swiftFiles: GeneratedFile[] = generateSwiftFiles({
    controls: opts.controls,
    bundleId: opts.bundleId,
    urlScheme: opts.urlScheme,
    appGroupId,
    bundleStructName: opts.bundleStructName,
  });

  for (const f of swiftFiles) {
    // ControlStore + Intents는 두 타겟이 함께 가져야 함 (양방향 통신).
    // ControlBundle, Controls는 위젯 익스텐션 전용.
    const target: FileTarget = isSharedSwiftFile(f.path) ? 'shared' : 'extension';
    files.push({
      path: `${extName}/${f.path}`,
      content: f.content,
      target,
    });
  }

  // 2) Widget Extension Info.plist
  files.push({
    path: `${extName}/Info.plist`,
    content: generateExtensionInfoPlist({ extensionBundleName: extName }),
    target: 'extension',
  });

  // 3) Entitlements — 두 타겟 동일
  const entitlements = generateAppGroupEntitlements({ appGroupId });
  files.push({
    path: `${extName}/${extName}.entitlements`,
    content: entitlements,
    target: 'extension',
  });
  files.push({
    path: `${extName}/MainApp.entitlements`,
    content: entitlements,
    target: 'app',
  });

  return files;
}

function isSharedSwiftFile(swiftPath: string): boolean {
  return swiftPath === 'ControlStore.swift' || swiftPath.startsWith('Intents/');
}

export { defaultAppGroupId };
export type { GeneratedFile };
