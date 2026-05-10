import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseControlsFile } from '../core/parseControls';
import { generateNativeFiles } from '../core/generate';
import { wireXcodeProject } from '../core/xcode/wire';
import { loadProject } from '../core/xcode/inspect';
import { deriveSharedFiles } from '../plugin';
import type { NativeFile } from '../core/generate';

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
  const iosRoot = path.join(projectRoot, 'ios');

  if (!fs.existsSync(iosRoot)) {
    throw new Error(
      `[rn-control-center] ios/ folder not found at ${iosRoot}. Are you in an RN project root?`
    );
  }

  const pbxprojPath = findPbxprojPath(iosRoot);
  const bundleId = config.bundleId ?? readBundleIdFromInfoPlist(iosRoot);

  const extensionName = config.extensionName ?? 'ControlCenterExtension';

  // 1) Parse controls
  const controlsAbs = path.resolve(projectRoot, config.controls);
  if (!fs.existsSync(controlsAbs)) {
    throw new Error(`[rn-control-center] controls file not found: ${controlsAbs}`);
  }
  const controls = parseControlsFile(controlsAbs);

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
    ...(config.swiftVersion !== undefined && { swiftVersion: config.swiftVersion }),
  });

  fs.writeFileSync(pbxprojPath, project.writeSync());

  return { filesWritten, pbxprojPath, widgetTargetUuid, mainAppTargetUuid };
}

function readPluginConfig(projectRoot: string): PackageJsonConfig {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `[rn-control-center] package.json not found at ${pkgPath}. Run from RN project root.`
    );
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  const cfg = pkg['rnControlCenter'] as Partial<PackageJsonConfig> | undefined;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(
      '[rn-control-center] No "rnControlCenter" key in package.json. ' +
        'Add { "controls": "./src/controls.ts", "urlScheme": "myapp" }.'
    );
  }
  if (!cfg.controls || typeof cfg.controls !== 'string') {
    throw new Error('[rn-control-center] package.json rnControlCenter.controls is required.');
  }
  if (!cfg.urlScheme || typeof cfg.urlScheme !== 'string') {
    throw new Error('[rn-control-center] package.json rnControlCenter.urlScheme is required.');
  }
  return cfg as PackageJsonConfig;
}

function findPbxprojPath(iosRoot: string): string {
  const entries = fs.readdirSync(iosRoot);
  const xcodeproj = entries.find((e) => e.endsWith('.xcodeproj'));
  if (!xcodeproj) {
    throw new Error(`[rn-control-center] No *.xcodeproj found inside ${iosRoot}.`);
  }
  return path.join(iosRoot, xcodeproj, 'project.pbxproj');
}

function readBundleIdFromInfoPlist(iosRoot: string): string {
  // RN CLI 프로젝트엔 ios/<AppName>/Info.plist에 CFBundleIdentifier가 적혀있다.
  // 보통 $(PRODUCT_BUNDLE_IDENTIFIER) 변수 형태인 경우가 많아 fallback 필요.
  const subdirs = fs
    .readdirSync(iosRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  for (const dir of subdirs) {
    const plistPath = path.join(iosRoot, dir, 'Info.plist');
    if (!fs.existsSync(plistPath)) continue;
    const content = fs.readFileSync(plistPath, 'utf-8');
    const match = content.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/
    );
    if (match && match[1] && !match[1].includes('$(')) {
      return match[1];
    }
  }
  throw new Error(
    '[rn-control-center] Could not infer bundleId from any Info.plist. ' +
      'Set "bundleId" explicitly in package.json rnControlCenter section.'
  );
}
