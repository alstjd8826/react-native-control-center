import * as fs from "node:fs";
import * as path from "node:path";

import * as plist from "plist";

import { parseControlsFile } from "../core/parseControls";
import { warnUnknownSymbols } from "../core/validateSymbols";
import {
  generateNativeFiles,
  collectStateKeys,
  defaultAppGroupId,
} from "../core/generate";
import { generateAndroidFiles } from "../core/generate/android";
import { wireXcodeProject } from "../core/xcode/wire";
import { loadProject } from "../core/xcode/inspect";
import { deriveSharedFiles, injectManifestServices } from "../plugin";
import type { NativeFile } from "../core/generate";

export interface RunGenerateOptions {
  /** 사용자 RN 프로젝트 루트. 기본 process.cwd() */
  projectRoot?: string;
  /** package.json에 설정 없을 때 콘솔에 출력할 안내 메시지를 끌지 여부 (테스트용) */
  silent?: boolean;
}

export interface RunGenerateResult {
  filesWritten: string[];
  pbxprojPath: string;
  widgetTargetUuid: string;
  mainAppTargetUuid: string;
}

interface PackageJsonConfig {
  controls: string;
  urlScheme: string;
  appGroupId?: string;
  extensionName?: string;
  deploymentTarget?: string;
  swiftVersion?: string;
  bundleId?: string; // RN CLI 환경: 추론 어려우니 명시 가능
  androidPackage?: string; // Android applicationId. 미지정 시 build.gradle에서 추론
}

/**
 * RN CLI(bare) 프로젝트에서 Expo 플러그인이 하던 일을 한 번에 실행.
 *
 * 1) projectRoot/package.json의 "rnControlCenter" 설정 읽기
 * 2) ios/<App>.xcodeproj/project.pbxproj 찾기
 * 3) controls.ts 파싱 → 파일 생성 → 디스크 쓰기
 * 4) wireXcodeProject() 호출
 * 5) project.writeSync()로 변경 저장
 */
export function runGenerate(opts: RunGenerateOptions = {}): RunGenerateResult {
  const projectRoot = opts.projectRoot ?? process.cwd();

  const config = readPluginConfig(projectRoot);
  const iosRoot = path.join(projectRoot, "ios");

  if (!fs.existsSync(iosRoot)) {
    throw new Error(
      `[rn-control-center] ios/ folder not found at ${iosRoot}. Are you in an RN project root?`,
    );
  }

  const pbxprojPath = findPbxprojPath(iosRoot);
  const bundleId = config.bundleId ?? readBundleIdFromInfoPlist(iosRoot);

  const extensionName = config.extensionName ?? "ControlCenterExtension";

  // 1) Parse controls
  const controlsAbs = path.resolve(projectRoot, config.controls);
  if (!fs.existsSync(controlsAbs)) {
    throw new Error(
      `[rn-control-center] controls file not found: ${controlsAbs}`,
    );
  }
  const controls = parseControlsFile(controlsAbs);

  // 1b) 심볼 오타 경고 (빌드는 막지 않음)
  warnUnknownSymbols(controls);

  // 2) Generate files
  const files: NativeFile[] = generateNativeFiles({
    controls,
    bundleId,
    urlScheme: config.urlScheme,
    ...(config.appGroupId !== undefined && { appGroupId: config.appGroupId }),
    extensionName,
  });

  const filesWritten: string[] = [];
  for (const file of files) {
    const fullPath = path.join(iosRoot, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
    filesWritten.push(fullPath);
  }

  // 2b) 메인 앱 Info.plist에 런타임 스토어용 키 주입 (Expo 플러그인과 동일).
  //     Native Module(Pod)이 App Group ID / stateKeys를 여기서 읽는다.
  const appGroupId = config.appGroupId ?? defaultAppGroupId(bundleId);
  injectMainAppInfoPlistKeys(iosRoot, pbxprojPath, {
    RNControlCenterAppGroup: appGroupId,
    RNControlCenterStateKeys: collectStateKeys(controls),
  });

  // 3) Wire pbxproj
  const project = loadProject(pbxprojPath);
  const sharedFiles = deriveSharedFiles(files, extensionName);
  const widgetBundleId = `${bundleId}.${extensionName.toLowerCase()}`;

  const { widgetTargetUuid, mainAppTargetUuid } = wireXcodeProject(project, {
    mainAppBundleId: bundleId,
    widgetTargetName: extensionName,
    widgetBundleId,
    sharedFiles,
    ...(config.deploymentTarget !== undefined && {
      deploymentTarget: config.deploymentTarget,
    }),
    ...(config.swiftVersion !== undefined && {
      swiftVersion: config.swiftVersion,
    }),
  });

  fs.writeFileSync(pbxprojPath, project.writeSync());

  // 4) Android (선택) — android/ 가 있을 때만 타일 생성. 없으면 건너뜀(iOS 전용 프로젝트).
  const androidRoot = path.join(projectRoot, "android");
  if (fs.existsSync(androidRoot)) {
    const androidWritten = generateAndroidTiles({
      androidRoot,
      controls,
      urlScheme: config.urlScheme,
      ...(config.androidPackage !== undefined && {
        androidPackage: config.androidPackage,
      }),
    });
    filesWritten.push(...androidWritten);
  }

  return { filesWritten, pbxprojPath, widgetTargetUuid, mainAppTargetUuid };
}

function readPluginConfig(projectRoot: string): PackageJsonConfig {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `[rn-control-center] package.json not found at ${pkgPath}. Run from RN project root.`,
    );
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const cfg = pkg["rnControlCenter"] as Partial<PackageJsonConfig> | undefined;
  if (!cfg || typeof cfg !== "object") {
    throw new Error(
      '[rn-control-center] No "rnControlCenter" key in package.json. ' +
        'Add { "controls": "./src/controls.ts", "urlScheme": "myapp" }.',
    );
  }
  if (!cfg.controls || typeof cfg.controls !== "string") {
    throw new Error(
      "[rn-control-center] package.json rnControlCenter.controls is required.",
    );
  }
  if (!cfg.urlScheme || typeof cfg.urlScheme !== "string") {
    throw new Error(
      "[rn-control-center] package.json rnControlCenter.urlScheme is required.",
    );
  }
  return cfg as PackageJsonConfig;
}

