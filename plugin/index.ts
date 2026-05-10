import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigPlugin } from '@expo/config-plugins';
import { withDangerousMod, withXcodeProject } from '@expo/config-plugins';

import { parseControlsFile } from '../core/parseControls';
import { generateNativeFiles } from '../core/generate';
import { wireXcodeProject } from '../core/xcode/wire';
import type { ParsedControl } from '../core/types';
import type { NativeFile } from '../core/generate';

export interface ControlCenterPluginProps {
  /** controls.ts 파일 경로 (사용자 프로젝트 루트 기준) */
  controls: string;
  /** 딥링크용 URL scheme. 예: "myapp" */
  urlScheme: string;
  /** App Group ID. 기본 "group.{bundleId}.controls" */
  appGroupId?: string;
  /** Widget Extension 폴더/타겟 이름. 기본 "ControlCenterExtension" */
  extensionName?: string;
  /** 위젯 deployment target. 기본 "18.0" */
  deploymentTarget?: string;
  /** Swift 버전. 기본 "5.0" */
  swiftVersion?: string;
}

const withControlCenter: ConfigPlugin<ControlCenterPluginProps> = (config, props) => {
  validateProps(props);

  const extensionName = props.extensionName ?? 'ControlCenterExtension';

  // 두 mod가 공유할 상태. 첫 mod에서 채우고, 두 번째 mod에서 사용.
  let cachedFiles: NativeFile[] | null = null;
  let cachedControls: ParsedControl[] | null = null;

  // Step 1: 사용자 controls.ts 읽고 → 8개 파일을 ios/ 에 쓴다.
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const bundleId = cfg.ios?.bundleIdentifier;
      if (!bundleId) {
        throw new Error(
          '[react-native-control-center] ios.bundleIdentifier must be set in app.json.'
        );
      }

      const controlsAbs = path.resolve(projectRoot, props.controls);
      if (!fs.existsSync(controlsAbs)) {
        throw new Error(
          `[react-native-control-center] controls file not found: ${controlsAbs}`
        );
      }

      cachedControls = parseControlsFile(controlsAbs);
      cachedFiles = generateNativeFiles({
        controls: cachedControls,
        bundleId,
        urlScheme: props.urlScheme,
        ...(props.appGroupId !== undefined && { appGroupId: props.appGroupId }),
        extensionName,
      });

      for (const file of cachedFiles) {
        const fullPath = path.join(platformRoot, file.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.content);
      }

      return cfg;
    },
  ]);

  // Step 2: pbxproj 변형 — wireXcodeProject 호출.
  config = withXcodeProject(config, (cfg) => {
    if (!cachedFiles) {
      // dangerous mod가 먼저 돌아야 함. Expo의 mod 순서가 어긋나면 발생 가능.
      throw new Error(
        '[react-native-control-center] internal: file generation must run before pbxproj wiring.'
      );
    }
    const bundleId = cfg.ios?.bundleIdentifier;
    if (!bundleId) {
      throw new Error(
        '[react-native-control-center] ios.bundleIdentifier missing during pbxproj wiring.'
      );
    }

    const sharedFiles = deriveSharedFiles(cachedFiles, extensionName);
    const widgetBundleId = `${bundleId}.${extensionName.toLowerCase()}`;

    wireXcodeProject(cfg.modResults, {
      mainAppBundleId: bundleId,
      widgetTargetName: extensionName,
      widgetBundleId,
      sharedFiles,
      ...(props.deploymentTarget !== undefined && {
        deploymentTarget: props.deploymentTarget,
      }),
      ...(props.swiftVersion !== undefined && { swiftVersion: props.swiftVersion }),
    });
    return cfg;
  });

  return config;
};

/**
 * generateNativeFiles 출력에서 'shared' 라벨 파일들을 추출해
 * extensionName/ 접두 부분을 제거한 상대 경로 리스트로 반환.
 *
 * 예: "ControlCenterExtension/Intents/X.swift" → "Intents/X.swift"
 */
function deriveSharedFiles(files: NativeFile[], extensionName: string): string[] {
  const prefix = `${extensionName}/`;
  return files
    .filter((f) => f.target === 'shared')
    .map((f) => (f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path));
}

function validateProps(props: ControlCenterPluginProps): void {
  if (!props || typeof props !== 'object') {
    throw new Error(
      '[react-native-control-center] Plugin props are required. ' +
        'Add ["react-native-control-center", { controls: "./src/controls.ts", urlScheme: "..." }] to app.json plugins.'
    );
  }
  if (!props.controls || typeof props.controls !== 'string') {
    throw new Error(
      '[react-native-control-center] `controls` prop must be a path to your controls.ts file.'
    );
  }
  if (!props.urlScheme || typeof props.urlScheme !== 'string') {
    throw new Error(
      '[react-native-control-center] `urlScheme` prop is required (e.g. "myapp").'
    );
  }
}

/**
 * 단위 테스트용 — mod 안에서 일어나는 핵심 로직(controls 파싱 + 파일 생성 + 디스크 쓰기)을
 * Expo의 mod 시스템 없이 직접 호출 가능하게 추출.
 */
export function generateAndWriteFiles(opts: {
  projectRoot: string;
  platformRoot: string;
  bundleId: string;
  controls: string; // relative or absolute
  urlScheme: string;
  appGroupId?: string;
  extensionName?: string;
}): { files: NativeFile[]; controls: ParsedControl[] } {
  const extensionName = opts.extensionName ?? 'ControlCenterExtension';
  const controlsAbs = path.resolve(opts.projectRoot, opts.controls);

  if (!fs.existsSync(controlsAbs)) {
    throw new Error(
      `[react-native-control-center] controls file not found: ${controlsAbs}`
    );
  }

  const controls = parseControlsFile(controlsAbs);
  const files = generateNativeFiles({
    controls,
    bundleId: opts.bundleId,
    urlScheme: opts.urlScheme,
    ...(opts.appGroupId !== undefined && { appGroupId: opts.appGroupId }),
    extensionName,
  });

  for (const file of files) {
    const fullPath = path.join(opts.platformRoot, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
  }

  return { files, controls };
}

export default withControlCenter;
export { deriveSharedFiles };
