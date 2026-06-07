import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigPlugin } from '@expo/config-plugins';
import {
  withDangerousMod,
  withXcodeProject,
  withInfoPlist,
  withAndroidManifest,
  AndroidConfig,
} from '@expo/config-plugins';

import { parseControlsFile } from '../core/parseControls';
import { warnUnknownSymbols } from '../core/validateSymbols';
import { generateNativeFiles, collectStateKeys } from '../core/generate';
import { generateAndroidFiles } from '../core/generate/android';
import { defaultAppGroupId } from '../core/generate/swift';
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
      warnUnknownSymbols(cachedControls); // 심볼 오타 경고 (빌드는 막지 않음)
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

  // Step 1b: 메인 앱 Info.plist에 런타임 스토어가 읽을 키를 주입한다.
  //   Native Module(Pod 모듈)은 생성된 ControlStore(앱 모듈)를 볼 수 없으므로
  //   App Group ID와 stateKey 목록을 Info.plist를 통해 전달한다. 값은 codegen이
  //   쓰는 것과 정확히 동일해야 양쪽이 같은 사물함/큐를 바라본다.
  config = withInfoPlist(config, (cfg) => {
    const bundleId = cfg.ios?.bundleIdentifier;
    if (!bundleId) return cfg; // 상단에서 이미 검증됨 — 방어적 처리

    const appGroupId = props.appGroupId ?? defaultAppGroupId(bundleId);

    let controls = cachedControls;
    if (!controls) {
      // mod 실행 순서가 dangerous mod보다 앞설 경우를 대비해 한 번 더 파싱.
      const controlsAbs = path.resolve(cfg.modRequest.projectRoot, props.controls);
      controls = fs.existsSync(controlsAbs) ? parseControlsFile(controlsAbs) : [];
    }

    cfg.modResults['RNControlCenterAppGroup'] = appGroupId;
    cfg.modResults['RNControlCenterStateKeys'] = collectStateKeys(controls);
    return cfg;
  });

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

  // Step 2b (Android): 딥링크 scheme을 메인 액티비티에 등록.
  //   타일은 ACTION_VIEW(deepLink)로 앱을 여는데, iOS의 openAppWhenRun과 달리
  //   Android는 scheme intent-filter가 없으면 "열 액티비티 없음"으로 실패한다.
  config = withAndroidManifest(config, (cfg) => {
    const scheme = props.urlScheme;
    if (AndroidConfig.Scheme.ensureManifestHasValidIntentFilter(cfg.modResults)) {
      if (!AndroidConfig.Scheme.hasScheme(scheme, cfg.modResults)) {
        cfg.modResults = AndroidConfig.Scheme.appendScheme(scheme, cfg.modResults);
      }
    }
    return cfg;
  });

  // Step 3 (Android): Quick Settings 타일 Kotlin 작성 + AndroidManifest <service> 주입.
  //   타일은 앱과 같은 프로세스라 라이브러리 android 모듈(autolink)이 런타임을 제공하고,
  //   여기선 컨트롤별 TileService.kt 와 manifest 항목만 앱에 써준다.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot; // <proj>/android
      const androidPackage = cfg.android?.package;
      if (!androidPackage) {
        throw new Error(
          '[react-native-control-center] android.package must be set in app.json.'
        );
      }

      const controls =
        cachedControls ??
        parseControlsFile(path.resolve(cfg.modRequest.projectRoot, props.controls));

      const { files, manifestServices } = generateAndroidFiles({
        controls,
        bundleId: androidPackage, // applicationId — .tiles.X 매니페스트 참조가 이걸 기준으로 해석됨
        urlScheme: props.urlScheme,
      });

      // 1) TileService.kt 파일들 쓰기
      const javaRoot = path.join(platformRoot, 'app', 'src', 'main', 'java');
      for (const file of files) {
        const full = path.join(javaRoot, file.path);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, file.content);
      }

      // 2) AndroidManifest.xml <application> 안에 <service> 주입 (재prebuild 멱등)
      const manifestPath = path.join(
        platformRoot,
        'app',
        'src',
        'main',
        'AndroidManifest.xml'
      );
      if (manifestServices.trim() && fs.existsSync(manifestPath)) {
        const text = fs.readFileSync(manifestPath, 'utf-8');
        fs.writeFileSync(manifestPath, injectManifestServices(text, manifestServices));
      }

      return cfg;
    },
  ]);

  return config;
};

const MANIFEST_MARK_START = '<!-- rn-control-center:tiles:start -->';
const MANIFEST_MARK_END = '<!-- rn-control-center:tiles:end -->';

/** AndroidManifest의 </application> 직전에 <service> 블록 삽입 (마커로 멱등 교체). */
export function injectManifestServices(manifest: string, services: string): string {
  const block = `${MANIFEST_MARK_START}\n${services}\n        ${MANIFEST_MARK_END}`;
  const existing = new RegExp(`${MANIFEST_MARK_START}[\\s\\S]*?${MANIFEST_MARK_END}`);
  if (existing.test(manifest)) {
    return manifest.replace(existing, block);
  }
  return manifest.replace(/(\s*)<\/application>/, `\n        ${block}$1</application>`);
}

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