function findPbxprojPath(iosRoot: string): string {
  const entries = fs.readdirSync(iosRoot);
  const xcodeproj = entries.find((e) => e.endsWith(".xcodeproj"));
  if (!xcodeproj) {
    throw new Error(
      `[rn-control-center] No *.xcodeproj found inside ${iosRoot}.`,
    );
  }
  return path.join(iosRoot, xcodeproj, "project.pbxproj");
}

/**
 * 메인 앱 타겟의 Info.plist에 키를 병합 저장.
 * bare RN 레이아웃은 ios/<AppName>/Info.plist (AppName = .xcodeproj 이름).
 * Info.plist를 못 찾으면 조용히 건너뛴다 (라이브러리가 빌드를 막지 않도록).
 */
function injectMainAppInfoPlistKeys(
  iosRoot: string,
  pbxprojPath: string,
  keys: Record<string, unknown>,
): void {
  // pbxprojPath = ios/<App>.xcodeproj/project.pbxproj → <App> 추출
  const appName = path
    .basename(path.dirname(pbxprojPath))
    .replace(/\.xcodeproj$/, "");
  const plistPath = path.join(iosRoot, appName, "Info.plist");
  if (!fs.existsSync(plistPath)) return;

  const parsed = plist.parse(
    fs.readFileSync(plistPath, "utf-8"),
  ) as plist.PlistObject;
  const merged = { ...parsed, ...keys } as plist.PlistObject;
  fs.writeFileSync(plistPath, plist.build(merged));
}

interface GenerateAndroidTilesOptions {
  androidRoot: string; // <project>/android
  controls: import("../core/types").ParsedControl[];
  urlScheme: string;
  androidPackage?: string;
}

/**
 * Android Quick Settings 타일 생성 (Expo 플러그인의 android 로직을 CLI로 미러링).
 * @returns 쓴 파일들의 절대 경로 목록
 *
 * 흐름 (플러그인 plugin/index.ts 의 android mod 와 동일):
 *   1) applicationId 결정 → generateAndroidFiles() 호출
 *   2) TileService.kt 들을 android/app/src/main/java/ 아래에 쓰기
 *   3) AndroidManifest.xml 에 <service> 주입 (injectManifestServices 재사용)
 *   4) 딥링크 scheme 등록 (ensureManifestScheme)
 */
