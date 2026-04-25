import plist, { type PlistValue } from 'plist';

export interface GeneratePlistOptions {
  /** Widget Extension의 bundle ID. 디스플레이 이름 보정에 쓰임. */
  extensionBundleName?: string;
  /** SDK 호환을 위한 추가 키. 사용자 커스텀 가능. */
  extra?: Record<string, unknown>;
}

/**
 * Widget Extension용 Info.plist 문자열 생성.
 *
 * NSExtensionPointIdentifier = com.apple.widgetkit-extension 이 핵심.
 * iOS가 이 값을 보고 ControlWidget으로 인식.
 */
export function generateExtensionInfoPlist(opts: GeneratePlistOptions = {}): string {
  const root: Record<string, unknown> = {
    NSExtension: {
      NSExtensionPointIdentifier: 'com.apple.widgetkit-extension',
    },
  };

  if (opts.extensionBundleName) {
    root.CFBundleDisplayName = opts.extensionBundleName;
  }

  if (opts.extra) {
    Object.assign(root, opts.extra);
  }

  return plist.build(root as unknown as PlistValue, { indent: '  ' });
}
