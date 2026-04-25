import plist, { type PlistValue } from 'plist';

export interface GenerateEntitlementsOptions {
  /** 메인 앱과 위젯이 공유할 App Group ID. */
  appGroupId: string;
  /** 기존 엔타이틀먼트와 병합할 키 (옵션). */
  merge?: Record<string, unknown>;
}

/**
 * 메인 앱 + 위젯 익스텐션이 동일한 entitlements를 가져야
 * App Group UserDefaults가 둘 사이에 공유됨.
 *
 * 같은 파일을 두 타겟이 참조하든, 똑같은 내용으로 두 파일을 두든 무방.
 */
export function generateAppGroupEntitlements(
  opts: GenerateEntitlementsOptions
): string {
  const root: Record<string, unknown> = {
    'com.apple.security.application-groups': [opts.appGroupId],
    ...(opts.merge ?? {}),
  };
  return plist.build(root as unknown as PlistValue, { indent: '\t' });
}

/**
 * 기존 entitlement 파일이 있으면 그 위에 App Group을 안전하게 병합.
 */
export function mergeAppGroupIntoEntitlements(
  existingPlistXml: string,
  appGroupId: string
): string {
  const parsed = plist.parse(existingPlistXml) as Record<string, unknown>;
  const existing =
    (parsed['com.apple.security.application-groups'] as string[] | undefined) ?? [];
  const merged = Array.from(new Set([...existing, appGroupId]));
  parsed['com.apple.security.application-groups'] = merged;
  return plist.build(parsed as unknown as PlistValue, { indent: '\t' });
}