function generateAndroidTiles(opts: GenerateAndroidTilesOptions): string[] {
  const written: string[] = [];
  const appRoot = path.join(opts.androidRoot, "app", "src", "main");
  const manifestPath = path.join(appRoot, "AndroidManifest.xml");

  // applicationId 결정: 설정값 우선, 없으면 build.gradle에서 추론.
  const applicationId =
    opts.androidPackage ?? readAndroidApplicationId(opts.androidRoot);

  const { files, manifestServices } = generateAndroidFiles({
    controls: opts.controls,
    bundleId: applicationId,
    urlScheme: opts.urlScheme,
  });

  const javaRoot = path.join(appRoot, "java");
  for (const file of files) {
    const fullPath = path.join(javaRoot, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
    written.push(fullPath);
  }

  if (manifestServices.trim() && fs.existsSync(manifestPath)) {
    const text = fs.readFileSync(manifestPath, "utf-8");
    fs.writeFileSync(
      manifestPath,
      injectManifestServices(text, manifestServices),
    );
  }

  // 딥링크 scheme 등록 (Android-native 처리 — 이미 구현됨)
  if (fs.existsSync(manifestPath)) {
    const text = fs.readFileSync(manifestPath, "utf-8");
    fs.writeFileSync(manifestPath, ensureManifestScheme(text, opts.urlScheme));
  }

  return written;
}

/**
 * bare RN 프로젝트의 android/app/build.gradle 에서 applicationId 추출.
 * 예: `applicationId "com.acme.app"` → "com.acme.app"
 */
function readAndroidApplicationId(androidRoot: string): string {
  const gradlePath = path.join(androidRoot, "app", "build.gradle");
  if (fs.existsSync(gradlePath)) {
    const gradle = fs.readFileSync(gradlePath, "utf-8");
    const m = gradle.match(/applicationId\s+["']([^"']+)["']/);
    if (m && m[1]) return m[1];
    // 신형 gradle 은 namespace 로 대체되기도 함
    const ns = gradle.match(/namespace\s+["']([^"']+)["']/);
    if (ns && ns[1]) return ns[1];
  }
  throw new Error(
    "[rn-control-center] Could not infer Android applicationId from android/app/build.gradle. " +
      'Set "androidPackage" explicitly in package.json rnControlCenter section.',
  );
}

/**
 * AndroidManifest.xml 원문(raw XML)에 딥링크 scheme intent-filter를 보장한다.
 * Expo 플러그인은 파싱된 객체에 AndroidConfig.Scheme 를 쓰지만, CLI는 원문 문자열을
 * 다루므로 직접 처리한다. 이미 같은 scheme 이 있으면 그대로 둔다(멱등).
 *
 * launcher(MAIN/LAUNCHER) intent-filter를 가진 <activity> 안에 VIEW+BROWSABLE 필터를 추가.
 */
function ensureManifestScheme(manifest: string, scheme: string): string {
  if (manifest.includes(`android:scheme="${scheme}"`)) return manifest; // 이미 있음

  const filter =
    `\n            <intent-filter>` +
    `\n                <action android:name="android.intent.action.VIEW" />` +
    `\n                <category android:name="android.intent.category.DEFAULT" />` +
    `\n                <category android:name="android.intent.category.BROWSABLE" />` +
    `\n                <data android:scheme="${scheme}" />` +
    `\n            </intent-filter>`;

  // LAUNCHER 필터가 든 activity의 </activity> 앞에 삽입.
  const launcherActivity =
    /(<activity[^>]*>[\s\S]*?android\.intent\.category\.LAUNCHER[\s\S]*?)(<\/activity>)/;
  if (launcherActivity.test(manifest)) {
    return manifest.replace(launcherActivity, `$1${filter}\n        $2`);
  }
  return manifest; // launcher activity를 못 찾으면 건드리지 않음
}

function readBundleIdFromInfoPlist(iosRoot: string): string {
  // RN CLI 프로젝트엔 ios/<AppName>/Info.plist에 CFBundleIdentifier가 적혀있다.
  // 보통 $(PRODUCT_BUNDLE_IDENTIFIER) 변수 형태인 경우가 많아 fallback 필요.
  const subdirs = fs
    .readdirSync(iosRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  for (const dir of subdirs) {
    const plistPath = path.join(iosRoot, dir, "Info.plist");
    if (!fs.existsSync(plistPath)) continue;
    const content = fs.readFileSync(plistPath, "utf-8");
    const match = content.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
    );
    if (match && match[1] && !match[1].includes("$(")) {
      return match[1];
    }
  }
  throw new Error(
    "[rn-control-center] Could not infer bundleId from any Info.plist. " +
      'Set "bundleId" explicitly in package.json rnControlCenter section.',
  );
}
