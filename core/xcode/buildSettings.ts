import type { PBXProject, PBXNativeTarget } from 'xcode';
import './types';

/**
 * 타겟의 모든 build configuration(Debug, Release 등)에 같은 설정값들을 일괄 적용한다.
 *
 * pbxproj 구조:
 *   PBXNativeTarget(타겟)
 *     └─ buildConfigurationList → XCConfigurationList(uuid)
 *           └─ buildConfigurations: [Debug uuid, Release uuid, ...]
 *                 └─ 각 XCBuildConfiguration에 buildSettings dict
 *
 * 같은 키로 이미 값이 있으면 덮어씀.
 */
export function setTargetBuildSettings(
  project: PBXProject,
  targetUuid: string,
  settings: Record<string, string>
): void {
  const objects = project.hash.project.objects;

  const targetSection = project.pbxNativeTargetSection();
  const target = targetSection[targetUuid] as PBXNativeTarget | undefined;
  if (!target || typeof target === 'string') {
    throw new Error(`Target ${targetUuid} not found.`);
  }

  const configListUuid = (target as Record<string, unknown>).buildConfigurationList as
    | string
    | undefined;
  if (!configListUuid) {
    throw new Error(`Target ${targetUuid} has no buildConfigurationList.`);
  }

  const configListSection = objects['XCConfigurationList'] ?? {};
  const configList = configListSection[configListUuid] as
    | Record<string, unknown>
    | undefined;
  if (!configList || typeof configList === 'string') {
    throw new Error(
      `XCConfigurationList ${configListUuid} not found for target ${targetUuid}.`
    );
  }

  const buildConfigs =
    (configList.buildConfigurations as Array<{ value: string; comment?: string }>) ?? [];

  const buildConfigSection = objects['XCBuildConfiguration'] ?? {};
  for (const ref of buildConfigs) {
    const config = buildConfigSection[ref.value] as Record<string, unknown> | undefined;
    if (!config || typeof config === 'string') continue;
    const buildSettings = ((config.buildSettings as Record<string, unknown>) ??= {});
    for (const [key, value] of Object.entries(settings)) {
      buildSettings[key] = quoteIfNeeded(value);
    }
  }
}

/**
 * pbxproj 형식상 공백/슬래시 등이 있으면 큰따옴표로 감싸야 한다.
 * 단순 식별자는 그대로 둔다.
 */
function quoteIfNeeded(value: string): string {
  if (/^[A-Za-z0-9_.-]+$/.test(value)) {
    return value;
  }
  // 이미 따옴표로 감싸진 값은 다시 감싸지 않음
  if (value.startsWith('"') && value.endsWith('"')) {
    return value;
  }
  return `"${value}"`;
}
